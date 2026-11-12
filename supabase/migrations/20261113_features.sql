-- FuhsiMarket feature migration: grocery units, per-seller delivery fees,
-- full-text catalogue search, real reviews/ratings, and the missing escrow RPCs
-- (`confirm_order_group` / `dispute_order`) that the app already calls.
--
-- Apply this in the Supabase SQL Editor before deploying the matching app code.
-- It is idempotent: every object uses IF NOT EXISTS / OR REPLACE.

-- ---------------------------------------------------------------------------
-- 1) Product selling units and per-seller delivery fees
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists unit text;
alter table public.products add column if not exists delivery_fee_kobo bigint;

-- A seller can type any short unit ("cup", "congo", "paint bucket", ...), but
-- strip absurd values and reject negative delivery charges.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_unit_length_chk'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_unit_length_chk
      check (unit is null or char_length(unit) between 1 and 40);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'products_delivery_fee_nonneg_chk'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_delivery_fee_nonneg_chk
      check (delivery_fee_kobo is null or delivery_fee_kobo >= 0);
  end if;
end;
$$;

-- NULL delivery_fee_kobo means "use the platform default (₦500)"; 0 means free.
comment on column public.products.unit is
  'Selling unit (cup, congo, kg, piece...). Price is per unit.';
comment on column public.products.delivery_fee_kobo is
  'This seller''s doorstep delivery fee in kobo. NULL = platform default ₦500, 0 = free. Charged once per seller per order.';

-- ---------------------------------------------------------------------------
-- 2) Search across title, description, category AND seller name
--
-- profiles is owner-scoped by RLS, so the browser cannot join it. This
-- SECURITY DEFINER function performs the join server-side and returns only
-- product rows (no profile data), so seller names are searchable without
-- exposing bank details or matric numbers.
-- ---------------------------------------------------------------------------
create or replace function public.search_products(p_query text)
returns setof public.products
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_term text;
begin
  -- PostgREST-style structural characters and LIKE wildcards are not useful in
  -- a campus search and could otherwise turn "50%" into "match everything".
  v_term := lower(regexp_replace(coalesce(p_query, ''), '[%,()_\\]', ' ', 'g'));
  v_term := trim(regexp_replace(v_term, '\s+', ' ', 'g'));

  if v_term = '' then
    return;
  end if;

  return query
    select p.*
    from public.products p
    left join public.profiles pr on pr.id = p.seller_id
    where p.is_available = true
      and (
        lower(coalesce(p.title, '')) like '%' || v_term || '%'
        or lower(coalesce(p.description, '')) like '%' || v_term || '%'
        or lower(coalesce(p.category, '')) like '%' || v_term || '%'
        or lower(coalesce(pr.full_name, '')) like '%' || v_term || '%'
      );
end;
$$;

revoke execute on function public.search_products(text) from public;
grant execute on function public.search_products(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Verified-purchase reviews and a public aggregate rating view
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reviewer_id uuid not null,
  -- One order row = one product bought by one buyer, so an order row can back
  -- exactly one review. This makes "already reviewed" idempotent at the DB.
  order_id uuid not null references public.orders(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists reviews_product_idx on public.reviews(product_id);
create index if not exists reviews_reviewer_idx on public.reviews(reviewer_id);

alter table public.reviews enable row level security;

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
  for select to anon, authenticated
  using (true);

-- Only the buyer on a completed order may review it, and only for the product
-- that row actually represents. This is the verified-purchase guarantee.
drop policy if exists reviews_insert_verified on public.reviews;
create policy reviews_insert_verified on public.reviews
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.buyer_id = auth.uid()
        and o.product_id = product_id
        and o.status = 'completed'
    )
  );

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (reviewer_id = auth.uid());

-- Aggregate ratings are safe to expose publicly. Product cards read this view
-- instead of the hardcoded 4.8 that used to be rendered for every listing.
create or replace view public.product_ratings
with (security_invoker = true) as
select
  product_id,
  round(avg(rating)::numeric, 2) as rating_avg,
  count(*)::int as review_count
from public.reviews
group by product_id;

grant select on public.product_ratings to anon, authenticated;

-- `escrow_transactions.status` is an enum in the live schema. The two terminal
-- values the functions below write must exist before they can run. This block
-- is a no-op when they are already present (and does nothing at all if the
-- column is plain text).
do $$
declare
  v_schema text;
  v_type text;
begin
  select n.nspname, t.typname
    into v_schema, v_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
   where c.oid = 'public.escrow_transactions'::regclass
     and a.attname = 'status'
     and t.typtype = 'e';

  if v_type is not null then
    if not exists (
      select 1 from pg_enum e
       where e.enumtypid = format('%I.%I', v_schema, v_type)::regtype
         and e.enumlabel = 'released'
    ) then
      execute format('alter type %I.%I add value %L', v_schema, v_type, 'released');
    end if;

    if not exists (
      select 1 from pg_enum e
       where e.enumtypid = format('%I.%I', v_schema, v_type)::regtype
         and e.enumlabel = 'refunded'
    ) then
      execute format('alter type %I.%I add value %L', v_schema, v_type, 'refunded');
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) confirm_order_group — buyer confirms receipt, escrow is released
--
-- Called by /api/orders/complete and /api/orders/complete-group through the
-- service-role client. It completes EVERY row of one order_ref (a combined
-- order can span several sellers), credits each seller's wallet with goods
-- minus platform commission, marks the escrow ledger released, and notifies
-- the seller. The status='ready_for_pickup' guard + row locks make a repeat or
-- concurrent confirmation a no-op that returns false.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order_group(
  p_order_ref text,
  p_buyer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_found boolean := false;
begin
  if p_order_ref is null or p_buyer_id is null then
    return false;
  end if;

  for v_order in
    select id, seller_id, amount_kobo, platform_fee_kobo
      from public.orders
     where order_ref = p_order_ref
       and buyer_id = p_buyer_id
       and status = 'ready_for_pickup'
     for update
  loop
    v_found := true;

    -- Seller keeps the goods value minus the platform commission. Delivery and
    -- the buyer service fee are escrowed separately and retained by the
    -- platform, so they never touch the seller's wallet.
    insert into public.wallets (user_id, balance)
    values (
      v_order.seller_id,
      greatest(
        coalesce(v_order.amount_kobo, 0) - coalesce(v_order.platform_fee_kobo, 0),
        0
      )
    )
    on conflict (user_id)
    do update set balance = public.wallets.balance + excluded.balance;

    update public.orders
       set status = 'completed'
     where id = v_order.id;

    -- Goods rows are per-order; delivery/fee rows hang off the first order row
    -- of the combined order, so they are released here as well.
    update public.escrow_transactions
       set status = 'released'
     where order_id = v_order.id
       and status = 'held';

    insert into public.notifications (user_id, order_id, type, title, message)
    values (
      v_order.seller_id,
      v_order.id,
      'order_completed',
      'Order completed',
      'The buyer confirmed receipt. Your wallet has been credited.'
    )
    on conflict do nothing;
  end loop;

  return v_found;
end;
$$;

revoke execute on function public.confirm_order_group(text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_order_group(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5) dispute_order — buyer opens a dispute and is refunded to their wallet
--
-- Called by /api/orders/dispute through the service-role client. Only the
-- buyer on their own order in a disputable state can call it; the status guard
-- makes a repeat dispute a no-op. Any still-held escrow rows for that order
-- (goods and, if attached, delivery/fees) are refunded to the buyer's wallet.
-- ---------------------------------------------------------------------------
create or replace function public.dispute_order(
  p_order_id uuid,
  p_buyer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_refund_kobo bigint := 0;
begin
  select *
    into v_order
    from public.orders
   where id = p_order_id
     and buyer_id = p_buyer_id
     and status in ('in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered')
   for update;

  if not found then
    return false;
  end if;

  select coalesce(sum(amount_kobo), 0)
    into v_refund_kobo
    from public.escrow_transactions
   where order_id = p_order_id
     and status = 'held';

  update public.escrow_transactions
     set status = 'refunded'
   where order_id = p_order_id
     and status = 'held';

  if v_refund_kobo > 0 then
    insert into public.wallets (user_id, balance)
    values (p_buyer_id, v_refund_kobo)
    on conflict (user_id)
    do update set balance = public.wallets.balance + excluded.balance;
  end if;

  update public.orders
     set status = 'disputed'
   where id = p_order_id;

  insert into public.notifications (user_id, order_id, type, title, message)
  values (
    v_order.seller_id,
    p_order_id,
    'order_disputed',
    'Order disputed',
    'The buyer opened a dispute. The payment is on hold until it is resolved.'
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke execute on function public.dispute_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.dispute_order(uuid, uuid) to service_role;
