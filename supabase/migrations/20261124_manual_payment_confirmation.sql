-- Customer payment recovery: frozen checkout attempts + audited admin confirmation.
--
-- Before this migration, checkout called Paystack initialize without persisting
-- anything locally, so a buyer whose bank transfer was not reflected had no
-- server-side record an admin could safely recover. `/api/paystack` now creates
-- one row here BEFORE initialize, using a reference we generate ourselves.
--
-- `checkout_attempts` is a frozen snapshot of what the buyer agreed to pay.
-- Only status/audit columns may change after creation (enforced by trigger).
-- All reads/writes go through the service-role admin API; buyers and anon users
-- have no privileges at all. `manual_payment_confirmation_events` is append-only,
-- including for the service role, so an operator cannot rewrite the audit trail.

create table if not exists public.checkout_attempts (
  reference text primary key
    check (reference ~ '^[A-Za-z0-9_-]{1,200}$'),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  buyer_email text,
  purpose text not null default 'marketplace_checkout',
  status text not null default 'initialized'
    check (status in ('initialized', 'initialize_failed', 'confirmed_paystack', 'confirmed_manual')),
  product_ids jsonb not null,
  checkout_items jsonb not null,
  expected_total_kobo bigint not null check (expected_total_kobo > 0),
  gateway_principal_kobo bigint not null check (gateway_principal_kobo > 0),
  processing_fee_kobo bigint not null check (processing_fee_kobo >= 0),
  gateway_charge_kobo bigint not null check (gateway_charge_kobo > 0),
  wallet_kobo bigint not null default 0 check (wallet_kobo >= 0),
  delivery_type text not null check (delivery_type in ('pickup', 'delivery')),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  buyer_fee_kobo bigint not null default 0 check (buyer_fee_kobo >= 0),
  receiver_name text,
  receiver_phone text,
  matric_number text,
  delivery_address text,
  checkout_mode text not null default 'cart' check (checkout_mode in ('cart', 'buy_now')),
  currency text not null default 'NGN',
  paystack_initialized_at timestamptz,
  paystack_checked_at timestamptz,
  paystack_status text,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  confirmation_note text,
  created_at timestamptz not null default now()
);

create index if not exists checkout_attempts_created_idx
  on public.checkout_attempts (created_at desc);
create index if not exists checkout_attempts_buyer_idx
  on public.checkout_attempts (buyer_id, created_at desc);
create index if not exists checkout_attempts_status_idx
  on public.checkout_attempts (status);

create table if not exists public.manual_payment_confirmation_events (
  id uuid primary key default gen_random_uuid(),
  attempt_reference text not null
    references public.checkout_attempts(reference) on delete cascade,
  actor_id uuid not null references auth.users(id),
  actor_role text not null default 'admin',
  event_type text not null
    check (event_type in ('recheck_success', 'recheck_failed', 'manual_confirmed', 'already_recorded')),
  note text,
  paystack_status text,
  created_at timestamptz not null default now()
);

create index if not exists manual_payment_events_attempt_idx
  on public.manual_payment_confirmation_events (attempt_reference, created_at desc);

-- The money, items and delivery details are the evidence of what the buyer was
-- charged. Status/audit columns may advance; the snapshot may not be rewritten.
create or replace function public.checkout_attempts_enforce_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reference is distinct from old.reference
     or new.buyer_id is distinct from old.buyer_id
     or new.buyer_email is distinct from old.buyer_email
     or new.purpose is distinct from old.purpose
     or new.product_ids is distinct from old.product_ids
     or new.checkout_items is distinct from old.checkout_items
     or new.expected_total_kobo is distinct from old.expected_total_kobo
     or new.gateway_principal_kobo is distinct from old.gateway_principal_kobo
     or new.processing_fee_kobo is distinct from old.processing_fee_kobo
     or new.gateway_charge_kobo is distinct from old.gateway_charge_kobo
     or new.wallet_kobo is distinct from old.wallet_kobo
     or new.delivery_type is distinct from old.delivery_type
     or new.delivery_fee_kobo is distinct from old.delivery_fee_kobo
     or new.buyer_fee_kobo is distinct from old.buyer_fee_kobo
     or new.receiver_name is distinct from old.receiver_name
     or new.receiver_phone is distinct from old.receiver_phone
     or new.matric_number is distinct from old.matric_number
     or new.delivery_address is distinct from old.delivery_address
     or new.checkout_mode is distinct from old.checkout_mode
     or new.currency is distinct from old.currency
     or new.created_at is distinct from old.created_at then
    raise exception 'checkout attempt payment snapshot is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists checkout_attempts_enforce_snapshot on public.checkout_attempts;
create trigger checkout_attempts_enforce_snapshot
  before update on public.checkout_attempts
  for each row execute function public.checkout_attempts_enforce_snapshot();

alter table public.checkout_attempts enable row level security;
alter table public.manual_payment_confirmation_events enable row level security;

revoke all on public.checkout_attempts from public, anon, authenticated;
grant select, insert, update on public.checkout_attempts to service_role;

-- Append-only: not even the service role may edit or delete an audit row.
revoke all on public.manual_payment_confirmation_events from public, anon, authenticated, service_role;
grant select, insert on public.manual_payment_confirmation_events to service_role;
