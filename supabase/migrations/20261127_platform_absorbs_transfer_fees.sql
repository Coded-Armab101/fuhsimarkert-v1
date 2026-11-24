-- Platform absorbs Paystack transfer/stamp fees (2026-11-27).
--
-- The 3% seller commission funds Paystack transfer + stamp charges. A seller
-- requesting a bank withdrawal is debited EXACTLY the bank amount; the provider
-- fee is still stored on the withdrawal row for accounting
-- (fee_source = 'platform_commission'), but it never leaves the seller wallet.
--
-- Historical withdrawals are intentionally NOT rewritten: their
-- wallet_debit_kobo still records what was actually debited at the time. The
-- insert-only trigger below protects new rows without breaking updates to old
-- user-paid rows.

comment on column public.withdrawals.transfer_fee_kobo is
  'Paystack transfer + stamp duty cost for this payout. Funded by the platform 3% seller commission (fee_source = platform_commission); not charged to the seller wallet on new withdrawals.';
comment on column public.withdrawals.wallet_debit_kobo is
  'Amount removed from the seller wallet. Equals amount_kobo for new platform-paid withdrawals; older rows may include a user-paid fee and are preserved as-is.';

-- New rows must debit only the bank amount. This is a trigger rather than a
-- CHECK constraint because a NOT VALID CHECK would also be re-evaluated when an
-- old, user-paid withdrawal is approved/rejected, which would break history.
create or replace function public.enforce_new_withdrawal_wallet_debit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.wallet_debit_kobo is distinct from new.amount_kobo then
    raise exception 'new withdrawals must debit exactly the bank amount';
  end if;
  return new;
end;
$$;

drop trigger if exists withdrawals_new_wallet_debit_matches_amount on public.withdrawals;
create trigger withdrawals_new_wallet_debit_matches_amount
  before insert on public.withdrawals
  for each row execute function public.enforce_new_withdrawal_wallet_debit();

-- ---------------------------------------------------------------------------
-- 1) Withdrawal creation: same signature and guards, platform-paid fee.
-- ---------------------------------------------------------------------------
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
  -- The transfer/stamp fee is a platform cost funded by the 3% commission.
  -- Only the bank amount is reserved and removed from the seller's wallet.
  v_wallet_debit bigint := p_bank_amount_kobo;
  v_available bigint := 0;
  v_withdrawn_24h bigint := 0;
  v_withdrawal_id uuid := gen_random_uuid();
  v_credit record;
  v_needed bigint := v_wallet_debit;
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

  -- Atomic stock-style reservation: serialize on the wallet row, then check
  -- the pending request, 24h limit and withdrawable lots before inserting.
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
  if v_available < v_wallet_debit then
    raise exception 'insufficient withdrawable balance';
  end if;

  -- transfer_fee_kobo remains an auditable provider cost (platform_commission),
  -- while wallet_debit_kobo is the bank amount the seller actually loses.
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
    v_wallet_debit,
    btrim(p_bank_name),
    btrim(p_bank_code),
    p_account_number,
    btrim(p_account_name),
    'pending'
  );

  -- Wallet debit ledger: consume only withdrawable lots up to the bank amount.
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
     set balance = balance - v_wallet_debit
   where user_id = p_user_id
     and balance >= v_wallet_debit;
  if not found then raise exception 'wallet aggregate mismatch'; end if;
  return v_withdrawal_id;
end;
$$;

revoke execute on function public.create_wallet_withdrawal(uuid, bigint, bigint, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_wallet_withdrawal(uuid, bigint, bigint, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2) Rejection/refund: restore only the bank amount for new platform-paid rows.
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
  v_allocation record;
  v_restored bigint := 0;
  v_restore_kobo bigint;
begin
  select * into v_withdrawal
    from public.withdrawals w
   where w.id = p_withdrawal_id
   for update;
  if not found then raise exception 'withdrawal not found'; end if;
  if v_withdrawal.status <> 'pending' then raise exception 'withdrawal already processed'; end if;

  -- New rows: the platform paid the fee, so the seller was debited only the
  -- bank amount. Historical rows keep their original (user-paid) debit.
  if v_withdrawal.wallet_debit_kobo = v_withdrawal.amount_kobo then
    v_restore_kobo := v_withdrawal.amount_kobo;
  else
    v_restore_kobo := v_withdrawal.wallet_debit_kobo;
  end if;

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
      if v_restored <> v_restore_kobo then
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
        v_restore_kobo,
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
