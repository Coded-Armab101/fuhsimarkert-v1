-- 20261111_admin_console_indexes.sql
--
-- Supporting indexes for the operator console (`/admin-dashboard`).
--
-- Why this file uses DO blocks instead of plain CREATE INDEX statements:
-- the console is deployed against more than one database snapshot, and some of
-- them do NOT have `public.profiles.created_at` (the original profiles table
-- only guaranteed `updated_at`). A plain
--     create index ... on public.profiles (created_at)
-- therefore fails with:
--     ERROR: 42703: column "created_at" does not exist
-- Each index below is created only after confirming that its columns exist, so
-- this migration is safe on every deployment and safe to re-run.
--
-- Signup dates themselves no longer depend on this column: the console reads
-- them from `auth.users.created_at` through the service-role client.
--
-- Apply with `supabase db push`, or paste this whole file into the SQL editor.

do $$
begin
  -- Signups ------------------------------------------------------------------
  -- Optional: only present in newer profile schemas.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'created_at'
  ) then
    execute 'create index if not exists profiles_created_at_idx
               on public.profiles (created_at desc)';
  else
    raise notice 'profiles.created_at missing: skipping profiles_created_at_idx (console uses auth.users for signup dates).';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'verification_status'
  ) then
    execute 'create index if not exists profiles_verification_status_idx
               on public.profiles (verification_status)
               where verification_status is not null';
  end if;

  -- Orders: activity, fulfilment health and per-person totals ----------------
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'status'
  ) then
    execute 'create index if not exists orders_status_idx
               on public.orders (status)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'created_at'
  ) then
    execute 'create index if not exists orders_created_at_idx
               on public.orders (created_at desc)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'buyer_id'
  ) then
    execute 'create index if not exists orders_buyer_id_idx
               on public.orders (buyer_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'seller_id'
  ) then
    execute 'create index if not exists orders_seller_id_idx
               on public.orders (seller_id)';
  end if;

  -- Payout queue -------------------------------------------------------------
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'withdrawals' and column_name = 'status'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'withdrawals' and column_name = 'created_at'
  ) then
    execute 'create index if not exists withdrawals_status_created_at_idx
               on public.withdrawals (status, created_at desc)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'withdrawals' and column_name = 'seller_id'
  ) then
    execute 'create index if not exists withdrawals_seller_id_idx
               on public.withdrawals (seller_id)';
  end if;

  -- Catalogue health ---------------------------------------------------------
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'stock'
  ) then
    execute 'create index if not exists products_stock_idx
               on public.products (stock)
               where stock is not null';
  end if;
end $$;
