-- Source-aware wallets, buyer funding, provider fees and 14-day cash-out holds.
-- Apply after 20261118_trust_safety.sql before deploying the matching app.

-- ---------------------------------------------------------------------------
-- 1) Wallet credit lots: every naira has a source and withdrawal date
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in (
    'legacy',
    'funding',
    'refund',
    'refund_fallback',
    'seller_earning',
    'withdrawal_return',
    'admin'
  )),
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  remaining_kobo bigint not null check (remaining_kobo >= 0),
  withdrawable_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (remaining_kobo <= amount_kobo)
);

create index if not exists wallet_credits_user_spendable_idx
  on public.wallet_credits (user_id, created_at)
  where remaining_kobo > 0;

create index if not exists wallet_credits_user_withdrawable_idx
  on public.wallet_credits (user_id, withdrawable_at, created_at)
  where remaining_kobo > 0;

alter table public.wallet_credits enable row level security;
drop policy if exists wallet_credits_select_owner on public.wallet_credits;
create policy wallet_credits_select_owner on public.wallet_credits
  for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on table public.wallet_credits from public, anon, authenticated;

create table if not exists public.wallet_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.wallet_credits (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  consumer_type text not null check (consumer_type in ('order', 'withdrawal')),
  consumer_ref text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (credit_id, consumer_type, consumer_ref)
);

create index if not exists wallet_credit_allocations_consumer_idx
  on public.wallet_credit_allocations (consumer_type, consumer_ref)
  where reversed_at is null;

alter table public.wallet_credit_allocations enable row level security;
revoke all on table public.wallet_credit_allocations from public, anon, authenticated;

-- Existing balances may contain refunds or seller earnings that predate source
-- tracking. Preserve them as immediately-withdrawable legacy lots exactly once.
insert into public.wallet_credits (
  user_id,
  source,
  reference,
  amount_kobo,
  remaining_kobo,
  withdrawable_at
)
select
  w.user_id,
  'legacy',
  'legacy:' || w.user_id::text,
  w.balance,
  w.balance,
  now()
from public.wallets w
where w.balance > 0
on conflict (reference) do nothing;

create or replace function public.credit_wallet_lot(
  p_user_id uuid,
  p_source text,
  p_reference text,
  p_amount_kobo bigint,
  p_withdrawable_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_existing public.wallet_credits%rowtype;
begin
  if p_user_id is null
     or p_source not in (
       'legacy', 'funding', 'refund', 'refund_fallback',
       'seller_earning', 'withdrawal_return', 'admin'
     )
     or coalesce(btrim(p_reference), '') = ''
     or p_amount_kobo is null
     or p_amount_kobo <= 0
     or p_withdrawable_at is null then
    raise exception 'invalid wallet credit';
  end if;

  insert into public.wallet_credits (
    user_id,
    source,
    reference,
    amount_kobo,
    remaining_kobo,
    withdrawable_at
  ) values (
    p_user_id,
    p_source,
    btrim(p_reference),
    p_amount_kobo,
    p_amount_kobo,
    p_withdrawable_at
  )
  on conflict (reference) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_existing
      from public.wallet_credits
     where reference = btrim(p_reference);
    if not found
       or v_existing.user_id <> p_user_id
       or v_existing.amount_kobo <> p_amount_kobo
       or v_existing.source <> p_source then
      raise exception 'wallet credit reference mismatch';
    end if;
    return true;
  end if;

  insert into public.wallets (user_id, balance)
  values (p_user_id, p_amount_kobo)
  on conflict (user_id)
  do update set balance = public.wallets.balance + excluded.balance;

  return true;
end;
$$;

revoke execute on function public.credit_wallet_lot(uuid, text, text, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.credit_wallet_lot(uuid, text, text, bigint, timestamptz)
  to service_role;

-- Spend held top-ups/refunds first, then immediately-withdrawable earnings.
-- This keeps the largest safe amount available for a later bank withdrawal.
create or replace function public.debit_wallet(
  p_user_id uuid,
  p_order_ref text,
  p_amount_kobo bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit record;
  v_needed bigint := p_amount_kobo;
  v_take bigint;
  v_available bigint := 0;
  v_existing public.wallet_debits%rowtype;
begin
  if p_user_id is null
     or p_amount_kobo is null
     or p_amount_kobo <= 0
     or coalesce(btrim(p_order_ref), '') = '' then
    raise exception 'invalid wallet debit';
  end if;

  select * into v_existing
    from public.wallet_debits
   where order_ref = btrim(p_order_ref);
  if found then
    return v_existing.user_id = p_user_id
       and v_existing.amount_kobo = p_amount_kobo;
  end if;

  perform w.user_id
    from public.wallets w
   where w.user_id = p_user_id
   for update;
  if not found then return false; end if;

  select coalesce(sum(c.remaining_kobo), 0)::bigint
    into v_available
    from public.wallet_credits c
   where c.user_id = p_user_id
     and c.remaining_kobo > 0;
  if v_available < p_amount_kobo then return false; end if;

  insert into public.wallet_debits (user_id, order_ref, amount_kobo)
  values (p_user_id, btrim(p_order_ref), p_amount_kobo);

  for v_credit in
    select c.id, c.remaining_kobo
      from public.wallet_credits c
     where c.user_id = p_user_id
       and c.remaining_kobo > 0
     order by
       case when c.withdrawable_at > now() then 0 else 1 end,
       c.created_at,
       c.id
     for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_credit.remaining_kobo);
    update public.wallet_credits
       set remaining_kobo = remaining_kobo - v_take
     where id = v_credit.id;
    insert into public.wallet_credit_allocations (
      credit_id, user_id, consumer_type, consumer_ref, amount_kobo
    ) values (
      v_credit.id, p_user_id, 'order', btrim(p_order_ref), v_take
    );
    v_needed := v_needed - v_take;
  end loop;

  update public.wallets
     set balance = balance - p_amount_kobo
   where user_id = p_user_id
     and balance >= p_amount_kobo;
  if not found then raise exception 'wallet aggregate mismatch'; end if;
  return true;
end;
$$;

revoke execute on function public.debit_wallet(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.debit_wallet(uuid, text, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2) Payment accounting and idempotent wallet funding
-- ---------------------------------------------------------------------------
create table if not exists public.payment_transactions (
  reference text primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  purpose text not null check (purpose in ('marketplace_checkout', 'wallet_funding')),
  gross_amount_kobo bigint not null check (gross_amount_kobo >= 0),
  principal_amount_kobo bigint not null check (principal_amount_kobo >= 0),
  processing_fee_kobo bigint not null check (processing_fee_kobo >= 0),
  provider_fee_kobo bigint not null check (provider_fee_kobo >= 0),
  net_received_kobo bigint not null check (net_received_kobo >= 0),
  channel text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (gross_amount_kobo = principal_amount_kobo + processing_fee_kobo),
  check (net_received_kobo = gross_amount_kobo - provider_fee_kobo)
);

create index if not exists payment_transactions_user_created_idx
  on public.payment_transactions (user_id, created_at desc);

alter table public.payment_transactions enable row level security;
drop policy if exists payment_transactions_select_owner on public.payment_transactions;
create policy payment_transactions_select_owner on public.payment_transactions
  for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on table public.payment_transactions from public, anon, authenticated;

create or replace function public.record_wallet_funding(
  p_user_id uuid,
  p_reference text,
  p_credit_kobo bigint,
  p_gross_kobo bigint,
  p_processing_fee_kobo bigint,
  p_provider_fee_kobo bigint,
  p_channel text,
  p_paid_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_funded_24h bigint := 0;
begin
  if p_user_id is null
     or coalesce(btrim(p_reference), '') = ''
     or p_credit_kobo < 50000
     or p_credit_kobo > 10000000
     or p_gross_kobo <> p_credit_kobo + p_processing_fee_kobo
     or p_provider_fee_kobo < 0
     or p_provider_fee_kobo > p_processing_fee_kobo
     or p_gross_kobo - p_provider_fee_kobo < p_credit_kobo then
    raise exception 'invalid wallet funding transaction';
  end if;

  if exists (
    select 1 from public.payment_transactions p
     where p.reference = btrim(p_reference)
       and p.user_id = p_user_id
       and p.purpose = 'wallet_funding'
       and p.principal_amount_kobo = p_credit_kobo
  ) then
    return true;
  end if;

  select coalesce(sum(p.principal_amount_kobo), 0)::bigint
    into v_funded_24h
    from public.payment_transactions p
   where p.user_id = p_user_id
     and p.purpose = 'wallet_funding'
     and p.created_at >= now() - interval '24 hours';
  if v_funded_24h + p_credit_kobo > 10000000 then
    raise exception 'daily wallet funding limit exceeded';
  end if;

  insert into public.payment_transactions (
    reference,
    user_id,
    purpose,
    gross_amount_kobo,
    principal_amount_kobo,
    processing_fee_kobo,
    provider_fee_kobo,
    net_received_kobo,
    channel,
    paid_at
  ) values (
    btrim(p_reference),
    p_user_id,
    'wallet_funding',
    p_gross_kobo,
    p_credit_kobo,
    p_processing_fee_kobo,
    p_provider_fee_kobo,
    p_gross_kobo - p_provider_fee_kobo,
    nullif(btrim(coalesce(p_channel, '')), ''),
    p_paid_at
  )
  on conflict (reference) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return true; end if;

  perform public.credit_wallet_lot(
    p_user_id,
    'funding',
    'funding:' || btrim(p_reference),
    p_credit_kobo,
    now() + interval '14 days'
  );
  return true;
end;
$$;

revoke execute on function public.record_wallet_funding(uuid, text, bigint, bigint, bigint, bigint, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_wallet_funding(uuid, text, bigint, bigint, bigint, bigint, text, timestamptz)
  to service_role;

create or replace function public.wallet_balance_summary(p_user_id uuid)
returns table (
  total_kobo bigint,
  withdrawable_kobo bigint,
  held_kobo bigint,
  next_release_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(w.balance, 0)::bigint,
    coalesce(sum(c.remaining_kobo) filter (where c.withdrawable_at <= now()), 0)::bigint,
    coalesce(sum(c.remaining_kobo) filter (where c.withdrawable_at > now()), 0)::bigint,
    min(c.withdrawable_at) filter (
      where c.remaining_kobo > 0 and c.withdrawable_at > now()
    )
  from (select p_user_id as user_id) u
  left join public.wallets w on w.user_id = u.user_id
  left join public.wallet_credits c
    on c.user_id = u.user_id and c.remaining_kobo > 0
  group by w.balance;
$$;

revoke execute on function public.wallet_balance_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.wallet_balance_summary(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3) Withdrawal fees paid by the requesting user
-- ---------------------------------------------------------------------------
alter table public.withdrawals add column if not exists transfer_fee_kobo bigint not null default 0;
alter table public.withdrawals add column if not exists wallet_debit_kobo bigint;
update public.withdrawals
   set wallet_debit_kobo = amount_kobo + transfer_fee_kobo
 where wallet_debit_kobo is null;
alter table public.withdrawals alter column wallet_debit_kobo set not null;

create or replace function public.paystack_transfer_fee_kobo(p_amount_kobo bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_amount_kobo is null or p_amount_kobo <= 0 then 0
    else
      case
        when p_amount_kobo <= 500000 then 1000
        when p_amount_kobo <= 5000000 then 2500
        else 5000
      end
      + case when p_amount_kobo >= 1000000 then 5000 else 0 end
  end::bigint;
$$;

revoke execute on function public.paystack_transfer_fee_kobo(bigint)
  from public, anon, authenticated;
grant execute on function public.paystack_transfer_fee_kobo(bigint)
  to service_role;

create or replace function public.create_wallet_withdrawal(
  p_user_id uuid,
  p_bank_amount_kobo bigint,
  p_transfer_fee_kobo bigint,
  p_bank_name text,
  p_bank_code text,
  p_account_number text,
  p_account_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_debit bigint := p_bank_amount_kobo + p_transfer_fee_kobo;
  v_available bigint := 0;
  v_withdrawn_24h bigint := 0;
  v_withdrawal_id uuid := gen_random_uuid();
  v_credit record;
  v_needed bigint := v_total_debit;
  v_take bigint;
begin
  if p_user_id is null
     or p_bank_amount_kobo < 100000
     or p_bank_amount_kobo > 10000000
     or p_transfer_fee_kobo <> public.paystack_transfer_fee_kobo(p_bank_amount_kobo)
     or coalesce(btrim(p_bank_name), '') = ''
     or coalesce(btrim(p_bank_code), '') = ''
     or coalesce(btrim(p_account_name), '') = ''
     or coalesce(p_account_number, '') !~ '^[0-9]{10}$' then
    raise exception 'invalid withdrawal request';
  end if;

  perform w.user_id
    from public.wallets w
   where w.user_id = p_user_id
   for update;
  if not found then raise exception 'wallet not found'; end if;

  if exists (
    select 1 from public.withdrawals w
     where w.seller_id = p_user_id and w.status = 'pending'
  ) then
    raise exception 'pending withdrawal already exists';
  end if;

  select coalesce(sum(w.amount_kobo), 0)::bigint
    into v_withdrawn_24h
    from public.withdrawals w
   where w.seller_id = p_user_id
     and w.status <> 'rejected'
     and w.created_at >= now() - interval '24 hours';
  if v_withdrawn_24h + p_bank_amount_kobo > 10000000 then
    raise exception 'daily withdrawal limit exceeded';
  end if;

  select coalesce(sum(c.remaining_kobo), 0)::bigint
    into v_available
    from public.wallet_credits c
   where c.user_id = p_user_id
     and c.remaining_kobo > 0
     and c.withdrawable_at <= now();
  if v_available < v_total_debit then
    raise exception 'insufficient withdrawable balance';
  end if;

  insert into public.withdrawals (
    id,
    seller_id,
    amount_kobo,
    transfer_fee_kobo,
    wallet_debit_kobo,
    bank_name,
    bank_code,
    account_number,
    account_name,
    status
  ) values (
    v_withdrawal_id,
    p_user_id,
    p_bank_amount_kobo,
    p_transfer_fee_kobo,
    v_total_debit,
    btrim(p_bank_name),
    btrim(p_bank_code),
    p_account_number,
    btrim(p_account_name),
    'pending'
  );

  for v_credit in
    select c.id, c.remaining_kobo
      from public.wallet_credits c
     where c.user_id = p_user_id
       and c.remaining_kobo > 0
       and c.withdrawable_at <= now()
     order by c.created_at, c.id
     for update
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_credit.remaining_kobo);
    update public.wallet_credits
       set remaining_kobo = remaining_kobo - v_take
     where id = v_credit.id;
    insert into public.wallet_credit_allocations (
      credit_id, user_id, consumer_type, consumer_ref, amount_kobo
    ) values (
      v_credit.id, p_user_id, 'withdrawal', v_withdrawal_id::text, v_take
    );
    v_needed := v_needed - v_take;
  end loop;

  update public.wallets
     set balance = balance - v_total_debit
   where user_id = p_user_id
     and balance >= v_total_debit;
  if not found then raise exception 'wallet aggregate mismatch'; end if;
  return v_withdrawal_id;
end;
$$;

revoke execute on function public.create_wallet_withdrawal(uuid, bigint, bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_wallet_withdrawal(uuid, bigint, bigint, text, text, text, text)
  to service_role;

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
  v_allocation record;
  v_restored bigint := 0;
begin
  select * into v_withdrawal
    from public.withdrawals w
   where w.id = p_withdrawal_id
   for update;
  if not found then raise exception 'withdrawal not found'; end if;
  if v_withdrawal.status <> 'pending' then raise exception 'withdrawal already processed'; end if;

  if p_action = 'approve' then
    if v_withdrawal.transfer_reference is null
       or v_withdrawal.transfer_status <> 'success' then
      raise exception 'Paystack transfer is not successful';
    end if;
    update public.withdrawals
       set status = 'paid', transfer_claimed_at = null, processed_at = now()
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

    for v_allocation in
      select a.id, a.credit_id, a.amount_kobo
        from public.wallet_credit_allocations a
       where a.consumer_type = 'withdrawal'
         and a.consumer_ref = v_withdrawal.id::text
         and a.reversed_at is null
       order by a.id
       for update
    loop
      update public.wallet_credits
         set remaining_kobo = remaining_kobo + v_allocation.amount_kobo
       where id = v_allocation.credit_id;
      update public.wallet_credit_allocations
         set reversed_at = now()
       where id = v_allocation.id;
      v_restored := v_restored + v_allocation.amount_kobo;
    end loop;

    if v_restored > 0 then
      if v_restored <> v_withdrawal.wallet_debit_kobo then
        raise exception 'withdrawal allocation mismatch';
      end if;
      insert into public.wallets (user_id, balance)
      values (v_withdrawal.seller_id, v_restored)
      on conflict (user_id)
      do update set balance = public.wallets.balance + excluded.balance;
    else
      perform public.credit_wallet_lot(
        v_withdrawal.seller_id,
        'withdrawal_return',
        'withdrawal-return:' || v_withdrawal.id::text,
        v_withdrawal.wallet_debit_kobo,
        now()
      );
    end if;

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
-- 4) Credits created by escrow completion/refunds use source-aware lots
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
  if p_order_ref is null or p_buyer_id is null then return false; end if;
  perform o.id from public.orders o
   where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id
   order by o.id for update;
  if not found then return false; end if;
  if exists (
    select 1 from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.status is distinct from 'ready_for_pickup'
  ) then return false; end if;

  for v_seller in
    select o.seller_id,
           sum(greatest(coalesce(o.amount_kobo, 0) - coalesce(o.platform_fee_kobo, 0), 0))::bigint as payout_kobo
      from public.orders o
     where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id
     group by o.seller_id order by o.seller_id
  loop
    perform public.credit_wallet_lot(
      v_seller.seller_id,
      'seller_earning',
      'earning:' || p_order_ref || ':' || v_seller.seller_id::text,
      v_seller.payout_kobo,
      now()
    );
  end loop;

  update public.escrow_transactions e set status = 'released'
   where e.status = 'held'
     and e.order_id in (
       select o.id from public.orders o
        where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id
     );
  update public.orders
     set status = 'completed', status_changed_at = now(), completed_at = now()
   where order_ref = p_order_ref and buyer_id = p_buyer_id;
  return true;
end;
$$;

revoke execute on function public.confirm_order_group(text, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_group(text, uuid)
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
  if p_order_ref is null or p_buyer_id is null then return false; end if;
  if p_refund_method is null or p_refund_method not in ('card', 'wallet', 'card+wallet') then return false; end if;

  perform o.id from public.orders o
   where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id
   order by o.id for update;
  if not found or exists (
    select 1 from public.orders o
     where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id and o.refunded_at is not null
  ) then return false; end if;

  select coalesce(sum(e.amount_kobo), 0)::bigint into v_held
    from public.escrow_transactions e
    join public.orders o on o.id = e.order_id
   where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id and e.status = 'held';
  select coalesce(max(o.refund_card_kobo), 0)::bigint into v_card
    from public.orders o
   where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id;
  if v_wallet > v_held or v_wallet + v_card <> v_held then
    raise exception 'refund split does not match held escrow';
  end if;

  update public.orders
     set refunded_at = now(), refund_method = p_refund_method,
         refund_reference = p_refund_reference, status_changed_at = now()
   where order_ref = p_order_ref and buyer_id = p_buyer_id
     and status = 'disputed' and refunded_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;

  update public.escrow_transactions e set status = 'refunded'
   where e.status = 'held'
     and e.order_id in (
       select o.id from public.orders o
        where o.order_ref = p_order_ref and o.buyer_id = p_buyer_id
     );

  if v_wallet > 0 then
    perform public.credit_wallet_lot(
      p_buyer_id,
      'refund',
      'refund:' || p_order_ref,
      v_wallet,
      now() + interval '14 days'
    );
  end if;
  return true;
end;
$$;

revoke execute on function public.finalize_order_refund(text, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_order_refund(text, uuid, bigint, text, text)
  to service_role;

-- Keep the exactly-once failed-card-refund fallback, but credit a 14-day-held
-- refund lot instead of changing the aggregate wallet without a source.
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

  select o.order_ref, o.buyer_id into v_order_ref, v_buyer_id
    from public.orders o
   where (
     (p_refund_reference is not null and o.refund_reference = p_refund_reference)
     or (p_order_ref is not null and o.order_ref = p_order_ref)
   )
     and o.refunded_at is not null
   order by o.id limit 1;
  if not found then return; end if;

  perform o.id from public.orders o
   where o.order_ref = v_order_ref and o.buyer_id = v_buyer_id
   order by o.id for update;

  select coalesce(max(o.refund_card_kobo), 0) into v_card_kobo
    from public.orders o
   where o.order_ref = v_order_ref and o.buyer_id = v_buyer_id;
  if v_card_kobo <= 0 then
    return query select v_buyer_id, 0::bigint, false;
    return;
  end if;
  if p_amount_kobo is not null and p_amount_kobo > 0 and p_amount_kobo <> v_card_kobo then
    raise exception 'refund amount mismatch';
  end if;

  update public.orders set refund_card_status = p_status
   where order_ref = v_order_ref and buyer_id = v_buyer_id;
  if p_status <> 'failed' then
    return query select v_buyer_id, v_card_kobo, false;
    return;
  end if;

  v_event_reference := coalesce(nullif(btrim(p_refund_reference), ''), 'failed-' || v_order_ref);
  insert into public.order_refund_fallbacks (
    refund_reference, order_ref, buyer_id, amount_kobo
  ) values (
    v_event_reference, v_order_ref, v_buyer_id, v_card_kobo
  ) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return query select v_buyer_id, v_card_kobo, false;
    return;
  end if;

  perform public.credit_wallet_lot(
    v_buyer_id,
    'refund_fallback',
    'refund-fallback:' || v_event_reference,
    v_card_kobo,
    now() + interval '14 days'
  );
  update public.orders set refund_method = 'wallet'
   where order_ref = v_order_ref and buyer_id = v_buyer_id;
  return query select v_buyer_id, v_card_kobo, true;
end;
$$;

revoke execute on function public.record_paystack_refund_event(text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.record_paystack_refund_event(text, text, text, bigint)
  to service_role;
