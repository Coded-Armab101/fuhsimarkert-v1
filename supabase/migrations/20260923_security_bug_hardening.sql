-- FUHSI Market security/consistency hardening.
-- Review existing RLS/policies before applying to production.

-- 1) Idempotent, atomic stock fulfillment.
create table if not exists public.marketplace_fulfillments (
  order_ref text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (order_ref, product_id)
);

alter table public.marketplace_fulfillments enable row level security;
revoke all on public.marketplace_fulfillments from anon, authenticated;

create or replace function public.fulfill_marketplace_item(
  p_order_ref text,
  p_product_id uuid,
  p_quantity integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  updated_count integer;
begin
  if p_order_ref is null or length(p_order_ref) = 0 or length(p_order_ref) > 200 then
    raise exception 'invalid order reference';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'invalid quantity';
  end if;

  insert into public.marketplace_fulfillments(order_ref, product_id, quantity)
  values (p_order_ref, p_product_id, p_quantity)
  on conflict (order_ref, product_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return true; -- already fulfilled; idempotent retry
  end if;

  update public.products
     set stock = stock - p_quantity,
         is_sold = case when stock - p_quantity <= 0 then true else is_sold end
   where id = p_product_id
     and stock is not null
     and stock >= p_quantity;
  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'insufficient stock';
  end if;

  return true;
end;
$$;

revoke all on function public.fulfill_marketplace_item(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.fulfill_marketplace_item(text, uuid, integer) to service_role;

-- 2) Atomic admin withdrawal processing. Prevents two admin tabs from both
-- refunding the same rejected withdrawal.
create or replace function public.process_withdrawal(
  p_withdrawal_id uuid,
  p_action text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.withdrawals%rowtype;
  changed integer;
begin
  if p_action not in ('approve', 'reject') then
    raise exception 'invalid withdrawal action';
  end if;

  select * into w
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if not found or w.status <> 'pending' then
    return false;
  end if;

  if p_action = 'reject' then
    update public.wallets
       set balance = balance + w.amount_kobo
     where user_id = w.seller_id;
    get diagnostics changed = row_count;
    if changed <> 1 then
      raise exception 'seller wallet not found';
    end if;
  end if;

  update public.withdrawals
     set status = case when p_action = 'reject' then 'rejected' else 'paid' end,
         processed_at = now()
   where id = w.id and status = 'pending';
  get diagnostics changed = row_count;

  return changed = 1;
end;
$$;

revoke all on function public.process_withdrawal(uuid, text) from public, anon, authenticated;
grant execute on function public.process_withdrawal(uuid, text) to service_role;

-- 3) Only the server-side RPC may advance order fulfillment state. This blocks
-- direct authenticated REST updates such as status='completed' while preserving
-- the existing RLS reads. Service-role writes/RPCs are unaffected.
create or replace function public.guard_order_status_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and new.status is distinct from old.status then
    raise exception 'order status changes must use the server order workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_order_status_changes on public.orders;
create trigger protect_order_status_changes
before update on public.orders
for each row execute function public.guard_order_status_changes();

-- 4) Server workflow for seller status advancement. The API authenticates the
-- caller and invokes this with service_role; the function enforces seller
-- ownership and the only legal forward transitions.
create or replace function public.advance_seller_order_status(
  p_order_id uuid,
  p_seller_id uuid,
  p_new_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
begin
  if p_new_status not in ('packing', 'ready_for_pickup') then
    raise exception 'invalid seller status';
  end if;

  select status into old_status
  from public.orders
  where id = p_order_id and seller_id = p_seller_id
  for update;

  if not found then return false; end if;
  if (old_status = 'in_escrow' and p_new_status <> 'packing')
     or (old_status = 'packing' and p_new_status <> 'ready_for_pickup') then
    return false;
  end if;

  update public.orders
     set status = p_new_status,
         status_changed_at = now()
   where id = p_order_id and seller_id = p_seller_id;

  return true;
end;
$$;

revoke all on function public.advance_seller_order_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.advance_seller_order_status(uuid, uuid, text) to service_role;
