-- Trust, consent, moderation and dispute-return controls (2026-11-18).
--
-- Apply after 20261117_broadcasts_variants.sql and before deploying the
-- matching application code. Idempotent where practical and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Auditable legal and seller-verification consent
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists legal_accepted_at timestamptz;
alter table public.profiles add column if not exists legal_version text;
alter table public.profiles add column if not exists verification_consent_at timestamptz;
alter table public.profiles add column if not exists verification_consent_version text;

-- Existing submissions predate the explicit checkbox. Mark them honestly as a
-- legacy submission so the new pending-state constraint can be introduced
-- without inventing acceptance of the new wording.
update public.profiles
   set verification_consent_at = coalesce(
         verification_consent_at,
         verification_submitted_at,
         updated_at,
         now()
       ),
       verification_consent_version = coalesce(
         verification_consent_version,
         'legacy-submission'
       )
 where verification_status = 'pending'
   and verification_consent_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_pending_verification_consent_check'
  ) then
    alter table public.profiles
      add constraint profiles_pending_verification_consent_check
      check (
        verification_status is distinct from 'pending'
        or verification_consent_at is not null
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Account suspension and immutable moderation history
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists suspended_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_suspension_reason_check'
  ) then
    alter table public.profiles
      add constraint profiles_suspension_reason_check
      check (
        not is_suspended
        or char_length(btrim(coalesce(suspension_reason, ''))) between 5 and 500
      );
  end if;
end;
$$;

create index if not exists profiles_suspended_idx
  on public.profiles (suspended_at desc)
  where is_suspended = true;

create table if not exists public.account_moderation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  admin_id uuid not null,
  action text not null check (action in ('suspend', 'restore')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default now()
);

create index if not exists account_moderation_events_user_created_idx
  on public.account_moderation_events (user_id, created_at desc);

alter table public.account_moderation_events enable row level security;
revoke all on table public.account_moderation_events from public, anon, authenticated;

-- These values are evidence and security controls, not user-editable profile
-- fields. App routes write them with the service role after authenticating the
-- caller.
create or replace function public.protect_trust_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() in ('service_role', 'postgres') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.legal_accepted_at is not null
       or new.legal_version is not null
       or new.verification_consent_at is not null
       or new.verification_consent_version is not null
       or coalesce(new.is_suspended, false)
       or new.suspended_at is not null
       or new.suspension_reason is not null
       or new.suspended_by is not null then
      raise exception 'server-managed trust fields cannot be set by clients';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.legal_accepted_at is distinct from old.legal_accepted_at
       or new.legal_version is distinct from old.legal_version
       or new.verification_consent_at is distinct from old.verification_consent_at
       or new.verification_consent_version is distinct from old.verification_consent_version
       or new.is_suspended is distinct from old.is_suspended
       or new.suspended_at is distinct from old.suspended_at
       or new.suspension_reason is distinct from old.suspension_reason
       or new.suspended_by is distinct from old.suspended_by then
      raise exception 'server-managed trust fields cannot be changed by clients';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_trust_profile_fields on public.profiles;
create trigger protect_trust_profile_fields
before insert or update on public.profiles
for each row execute function public.protect_trust_profile_fields();

-- A ban is also applied through Supabase Auth by the admin route. This trigger
-- is a database backstop for an already-issued access token making a direct
-- write before it expires.
create or replace function public.reject_suspended_user_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' and exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.is_suspended = true
  ) then
    raise exception 'account is suspended';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles',
    'products',
    'carts',
    'orders',
    'wishlists',
    'reviews',
    'push_subscriptions',
    'broadcast_dismissals'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format(
        'drop trigger if exists reject_suspended_user_write on public.%I',
        v_table
      );
      execute format(
        'create trigger reject_suspended_user_write before insert or update or delete on public.%I for each row execute function public.reject_suspended_user_write()',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) A disputed item that the buyer possesses must be returned before refund
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists dispute_reason text;
alter table public.orders add column if not exists dispute_opened_at timestamptz;
alter table public.orders add column if not exists return_required boolean not null default false;
alter table public.orders add column if not exists return_received_at timestamptz;
alter table public.orders add column if not exists return_received_by uuid;
alter table public.orders add column if not exists return_confirmation_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.orders'::regclass
       and conname = 'orders_return_confirmation_source_check'
  ) then
    alter table public.orders
      add constraint orders_return_confirmation_source_check
      check (
        return_confirmation_source is null
        or return_confirmation_source in ('seller', 'admin')
      );
  end if;
end;
$$;

create index if not exists orders_open_dispute_returns_idx
  on public.orders (seller_id, dispute_opened_at)
  where status = 'disputed'
    and return_required = true
    and return_received_at is null;

create table if not exists public.order_dispute_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('buyer', 'seller', 'admin', 'system')),
  event_type text not null check (
    event_type in ('opened', 'return_confirmed', 'return_overridden', 'refunded')
  ),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_dispute_events_order_created_idx
  on public.order_dispute_events (order_id, created_at);

alter table public.order_dispute_events enable row level security;
revoke all on table public.order_dispute_events from public, anon, authenticated;

create or replace function public.open_order_dispute(
  p_order_ref text,
  p_buyer_id uuid,
  p_reason text,
  p_return_required boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_order_ref is null
     or p_buyer_id is null
     or char_length(v_reason) not between 10 and 1000 then
    return false;
  end if;

  perform o.id
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
   order by o.id
   for update;

  if not found then
    return false;
  end if;

  -- A retry must preserve the original return requirement and evidence.
  if exists (
    select 1 from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.status = 'disputed'
  ) then
    return not exists (
      select 1 from public.orders o
       where o.order_ref = p_order_ref
         and o.buyer_id = p_buyer_id
         and o.status <> 'disputed'
    );
  end if;

  if exists (
    select 1 from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.status not in (
         'in_escrow',
         'packing',
         'ready_for_pickup',
         'confirmed',
         'delivered'
       )
  ) then
    return false;
  end if;

  update public.orders
     set status = 'disputed',
         status_changed_at = now(),
         dispute_reason = v_reason,
         dispute_opened_at = now(),
         return_required = coalesce(p_return_required, false),
         return_received_at = null,
         return_received_by = null,
         return_confirmation_source = null
   where order_ref = p_order_ref
     and buyer_id = p_buyer_id;

  return true;
end;
$$;

revoke execute on function public.open_order_dispute(text, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.open_order_dispute(text, uuid, text, boolean)
  to service_role;

create or replace function public.confirm_order_return(
  p_order_id uuid,
  p_seller_id uuid,
  p_confirmed_by uuid,
  p_source text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
begin
  if p_order_id is null
     or p_seller_id is null
     or p_confirmed_by is null
     or p_source is null
     or p_source not in ('seller', 'admin') then
    return false;
  end if;
  if p_source = 'seller' and p_confirmed_by <> p_seller_id then
    return false;
  end if;

  update public.orders
     set return_received_at = coalesce(return_received_at, now()),
         return_received_by = coalesce(return_received_by, p_confirmed_by),
         return_confirmation_source = coalesce(return_confirmation_source, p_source),
         status_changed_at = now()
   where id = p_order_id
     and seller_id = p_seller_id
     and status = 'disputed'
     and return_required = true;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.confirm_order_return(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_order_return(uuid, uuid, uuid, text)
  to service_role;

-- Replaces the 20261116 function with one additional invariant: escrow cannot
-- be claimed while any required seller return confirmation is outstanding.
create or replace function public.claim_order_refund(
  p_order_ref text,
  p_buyer_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_held bigint := 0;
begin
  if p_order_ref is null or p_buyer_id is null then
    return null;
  end if;

  perform o.id
    from public.orders o
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
   order by o.id
   for update;

  if not found then
    return null;
  end if;

  if exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and not (
         o.status in (
           'in_escrow',
           'packing',
           'ready_for_pickup',
           'confirmed',
           'delivered'
         )
         or (o.status = 'disputed' and o.refunded_at is null)
       )
  ) then
    return null;
  end if;

  if exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.return_required = true
       and o.return_received_at is null
  ) then
    return null;
  end if;

  if exists (
    select 1
      from public.orders o
     where o.order_ref = p_order_ref
       and o.buyer_id = p_buyer_id
       and o.refund_claimed_at is not null
       and o.refund_claimed_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  select coalesce(sum(e.amount_kobo), 0)::bigint
    into v_held
    from public.escrow_transactions e
    join public.orders o on o.id = e.order_id
   where o.order_ref = p_order_ref
     and o.buyer_id = p_buyer_id
     and e.status = 'held';

  update public.orders
     set status = 'disputed',
         status_changed_at = now(),
         dispute_opened_at = coalesce(dispute_opened_at, now()),
         refund_claimed_at = now()
   where order_ref = p_order_ref
     and buyer_id = p_buyer_id
     and refunded_at is null;

  return v_held;
end;
$$;

revoke execute on function public.claim_order_refund(text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_order_refund(text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4) Preserve the definite Paystack error that proves a transfer never began
-- ---------------------------------------------------------------------------
alter table public.withdrawals add column if not exists transfer_error text;
alter table public.withdrawals add column if not exists manual_reconciled_at timestamptz;
alter table public.withdrawals add column if not exists manual_reconciled_by uuid;
alter table public.withdrawals add column if not exists manual_reconcile_note text;

create table if not exists public.withdrawal_reconciliation_events (
  id bigint generated always as identity primary key,
  withdrawal_id uuid not null references public.withdrawals (id) on delete cascade,
  admin_id uuid not null,
  transfer_reference text not null,
  previous_status text,
  decision text not null check (decision = 'confirmed_not_started'),
  note text not null check (char_length(btrim(note)) between 10 and 500),
  created_at timestamptz not null default now()
);

create index if not exists withdrawal_reconciliation_events_withdrawal_idx
  on public.withdrawal_reconciliation_events (withdrawal_id, created_at desc);

alter table public.withdrawal_reconciliation_events enable row level security;
revoke all on table public.withdrawal_reconciliation_events from public, anon, authenticated;
