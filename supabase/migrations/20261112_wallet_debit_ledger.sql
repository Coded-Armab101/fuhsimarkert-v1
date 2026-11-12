-- Idempotent wallet debits.
--
-- `debit_wallet` previously ignored `p_order_ref` and simply subtracted from the
-- balance. Both the Paystack webhook and the buyer's browser verification call
-- the order-recording path (which debits the wallet portion of a split
-- wallet+card payment), so a retry or a webhook/verify race could charge the
-- buyer twice for the same order.
--
-- This migration adds the ledger those calls were already assumed to have and
-- makes the debit a no-op for a reference that was already charged.
--
-- Safe to run on an existing database: the ledger starts empty, so existing
-- balances are untouched.

create table if not exists public.wallet_debits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Paystack references are unique per payment, so this is the idempotency key.
  order_ref text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  created_at timestamptz not null default now()
);

alter table public.wallet_debits enable row level security;

-- No policies: only the security-definer function (service role) may touch it.
revoke all on table public.wallet_debits from public, anon, authenticated;

create or replace function public.debit_wallet(
  p_user_id uuid,
  p_order_ref text,
  p_amount_kobo bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_rows integer;
  updated_rows integer;
begin
  if p_amount_kobo is null or p_amount_kobo <= 0 then
    raise exception 'invalid debit amount';
  end if;

  if p_order_ref is null or btrim(p_order_ref) = '' then
    raise exception 'invalid order reference';
  end if;

  -- Claim the reference first. On a retry/race the conflict leaves 0 rows, so we
  -- return success without touching the balance a second time.
  insert into public.wallet_debits (user_id, order_ref, amount_kobo)
  values (p_user_id, p_order_ref, p_amount_kobo)
  on conflict (order_ref) do nothing;

  get diagnostics claimed_rows = row_count;
  if claimed_rows = 0 then
    return true;
  end if;

  -- Auto-provision the wallet row if it does not exist yet.
  insert into public.wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.wallets
     set balance = balance - p_amount_kobo
   where user_id = p_user_id
     and balance >= p_amount_kobo;

  get diagnostics updated_rows = row_count;
  if updated_rows = 0 then
    -- Insufficient balance: release the claim so a genuine retry can succeed
    -- once the wallet is funded.
    delete from public.wallet_debits where order_ref = p_order_ref;
    return false;
  end if;

  return true;
end;
$$;

revoke execute on function public.debit_wallet(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.debit_wallet(uuid, text, bigint) to service_role;
