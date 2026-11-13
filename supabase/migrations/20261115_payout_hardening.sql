-- Paystack payout concurrency hardening (2026-11-15).
--
-- A withdrawal must have exactly one active Paystack reference. Without an
-- atomic claim, two admins (or one double-click) can both read `pending` and
-- initiate separate transfers before either request stores its reference.
--
-- This migration also makes withdrawal creation serialize on the seller's
-- wallet row and prevents a rejection from returning money after a transfer
-- has already started.

alter table public.withdrawals
  add column if not exists transfer_claimed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1) Create one pending withdrawal at a time, atomically.
-- ---------------------------------------------------------------------------
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
set search_path = ''
as $$
declare
  v_balance bigint;
  v_withdrawal_id uuid;
begin
  if p_seller_id is null or p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'invalid withdrawal amount';
  end if;
  if coalesce(p_bank_name, '') = '' or coalesce(p_account_name, '') = '' then
    raise exception 'invalid bank details';
  end if;
  if coalesce(p_account_number, '') !~ '^[0-9]{10}$' then
    raise exception 'invalid account number';
  end if;

  -- Serializes simultaneous requests from the same seller. The pending check,
  -- balance deduction and insert then happen in this one short transaction.
  select w.balance
    into v_balance
    from public.wallets w
   where w.user_id = p_seller_id
   for update;

  if not found or v_balance < p_amount_kobo then
    raise exception 'insufficient wallet balance';
  end if;

  if exists (
    select 1
      from public.withdrawals w
     where w.seller_id = p_seller_id
       and w.status = 'pending'
  ) then
    raise exception 'pending withdrawal already exists';
  end if;

  update public.wallets
     set balance = balance - p_amount_kobo
   where user_id = p_seller_id;

  insert into public.withdrawals (
    seller_id,
    amount_kobo,
    bank_name,
    account_number,
    account_name,
    status
  ) values (
    p_seller_id,
    p_amount_kobo,
    trim(p_bank_name),
    p_account_number,
    trim(p_account_name),
    'pending'
  )
  returning id into v_withdrawal_id;

  return v_withdrawal_id;
end;
$$;

revoke execute on function public.create_seller_withdrawal(uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_seller_withdrawal(uuid, bigint, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2) Atomically reserve one Paystack reference for an approval attempt.
--
-- A confirmed failed/reversed/abandoned transfer may be replaced with a fresh
-- reference. Every other state reuses the stored reference, which makes
-- concurrent API requests converge on Paystack's reference idempotency check.
-- ---------------------------------------------------------------------------
create or replace function public.claim_seller_withdrawal_transfer(
  p_withdrawal_id uuid,
  p_reference text
)
returns table (
  out_reference text,
  out_status text,
  out_claimed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_withdrawal public.withdrawals%rowtype;
begin
  if p_withdrawal_id is null or coalesce(trim(p_reference), '') = '' then
    raise exception 'invalid transfer claim';
  end if;

  select *
    into v_withdrawal
    from public.withdrawals w
   where w.id = p_withdrawal_id
   for update;

  if not found then
    raise exception 'withdrawal not found';
  end if;
  if v_withdrawal.status <> 'pending' then
    raise exception 'withdrawal already processed';
  end if;

  if v_withdrawal.transfer_reference is null
     or v_withdrawal.transfer_status in ('failed', 'reversed', 'abandoned') then
    update public.withdrawals
       set transfer_reference = trim(p_reference),
           transfer_code = null,
           transfer_status = 'initiating',
           transfer_claimed_at = now()
     where id = p_withdrawal_id;

    return query select trim(p_reference), 'initiating'::text, true;
    return;
  end if;

  -- Definite pre-transfer errors retry with the same idempotency reference.
  -- An `initiating` lease may also be reclaimed after two minutes if the
  -- server crashed before reaching Paystack.
  if v_withdrawal.transfer_status in ('error', 'not-started', 'unknown')
     or (
       v_withdrawal.transfer_status = 'initiating'
       and coalesce(v_withdrawal.transfer_claimed_at, '-infinity'::timestamptz)
           < now() - interval '2 minutes'
     ) then
    update public.withdrawals
       set transfer_status = 'initiating',
           transfer_claimed_at = now()
     where id = p_withdrawal_id;

    return query
      select v_withdrawal.transfer_reference, 'initiating'::text, true;
    return;
  end if;

  return query
    select v_withdrawal.transfer_reference,
           coalesce(v_withdrawal.transfer_status, 'initiating'),
           false;
end;
$$;

revoke execute on function public.claim_seller_withdrawal_transfer(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_seller_withdrawal_transfer(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3) A ledger decision must agree with the transfer state.
--
-- Approve is legal only after Paystack says success. Reject is legal only when
-- no transfer was started or Paystack reached a terminal non-payment state.
-- This closes the approve-vs-reject race at the database boundary.
-- ---------------------------------------------------------------------------
create or replace function public.process_seller_withdrawal(
  p_withdrawal_id uuid,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_withdrawal public.withdrawals%rowtype;
begin
  select *
    into v_withdrawal
    from public.withdrawals w
   where w.id = p_withdrawal_id
   for update;

  if not found then
    raise exception 'withdrawal not found';
  end if;
  if v_withdrawal.status <> 'pending' then
    raise exception 'withdrawal already processed';
  end if;

  if p_action = 'approve' then
    if v_withdrawal.transfer_reference is null
       or v_withdrawal.transfer_status <> 'success' then
      raise exception 'Paystack transfer is not successful';
    end if;

    update public.withdrawals
       set status = 'paid',
           transfer_claimed_at = null,
           processed_at = now()
     where id = v_withdrawal.id;
    return 'approved';
  end if;

  if p_action = 'reject' then
    if v_withdrawal.transfer_reference is not null
       and coalesce(v_withdrawal.transfer_status, '') not in (
         'failed', 'reversed', 'abandoned', 'not-started'
       ) then
      raise exception 'Paystack transfer already started';
    end if;

    insert into public.wallets (user_id, balance)
    values (v_withdrawal.seller_id, v_withdrawal.amount_kobo)
    on conflict (user_id)
    do update set balance = public.wallets.balance + excluded.balance;

    update public.withdrawals
       set status = 'rejected',
           transfer_status = 'rejected',
           transfer_claimed_at = null,
           processed_at = now()
     where id = v_withdrawal.id;
    return 'rejected';
  end if;

  raise exception 'invalid withdrawal action';
end;
$$;

revoke execute on function public.process_seller_withdrawal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.process_seller_withdrawal(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4) Refund status + an exactly-once wallet fallback for refund.failed.
--
-- Paystack accepts a refund asynchronously. If the processor later emits
-- refund.failed, the signed webhook credits the attempted card amount to the
-- buyer's wallet. The ledger below makes webhook retries harmless.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists refund_card_status text;

create index if not exists orders_refund_reference_idx
  on public.orders (refund_reference)
  where refund_reference is not null;

create table if not exists public.order_refund_fallbacks (
  refund_reference text primary key,
  order_ref text not null unique,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  created_at timestamptz not null default now()
);

create index if not exists order_refund_fallbacks_buyer_id_idx
  on public.order_refund_fallbacks (buyer_id);

alter table public.order_refund_fallbacks enable row level security;
revoke all on table public.order_refund_fallbacks
  from public, anon, authenticated;

create or replace function public.record_paystack_refund_event(
  p_order_ref text,
  p_refund_reference text,
  p_status text,
  p_amount_kobo bigint
)
returns table (
  out_buyer_id uuid,
  out_amount_kobo bigint,
  out_fallback_applied boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_ref text;
  v_buyer_id uuid;
  v_card_kobo bigint;
  v_event_reference text;
  v_inserted integer := 0;
begin
  if p_status is null
     or p_status not in ('pending', 'processing', 'processed', 'failed', 'needs-attention') then
    raise exception 'invalid refund status';
  end if;

  select o.order_ref, o.buyer_id
    into v_order_ref, v_buyer_id
    from public.orders o
   where (
     (p_refund_reference is not null and o.refund_reference = p_refund_reference)
     or (p_order_ref is not null and o.order_ref = p_order_ref)
   )
     and o.refunded_at is not null
   order by o.id
   limit 1;

  if not found then
    return;
  end if;

  -- Lock every row in a stable order before inspecting/applying the fallback.
  perform o.id
    from public.orders o
   where o.order_ref = v_order_ref
     and o.buyer_id = v_buyer_id
   order by o.id
   for update;

  select coalesce(max(o.refund_card_kobo), 0)
    into v_card_kobo
    from public.orders o
   where o.order_ref = v_order_ref
     and o.buyer_id = v_buyer_id;

  if v_card_kobo <= 0 then
    return query select v_buyer_id, 0::bigint, false;
    return;
  end if;

  if p_amount_kobo is not null and p_amount_kobo > 0
     and p_amount_kobo <> v_card_kobo then
    raise exception 'refund amount mismatch';
  end if;

  update public.orders
     set refund_card_status = p_status
   where order_ref = v_order_ref
     and buyer_id = v_buyer_id;

  if p_status <> 'failed' then
    return query select v_buyer_id, v_card_kobo, false;
    return;
  end if;

  v_event_reference := coalesce(
    nullif(trim(p_refund_reference), ''),
    'failed-' || v_order_ref
  );

  insert into public.order_refund_fallbacks (
    refund_reference,
    order_ref,
    buyer_id,
    amount_kobo
  ) values (
    v_event_reference,
    v_order_ref,
    v_buyer_id,
    v_card_kobo
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return query select v_buyer_id, v_card_kobo, false;
    return;
  end if;

  insert into public.wallets (user_id, balance)
  values (v_buyer_id, v_card_kobo)
  on conflict (user_id)
  do update set balance = public.wallets.balance + excluded.balance;

  update public.orders
     set refund_method = 'wallet'
   where order_ref = v_order_ref
     and buyer_id = v_buyer_id;

  return query select v_buyer_id, v_card_kobo, true;
end;
$$;

revoke execute on function public.record_paystack_refund_event(text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.record_paystack_refund_event(text, text, text, bigint)
  to service_role;
