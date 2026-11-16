-- Broadcasts + product options (2026-11-17).
--
-- 1. Products can carry per-product size/colour options (free text arrays).
-- 2. Carts and orders are identified by (product, variant_key) so a buyer can
--    order two sizes of the same shirt in one checkout.
-- 3. Admin broadcasts with an optional schedule and per-user dismissal.
--
-- Apply in the Supabase SQL Editor before deploying the matching app code.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Product options
-- ---------------------------------------------------------------------------
alter table public.products add column if not exists sizes text[] not null default '{}';
alter table public.products add column if not exists colors text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.products'::regclass
       and conname = 'products_option_count_check'
  ) then
    alter table public.products
      add constraint products_option_count_check
      check (cardinality(sizes) <= 20 and cardinality(colors) <= 20);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Cart lines: one row per product + variant
-- ---------------------------------------------------------------------------
alter table public.carts add column if not exists size text;
alter table public.carts add column if not exists color text;
alter table public.carts add column if not exists variant_key text;

update public.carts
   set size = nullif(regexp_replace(btrim(size), '\s+', ' ', 'g'), ''),
       color = nullif(regexp_replace(btrim(color), '\s+', ' ', 'g'), '')
 where size is not null or color is not null;

update public.carts
   set variant_key =
     case
       when coalesce(btrim(size), '') = '' and coalesce(btrim(color), '') = '' then ''
       else btrim(coalesce(size, '')) || '::' || btrim(coalesce(color, ''))
     end
 where variant_key is distinct from
      case
        when coalesce(btrim(size), '') = '' and coalesce(btrim(color), '') = '' then ''
        else btrim(coalesce(size, '')) || '::' || btrim(coalesce(color, ''))
      end;

alter table public.carts alter column variant_key set default '';
alter table public.carts alter column variant_key set not null;

do $$
declare
  r record;
begin
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
       ) in (
         array['user_id']::text[],
         array['product_id', 'user_id']::text[]
       )
  loop
    execute format('alter table public.carts drop constraint %I', r.conname);
  end loop;

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
       ) in (
         array['user_id']::text[],
         array['product_id', 'user_id']::text[]
       )
  loop
    execute format('drop index if exists public.%I', r.index_name);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.carts'::regclass
       and conname = 'carts_variant_fields_check'
  ) then
    alter table public.carts
      add constraint carts_variant_fields_check
      check (
        (size is null or char_length(size) between 1 and 40)
        and (color is null or char_length(color) between 1 and 40)
        and variant_key = case
          when size is null and color is null then ''
          else coalesce(size, '') || '::' || coalesce(color, '')
        end
      );
  end if;
end;
$$;

-- Collapse any duplicate rows that predate the new key.
delete from public.carts a
 using public.carts b
 where a.ctid < b.ctid
   and a.user_id = b.user_id
   and a.product_id = b.product_id
   and a.variant_key = b.variant_key;

create unique index if not exists carts_user_product_variant_key
  on public.carts(user_id, product_id, variant_key);

-- ---------------------------------------------------------------------------
-- 3) Order lines: one row per product + variant + seller
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists size text;
alter table public.orders add column if not exists color text;
alter table public.orders add column if not exists variant_key text;

update public.orders
   set size = nullif(regexp_replace(btrim(size), '\s+', ' ', 'g'), ''),
       color = nullif(regexp_replace(btrim(color), '\s+', ' ', 'g'), '')
 where size is not null or color is not null;

update public.orders
   set variant_key =
     case
       when coalesce(btrim(size), '') = '' and coalesce(btrim(color), '') = '' then ''
       else btrim(coalesce(size, '')) || '::' || btrim(coalesce(color, ''))
     end
 where variant_key is distinct from
      case
        when coalesce(btrim(size), '') = '' and coalesce(btrim(color), '') = '' then ''
        else btrim(coalesce(size, '')) || '::' || btrim(coalesce(color, ''))
      end;

alter table public.orders alter column variant_key set default '';
alter table public.orders alter column variant_key set not null;

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
       ) in (
         array['order_ref']::text[],
         array['order_ref', 'product_id']::text[]
       )
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
       ) in (
         array['order_ref']::text[],
         array['order_ref', 'product_id']::text[]
       )
  loop
    execute format('drop index if exists public.%I', r.index_name);
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass
       and conname = 'orders_variant_fields_check'
  ) then
    alter table public.orders
      add constraint orders_variant_fields_check
      check (
        (size is null or char_length(size) between 1 and 40)
        and (color is null or char_length(color) between 1 and 40)
        and variant_key = case
          when size is null and color is null then ''
          else coalesce(size, '') || '::' || coalesce(color, '')
        end
      );
  end if;
end;
$$;

delete from public.orders a
 using public.orders b
 where a.ctid < b.ctid
   and a.order_ref = b.order_ref
   and a.product_id = b.product_id
   and a.variant_key = b.variant_key;

create unique index if not exists orders_ref_product_variant_key
  on public.orders(order_ref, product_id, variant_key);

-- ---------------------------------------------------------------------------
-- 4) Checkout preflight now understands variants
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
      select 1 from pg_catalog.pg_attribute a
       where a.attrelid = 'public.carts'::regclass
         and a.attname = 'quantity' and not a.attisdropped
    )
    and exists (
      select 1 from pg_catalog.pg_attribute a
       where a.attrelid = 'public.carts'::regclass
         and a.attname = 'variant_key' and not a.attisdropped
    )
    and exists (
      select 1 from pg_catalog.pg_attribute a
       where a.attrelid = 'public.orders'::regclass
         and a.attname = 'variant_key' and not a.attisdropped
    )
    and exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.carts'::regclass
         and i.indisunique
         and i.indnkeyatts = 3
         and (
           select array_agg(a.attname::text order by a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid and a.attnum = any(i.indkey) and a.attnum > 0
         ) = array['product_id', 'user_id', 'variant_key']::text[]
    )
    and exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.orders'::regclass
         and i.indisunique
         and i.indnkeyatts = 3
         and (
           select array_agg(a.attname::text order by a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid and a.attnum = any(i.indkey) and a.attnum > 0
         ) = array['order_ref', 'product_id', 'variant_key']::text[]
    )
    and not exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.carts'::regclass
         and i.indisunique
         and (
           select array_agg(a.attname::text order by a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid and a.attnum = any(i.indkey) and a.attnum > 0
         ) in (
           array['user_id']::text[],
           array['product_id', 'user_id']::text[]
         )
    )
    and not exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_class t on t.oid = i.indrelid
       where t.oid = 'public.orders'::regclass
         and i.indisunique
         and (
           select array_agg(a.attname::text order by a.attname::text)
             from pg_catalog.pg_attribute a
            where a.attrelid = t.oid and a.attnum = any(i.indkey) and a.attnum > 0
         ) in (
           array['order_ref']::text[],
           array['order_ref', 'product_id']::text[]
         )
    );
$$;

revoke execute on function public.marketplace_checkout_ready()
  from public, anon, authenticated;
grant execute on function public.marketplace_checkout_ready()
  to service_role;

-- ---------------------------------------------------------------------------
-- 5) Admin broadcasts
-- ---------------------------------------------------------------------------
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'all'
    check (audience in ('all', 'buyers', 'sellers')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcasts_active_window_idx
  on public.broadcasts(is_active, starts_at, ends_at);

create index if not exists broadcasts_created_by_idx
  on public.broadcasts(created_by);

create table if not exists public.broadcast_dismissals (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);

create index if not exists broadcast_dismissals_user_idx
  on public.broadcast_dismissals(user_id);

alter table public.broadcasts enable row level security;
alter table public.broadcast_dismissals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.broadcasts'::regclass
       and conname = 'broadcasts_content_length_check'
  ) then
    alter table public.broadcasts
      add constraint broadcasts_content_length_check
      check (
        char_length(btrim(title)) between 1 and 120
        and char_length(btrim(message)) between 1 and 2000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.broadcasts'::regclass
       and conname = 'broadcasts_time_window_check'
  ) then
    alter table public.broadcasts
      add constraint broadcasts_time_window_check
      check (ends_at is null or ends_at > starts_at);
  end if;
end;
$$;

-- No client policies: broadcasts are read/written through the authenticated
-- server routes using the service-role client. RLS blocks direct anon access.

comment on table public.broadcasts is
  'Admin announcements shown as a dismissible modal. starts_at/ends_at schedule the display window.';
comment on column public.broadcasts.audience is
  'all = everyone, sellers = active/approved sellers, buyers = accounts that are not sellers.';
