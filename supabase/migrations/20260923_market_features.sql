-- FUHSI Market feature hardening: seller KYC, order notifications and wallet checkout.

-- 1) Seller KYC document metadata.
alter table public.profiles
  add column if not exists verification_id_type text;

alter table public.profiles
  add constraint profiles_verification_id_type_check
  check (verification_id_type is null or verification_id_type in ('student_id', 'nin'));

-- 2) Buyer notifications. Notifications are user-owned and never writable
-- directly by clients; server-side service-role code creates them.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  order_id uuid null references public.orders(id) on delete cascade,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (type in ('order_new', 'order_ready', 'order_update', 'system'))
);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('order_new', 'order_ready', 'order_update', 'system'));

create unique index if not exists notifications_user_order_type_uidx
  on public.notifications(user_id, order_id, type)
  where order_id is not null;
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
revoke insert, update, delete on public.notifications from anon, authenticated;

-- 3) Atomic wallet debit. The unique reference makes retries safe and the row
-- lock prevents two concurrent checkouts from spending the same balance.
create table if not exists public.wallet_debits (
  order_ref text primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  created_at timestamptz not null default now()
);

alter table public.wallet_debits enable row level security;
revoke all on public.wallet_debits from anon, authenticated;

create or replace function public.debit_wallet(
  p_user_id uuid,
  p_order_ref text,
  p_amount_kobo bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_amount bigint;
  current_balance bigint;
  changed integer;
begin
  if p_user_id is null or p_order_ref is null or length(trim(p_order_ref)) = 0
     or length(p_order_ref) > 200 or p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'invalid wallet debit';
  end if;

  select amount_kobo into existing_amount
  from public.wallet_debits
  where order_ref = p_order_ref;

  if found then
    if existing_amount <> p_amount_kobo then
      raise exception 'wallet debit reference amount mismatch';
    end if;
    return true;
  end if;

  select balance into current_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found or current_balance < p_amount_kobo then
    return false;
  end if;

  update public.wallets
     set balance = balance - p_amount_kobo
   where user_id = p_user_id;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;

  insert into public.wallet_debits(order_ref, user_id, amount_kobo)
  values (p_order_ref, p_user_id, p_amount_kobo);

  return true;
end;
$$;

revoke all on function public.debit_wallet(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.debit_wallet(uuid, text, bigint) to service_role;
