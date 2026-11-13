-- Order lifecycle and checkout reliability (2026-11-16).
--
-- 1. Ensure every order status used by the application exists when `status` is
--    an enum in the live project.
-- 2. Keep notification writes outside escrow/wallet transactions so a cosmetic
--    notification failure can never block a release or refund.
-- 3. Add a service-only checkout preflight. The API calls it before Paystack so
--    a missing legacy multi-item migration cannot produce a paid/no-order case.

alter table public.orders add column if not exists status_changed_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;

-- Add required values only when orders.status is an enum. Plain-text schemas
-- need no alteration.
do $$
declare
  v_schema text;
  v_type text;
  v_label text;
begin
  select n.nspname, t.typname
    into v_schema, v_type
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_type t on t.oid = a.atttypid
   where c.oid = 'public.orders'::regclass
     and a.attname = 'status'
     and t.typtype = 'e';

  if v_type is not null then
    foreach v_label in array array[
      'in_escrow',
      'packing',
      'ready_for_pickup',
      'confirmed',
      'delivered',
      'completed',
      'disputed',
      'cancelled',
      'rejected'
    ]
    loop
      if not exists (
        select 1
          from pg_catalog.pg_enum e
         where e.enumtypid = format('%I.%I', v_schema, v_type)::regtype
           and e.enumlabel = v_label
      ) then
        execute format(
          'alter type %I.%I add value %L',
          v_schema,
          v_type,
          v_label
        );
      end if;
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkout schema preflight
-- ---------------------------------------------------------------------------
create or replace function public.marketplace_checkout_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
        from pg_catalog.pg_attribute a
       where a.attrelid = 'public.carts'::regclass
         and a.attname = 'quantity'
         and not a.attisdropped
    )
    and exists (
      select 1
        from pg_catalog.pg_index i
        join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.carts'::regclass
         and i.indisunique
         and i.indnkeyatts = 2
         and (
           select array_agg(a.attname::text order by a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid
              and a.attnum = any(i.indkey)
              and a.attnum > 0
         ) = array['product_id', 'user_id']::text[]
    )
    and not exists (
      select 1
        from pg_catalog.pg_index i
        join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.carts'::regclass
         and i.indisunique
         and i.indnkeyatts = 1
         and (
           select array_agg(a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid
              and a.attnum = any(i.indkey)
              and a.attnum > 0
         ) = array['user_id']::text[]
    )
    and exists (
      select 1
        from pg_catalog.pg_index i
        join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.orders'::regclass
         and i.indisunique
         and i.indnkeyatts = 2
         and (
           select array_agg(a.attname::text order by a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid
              and a.attnum = any(i.indkey)
              and a.attnum > 0
         ) = array['order_ref', 'product_id']::text[]
    )
    and not exists (
      select 1
        from pg_catalog.pg_index i
        join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.orders'::regclass
         and i.indisunique
         and i.indnkeyatts = 1
         and (
           select array_agg(a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid
              and a.attnum = any(i.indkey)
              and a.attnum > 0
         ) = array['order_ref']::text[]
    );
$$;

revoke execute on function public.marketplace_checkout_ready()
  from public, anon, authenticated;
grant execute on function public.marketplace_checkout_ready()
  to service_role;

-- ---------------------------------------------------------------------------
-- Complete a whole combined order atomically.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order_group(
  p_order_ref text,
  p_buyer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller record;
begin
  if p_order_ref is null or p_buyer_id is null then
    return false;
  end if;

  perform o.id
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
   order by o.id
   for update;

  if not found then
    return false;
  end if;

  -- The buyer can release the group only after every seller is ready.
  if exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.status is distinct from 'ready_for_pickup'
  ) then
    return false;
  end if;

  -- Aggregate by seller and lock wallet rows in a stable seller-id order.
  for v_seller in
    select
      o.seller_id,
      sum(
        greatest(
          coalesce(o.amount_kobo, 0) - coalesce(o.platform_fee_kobo, 0),
          0
        )
      )::bigint as payout_kobo
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
     group by o.seller_id
     order by o.seller_id
  loop
    insert into public.wallets (user_id, balance)
    values (v_seller.seller_id, v_seller.payout_kobo)
    on conflict (user_id)
    do update set balance = public.wallets.balance + excluded.balance;
  end loop;

  update public.escrow_transactions e
     set status = 'released'
   where e.status = 'held'
     and e.order_id in (
       select o.id
         from public.orders o
        where o.order_ref = p_order_ref
          and o.buyer_id = p_buyer_id
     );

  update public.orders
     set status = 'completed',
         status_changed_at = now(),
         completed_at = now()
   where order_ref = p_order_ref
     and buyer_id = p_buyer_id;

  return true;
end;
$$;

revoke execute on function public.confirm_order_group(text, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_group(text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Claim and finalize whole-order refunds without notification side effects.
-- ---------------------------------------------------------------------------
create or replace function public.claim_order_refund(
  p_order_ref text,
  p_buyer_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_held bigint := 0;
begin
  if p_order_ref is null or p_buyer_id is null then
    return null;
  end if;

  perform o.id
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
   order by o.id
   for update;

  if not found then
    return null;
  end if;

  if exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and not (
         o.status in (
           'in_escrow',
           'packing',
           'ready_for_pickup',
           'confirmed',
           'delivered'
         )
         or (o.status = 'disputed' and o.refunded_at is null)
       )
  ) then
    return null;
  end if;

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

  select coalesce(sum(e.amount_kobo), 0)::bigint
    into v_held
    from public.escrow_transactions e
    join public.orders o on o.id = e.order_id
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
     and e.status = 'held';

  update public.orders
     set status = 'disputed',
         status_changed_at = now(),
         refund_claimed_at = now()
   where order_ref = p_order_ref
     and buyer_id = p_buyer_id
     and refunded_at is null;

  return v_held;
end;
$$;

revoke execute on function public.claim_order_refund(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_order_refund(text, uuid)
  to service_role;

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
set search_path = ''
as $$
declare
  v_wallet bigint := greatest(coalesce(p_wallet_refund_kobo, 0), 0);
  v_held bigint := 0;
  v_card bigint := 0;
  v_updated integer := 0;
begin
  if p_order_ref is null or p_buyer_id is null then
    return false;
  end if;
  if p_refund_method is null
     or p_refund_method not in ('card', 'wallet', 'card+wallet') then
    return false;
  end if;

  perform o.id
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
   order by o.id
   for update;

  if not found or exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.refunded_at is not null
  ) then
    return false;
  end if;

  select coalesce(sum(e.amount_kobo), 0)::bigint
    into v_held
    from public.escrow_transactions e
    join public.orders o on o.id = e.order_id
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
     and e.status = 'held';

  select coalesce(max(o.refund_card_kobo), 0)::bigint
    into v_card
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id;

  if v_wallet > v_held or v_wallet + v_card <> v_held then
    raise exception 'refund split does not match held escrow';
  end if;

  update public.orders
     set refunded_at = now(),
         refund_method = p_refund_method,
         refund_reference = p_refund_reference,
         status_changed_at = now()
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
       select o.id
         from public.orders o
        where o.order_ref = p_order_ref
          and o.buyer_id = p_buyer_id
     );

  if v_wallet > 0 then
    insert into public.wallets (user_id, balance)
    values (p_buyer_id, v_wallet)
    on conflict (user_id)
    do update set balance = public.wallets.balance + excluded.balance;
  end if;

  return true;
end;
$$;

revoke execute on function public.finalize_order_refund(text, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_order_refund(text, uuid, bigint, text, text)
  to service_role;
