-- Security hardening for FUHSI Market.
-- Apply this migration in Supabase SQL Editor before deploying the matching app.

-- 1) Atomic stock decrement. Prevents two simultaneous successful payments from
-- both reading stock=N and writing an incorrect absolute stock value.
create or replace function public.decrement_product_stock(
  p_product_id uuid,
  p_quantity integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'invalid quantity';
  end if;

  update public.products
     set stock = stock - p_quantity,
         is_sold = (stock - p_quantity <= 0)
   where id = p_product_id
     and stock is not null
     and stock >= p_quantity
   returning stock into remaining;

  if not found then
    raise exception 'insufficient stock';
  end if;

  return remaining;
end;
$$;

revoke execute on function public.decrement_product_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_product_stock(uuid, integer) to service_role;

-- 2) Atomic seller withdrawal creation. The balance deduction and withdrawal
-- row are one database transaction, so a failed insert cannot strand funds.
create or replace function public.create_seller_withdrawal(
  p_seller_id uuid,
  p_amount_kobo bigint,
  p_bank_name text,
  p_account_number text,
  p_account_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  withdrawal_id uuid;
begin
  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'invalid withdrawal amount';
  end if;
  if p_account_number !~ '^[0-9]{10}$' then
    raise exception 'invalid account number';
  end if;

  if exists (
    select 1 from public.withdrawals
    where seller_id = p_seller_id and status = 'pending'
  ) then
    raise exception 'pending withdrawal already exists';
  end if;

  update public.wallets
     set balance = balance - p_amount_kobo
   where user_id = p_seller_id
     and balance >= p_amount_kobo;

  if not found then
    raise exception 'insufficient wallet balance';
  end if;

  insert into public.withdrawals (
    seller_id, amount_kobo, bank_name, account_number, account_name, status
  ) values (
    p_seller_id, p_amount_kobo, p_bank_name, p_account_number, p_account_name, 'pending'
  ) returning id into withdrawal_id;

  return withdrawal_id;
end;
$$;

revoke execute on function public.create_seller_withdrawal(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.create_seller_withdrawal(uuid, bigint, text, text, text) to service_role;

-- 3) Atomic admin withdrawal decision. Rejecting refunds exactly once; approving
-- only transitions pending -> paid. The API performs the admin identity check,
-- while this function is intentionally service-role-only.
create or replace function public.process_seller_withdrawal(
  p_withdrawal_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
begin
  select id, seller_id, amount_kobo, status
    into w
    from public.withdrawals
   where id = p_withdrawal_id
   for update;

  if not found then raise exception 'withdrawal not found'; end if;
  if w.status <> 'pending' then raise exception 'withdrawal already processed'; end if;

  if p_action = 'approve' then
    update public.withdrawals
       set status = 'paid', processed_at = now()
     where id = w.id and status = 'pending';
    return 'approved';
  elsif p_action = 'reject' then
    update public.wallets
       set balance = balance + w.amount_kobo
     where user_id = w.seller_id;
    if not found then raise exception 'seller wallet not found'; end if;

    update public.withdrawals
       set status = 'rejected', processed_at = now()
     where id = w.id and status = 'pending';
    return 'rejected';
  end if;

  raise exception 'invalid withdrawal action';
end;
$$;

revoke execute on function public.process_seller_withdrawal(uuid, text) from public, anon, authenticated;
grant execute on function public.process_seller_withdrawal(uuid, text) to service_role;

-- 4) Lock down the high-value marketplace tables. End users may read only rows
-- belonging to them (orders/wallets/withdrawals/notifications) and may browse
-- available products. Money/order mutations go through server-side RPC/API code.
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.wallets enable row level security;
alter table public.withdrawals enable row level security;
alter table public.notifications enable row level security;

-- Replace all existing policies on these high-value tables with explicit least-privilege policies.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['products','orders','wallets','withdrawals','notifications'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy products_select_authenticated on public.products
  for select to authenticated
  using (is_available = true or seller_id = auth.uid());
create policy products_insert_owner on public.products
  for insert to authenticated
  with check (
    seller_id = auth.uid() and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_approved_seller = true
    )
  );
create policy products_update_owner on public.products
  for update to authenticated
  using (seller_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_approved_seller = true
  ))
  with check (seller_id = auth.uid());
create policy products_delete_owner on public.products
  for delete to authenticated
  using (seller_id = auth.uid() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_approved_seller = true
  ));

create policy orders_select_participant on public.orders
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

create policy wallets_select_owner on public.wallets
  for select to authenticated
  using (user_id = auth.uid());

create policy withdrawals_select_owner on public.withdrawals
  for select to authenticated
  using (seller_id = auth.uid());

create policy notifications_select_owner on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- 5) Protect profile privilege columns at the database boundary. A malicious
-- client must not be able to turn itself into an admin/approved seller by
-- writing directly through the anon/authenticated Supabase API.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('service_role', 'postgres') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) or coalesce(new.is_seller, false) or
       coalesce(new.seller_active, false) or new.subscription_expires_at is not null or
       coalesce(new.is_approved_seller, false) or new.storage_quota is not null then
      raise exception 'server-managed profile fields cannot be set by clients';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.is_admin is distinct from old.is_admin or
       new.is_seller is distinct from old.is_seller or
       new.seller_active is distinct from old.seller_active or
       new.subscription_expires_at is distinct from old.subscription_expires_at or
       new.is_approved_seller is distinct from old.is_approved_seller or
       new.storage_quota is distinct from old.storage_quota or
       new.verification_reviewed_at is distinct from old.verification_reviewed_at or
       new.verification_reject_reason is distinct from old.verification_reject_reason then
      raise exception 'server-managed profile fields cannot be changed by clients';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
before insert or update on public.profiles
for each row execute function public.protect_profile_privileges();


-- 6) Do not trust the client-side image upload helper as a security boundary.
-- Product image URLs must point to this application's Supabase product-images
-- storage path, preventing sellers from bypassing the UI and storing arbitrary
-- tracking/hotlink URLs directly through the REST API.
create or replace function public.validate_product_image_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.image_url is not null and new.image_url !~ '^https://[^/]+/storage/v1/object/public/product-images/' then
    raise exception 'product images must use the marketplace storage bucket';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_product_image_url on public.products;
create trigger validate_product_image_url
before insert or update of image_url on public.products
for each row execute function public.validate_product_image_url();

-- 7) Idempotency constraints required by the payment/order code.
alter table public.orders add column if not exists product_id uuid references public.products(id) on delete restrict;
alter table public.orders alter column listing_id drop not null;
create unique index if not exists orders_order_ref_product_id_key
  on public.orders(order_ref, product_id);
create unique index if not exists subscriptions_reference_key
  on public.subscriptions(reference);
create unique index if not exists notifications_user_order_type_uidx
  on public.notifications(user_id, order_id, type);
