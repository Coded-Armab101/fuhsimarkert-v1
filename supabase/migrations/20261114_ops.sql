-- FuhsiMarket operations migration (2026-11-14).
--
-- Covers:
--   1. Multi-item / multi-seller carts and orders (the "two sellers" bug).
--   2. Card refunds + wallet fallback for disputed orders.
--   3. Automatic Paystack payouts for approved withdrawals.
--   4. Public "verified seller" badges without exposing profiles.
--   5. Product-image bucket limit raised to match the app (5MB per file).
--
-- Apply in the Supabase SQL Editor before deploying the matching app code.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Carts must hold MANY products per buyer
--
-- Older schemas used a single unique key on carts.user_id, which makes a
-- two-item checkout fail: the client deletes then inserts N rows and Postgres
-- rejects the second row. The correct grain is (user_id, product_id).
-- ---------------------------------------------------------------------------
alter table public.carts add column if not exists quantity integer;
update public.carts set quantity = 1 where quantity is null or quantity < 1;
alter table public.carts alter column quantity set default 1;

do $$
declare
  r record;
begin
  -- Drop a single-column UNIQUE/PRIMARY KEY on carts(user_id), if present.
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.carts'::regclass
       and c.contype in ('u', 'p')
       and (
         select array_agg(a.attname::text order by a.attname::text)
           from pg_attribute a
          where a.attrelid = 'public.carts'::regclass
            and a.attnum = any(c.conkey)
       ) = array['user_id']::text[]
  loop
    execute format('alter table public.carts drop constraint %I', r.conname);
  end loop;

  -- Drop a plain single-column unique index on carts(user_id), if present.
  for r in
    select ci.relname as index_name
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_class ci on ci.oid = i.indexrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'carts'
       and i.indisunique
       and not i.indisprimary
       and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
       and (
         select array_agg(a.attname::text order by a.attname::text)
           from pg_attribute a
          where a.attrelid = t.oid
            and a.attnum = any(i.indkey)
       ) = array['user_id']::text[]
  loop
    execute format('drop index if exists public.%I', r.index_name);
  end loop;
end;
$$;

-- Remove any duplicate cart lines that a schema without a composite key might
-- have accumulated, otherwise the new unique index cannot be created.
delete from public.carts a
 using public.carts b
 where a.ctid < b.ctid
   and a.user_id = b.user_id
   and a.product_id = b.product_id;

create unique index if not exists carts_user_id_product_id_key
  on public.carts(user_id, product_id);

-- ---------------------------------------------------------------------------
-- 2) Orders must allow MANY rows per order_ref (one per product/seller)
--
-- The app upserts on (order_ref, product_id). If an older single-column unique
-- constraint on order_ref still exists, the second product's row violates it
-- and the WHOLE insert fails — one product saves, two products "disappear".
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.orders'::regclass
       and c.contype in ('u', 'p')
       and (
         select array_agg(a.attname::text order by a.attname::text)
           from pg_attribute a
          where a.attrelid = 'public.orders'::regclass
            and a.attnum = any(c.conkey)
       ) = array['order_ref']::text[]
  loop
    execute format('alter table public.orders drop constraint %I', r.conname);
  end loop;

  for r in
    select ci.relname as index_name
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_class ci on ci.oid = i.indexrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'orders'
       and i.indisunique
       and not i.indisprimary
       and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
       and (
         select array_agg(a.attname::text order by a.attname::text)
           from pg_attribute a
          where a.attrelid = t.oid
            and a.attnum = any(i.indkey)
       ) = array['order_ref']::text[]
  loop
    execute format('drop index if exists public.%I', r.index_name);
  end loop;
end;
$$;

create unique index if not exists orders_order_ref_product_id_key
  on public.orders(order_ref, product_id);

-- ---------------------------------------------------------------------------
-- 3) Refund bookkeeping
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists refund_method text;
alter table public.orders add column if not exists refund_card_kobo bigint not null default 0;
alter table public.orders add column if not exists refund_claimed_at timestamptz;
alter table public.orders add column if not exists refunded_at timestamptz;
alter table public.orders add column if not exists refund_reference text;

-- ---------------------------------------------------------------------------
-- 4) Payout bookkeeping
-- ---------------------------------------------------------------------------
alter table public.withdrawals add column if not exists bank_code text;
alter table public.withdrawals add column if not exists transfer_reference text;
alter table public.withdrawals add column if not exists transfer_code text;
alter table public.withdrawals add column if not exists transfer_status text;

-- ---------------------------------------------------------------------------
-- 5) Public verified-seller lookup
--
-- profiles RLS is owner-scoped, so the catalogue cannot join it. This returns
-- ONLY the boolean badge (never names, bank details or matric numbers).
-- ---------------------------------------------------------------------------
create or replace function public.verified_seller_ids(p_ids uuid[])
returns table (id uuid, is_verified boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(p.is_approved_seller, false)
    from public.profiles p
   where p.id = any(coalesce(p_ids, '{}'::uuid[]));
$$;

revoke execute on function public.verified_seller_ids(uuid[]) from public;
grant execute on function public.verified_seller_ids(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Group refunds: claim first, then finalize
--
-- `claim_order_refund` atomically moves every row of one order_ref to
-- `disputed` and returns the escrow still held. A repeat call returns NULL
-- unless a previous claim never finalized (refunded_at IS NULL), in which case
-- it returns the still-held amount so the operator can safely retry.
--
-- `finalize_order_refund` marks the held escrow refunded, credits ONLY the
-- wallet share (a card refund is sent to Paystack separately), and records how
-- the money went back. It is idempotent: the second call updates zero rows and
-- returns false, so a retry can never double-credit the wallet.
-- ---------------------------------------------------------------------------
create or replace function public.claim_order_refund(
  p_order_ref text,
  p_buyer_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_held bigint := 0;
  v_rows integer := 0;
begin
  if p_order_ref is null or p_buyer_id is null then
    return null;
  end if;

  -- Lock the whole group so two concurrent disputes serialize.
  perform o.id
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
   for update;

  select count(*) into v_rows
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id;
  if v_rows = 0 then
    return null;
  end if;

  -- Every row must be refundable, or already claimed but not yet finalized.
  if exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and not (
         o.status in ('in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered')
         or (o.status = 'disputed' and o.refunded_at is null)
       )
  ) then
    return null;
  end if;

  -- Another request claimed this refund less than 10 minutes ago. Returning
  -- NULL stops a double-tap from issuing a second card refund. A stale claim
  -- (crashed request) is retryable after the window, and the stored card amount
  -- still prevents a duplicate Paystack call.
  if exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.refund_claimed_at is not null
       and o.refund_claimed_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  select coalesce(sum(e.amount_kobo), 0)
    into v_held
    from public.escrow_transactions e
    join public.orders o on o.id = e.order_id
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
     and e.status = 'held';

  update public.orders
     set status = 'disputed',
         refund_claimed_at = now()
   where order_ref = p_order_ref
     and buyer_id = p_buyer_id
     and (
       status in ('in_escrow', 'packing', 'ready_for_pickup', 'confirmed', 'delivered')
       or (status = 'disputed' and refunded_at is null)
     );

  return v_held;
end;
$$;

revoke execute on function public.claim_order_refund(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_order_refund(text, uuid) to service_role;

create or replace function public.finalize_order_refund(
  p_order_ref text,
  p_buyer_id uuid,
  p_wallet_refund_kobo bigint,
  p_refund_method text,
  p_refund_reference text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet bigint := greatest(coalesce(p_wallet_refund_kobo, 0), 0);
  v_updated integer := 0;
  v_order record;
begin
  if p_order_ref is null or p_buyer_id is null then
    return false;
  end if;

  perform o.id
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
   for update;

  -- Claim the finalize for THIS transaction. If another request already
  -- stamped refunded_at, this update matches zero rows and we stop.
  update public.orders
     set refunded_at = now(),
         refund_method = coalesce(p_refund_method, 'wallet'),
         refund_reference = p_refund_reference
   where order_ref = p_order_ref
     and buyer_id = p_buyer_id
     and status = 'disputed'
     and refunded_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return false;
  end if;

  update public.escrow_transactions e
     set status = 'refunded'
   where e.status = 'held'
     and e.order_id in (
       select o.id from public.orders o
        where o.order_ref = p_order_ref
          and o.buyer_id = p_buyer_id
     );

  if v_wallet > 0 then
    insert into public.wallets (user_id, balance)
    values (p_buyer_id, v_wallet)
    on conflict (user_id)
    do update set balance = public.wallets.balance + excluded.balance;
  end if;

  for v_order in
    select o.id, o.seller_id
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
  loop
    insert into public.notifications (user_id, order_id, type, title, message)
    values (
      v_order.seller_id,
      v_order.id,
      'order_refunded',
      'Order refunded',
      'The buyer reported a problem and the payment was refunded.'
    )
    on conflict do nothing;
  end loop;

  return true;
end;
$$;

revoke execute on function public.finalize_order_refund(text, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.finalize_order_refund(text, uuid, bigint, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7) Product image bucket: 5MB per file, matching utils/upload.ts
-- ---------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'product-images';
