-- Seller plan renewal paid from the wallet balance.
-- Apply after 20261119_wallet_funding_fees.sql.
--
-- Wallet top-ups are spendable immediately (only bank cash-out waits 14 days),
-- so a seller may use held credit to renew. The debit still prefers held lots
-- first and keeps immediately-withdrawable earnings available for payout.

-- Allow subscription spend to be recorded in the source-aware credit ledger.
alter table public.wallet_credit_allocations
  drop constraint if exists wallet_credit_allocations_consumer_type_check;

alter table public.wallet_credit_allocations
  add constraint wallet_credit_allocations_consumer_type_check
  check (consumer_type in ('order', 'withdrawal', 'subscription'));

-- Idempotent wallet debit for a seller subscription.
create or replace function public.debit_wallet_subscription(
  p_user_id uuid,
  p_reference text,
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
     or coalesce(btrim(p_reference), '') = ''
     or p_amount_kobo is null
     or p_amount_kobo <= 0 then
    raise exception 'invalid subscription debit';
  end if;

  select * into v_existing
    from public.wallet_debits
   where order_ref = 'subscription:' || btrim(p_reference);
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
  values (p_user_id, 'subscription:' || btrim(p_reference), p_amount_kobo);

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
      v_credit.id, p_user_id, 'subscription', btrim(p_reference), v_take
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

revoke execute on function public.debit_wallet_subscription(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.debit_wallet_subscription(uuid, text, bigint)
  to service_role;

-- Compensation: if subscription activation fails after the wallet was debited,
-- put the exact credit lots and wallet balance back before reporting an error.
create or replace function public.reverse_wallet_subscription_debit(p_reference text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_debit public.wallet_debits%rowtype;
  v_allocation record;
begin
  if coalesce(btrim(p_reference), '') = '' then return false; end if;

  select * into v_debit
    from public.wallet_debits
   where order_ref = 'subscription:' || btrim(p_reference);
  if not found then return false; end if;

  for v_allocation in
    select *
      from public.wallet_credit_allocations
     where consumer_type = 'subscription'
       and consumer_ref = btrim(p_reference)
       and reversed_at is null
  loop
    update public.wallet_credits
       set remaining_kobo = least(amount_kobo, remaining_kobo + v_allocation.amount_kobo)
     where id = v_allocation.credit_id;
    update public.wallet_credit_allocations
       set reversed_at = now()
     where id = v_allocation.id;
  end loop;

  update public.wallets
     set balance = balance + v_debit.amount_kobo
   where user_id = v_debit.user_id;

  delete from public.wallet_debits where id = v_debit.id;
  return true;
end;
$$;

revoke execute on function public.reverse_wallet_subscription_debit(text)
  from public, anon, authenticated;
grant execute on function public.reverse_wallet_subscription_debit(text)
  to service_role;
