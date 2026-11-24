-- Support centre (tickets + threaded messages) and hung-payment evidence.
--
-- Buyers can create/read their own tickets and messages but cannot change a
-- ticket status or edit/delete a message: only the service-role admin API may do
-- that. The same rule applies to payment evidence — a buyer submits once, an
-- operator reviews it. Proof images live in a PRIVATE `payment-proofs` bucket;
-- only the admin API creates short-lived signed URLs for stored paths.

-- ---------------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 5 and 160),
  category text not null
    check (category in ('payment', 'order', 'product', 'account', 'other')),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open'
    check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.support_tickets_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
  for each row execute function public.support_tickets_touch_updated_at();

create index if not exists support_tickets_user_updated_idx
  on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_status_updated_idx
  on public.support_tickets (status, updated_at desc);

alter table public.support_tickets enable row level security;

revoke all on public.support_tickets from public, anon, authenticated;
grant select, insert on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;

drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own on public.support_tickets
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Ticket messages
-- ---------------------------------------------------------------------------
create table if not exists public.support_ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  sender_role text not null
    check (sender_role in ('buyer', 'seller', 'admin', 'system')),
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at);
create index if not exists support_messages_sender_idx
  on public.support_ticket_messages (sender_id);

alter table public.support_ticket_messages enable row level security;

revoke all on public.support_ticket_messages from public, anon, authenticated;
grant select, insert on public.support_ticket_messages to authenticated;
grant all on public.support_ticket_messages to service_role;

drop policy if exists support_messages_select_own_ticket on public.support_ticket_messages;
create policy support_messages_select_own_ticket on public.support_ticket_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets st
      where st.id = support_ticket_messages.ticket_id
        and st.user_id = auth.uid()
    )
  );

-- A signed-in user may only reply as themselves, only as a buyer/seller, and
-- only inside their own ticket. Admin replies use the service-role API.
drop policy if exists support_messages_insert_own on public.support_ticket_messages;
create policy support_messages_insert_own on public.support_ticket_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_role in ('buyer', 'seller')
    and exists (
      select 1 from public.support_tickets st
      where st.id = support_ticket_messages.ticket_id
        and st.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Hung / failed payment evidence
-- ---------------------------------------------------------------------------
create table if not exists public.payment_evidence (
  id uuid primary key default gen_random_uuid(),
  checkout_reference text not null
    references public.checkout_attempts(reference) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  buyer_reference text not null check (char_length(buyer_reference) between 1 and 200),
  amount_naira text check (char_length(amount_naira) <= 40),
  paid_at text check (char_length(paid_at) <= 40),
  note text not null check (char_length(note) between 10 and 2000),
  proof_path text,
  status text not null default 'pending'
    check (status in ('pending', 'under_review', 'resolved', 'rejected')),
  admin_note text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_evidence_checkout_reference_idx
  on public.payment_evidence (checkout_reference);
create index if not exists payment_evidence_buyer_created_idx
  on public.payment_evidence (buyer_id, created_at desc);
create index if not exists payment_evidence_status_idx
  on public.payment_evidence (status);
create index if not exists payment_evidence_created_idx
  on public.payment_evidence (created_at desc);

-- RLS checks buyer_id, but a direct client insert could still name someone
-- else's checkout reference. Enforce the ownership link in the database too.
create or replace function public.payment_evidence_verify_checkout_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.checkout_attempts ca
    where ca.reference = new.checkout_reference
      and ca.buyer_id = new.buyer_id
  ) then
    raise exception 'checkout reference does not belong to this buyer';
  end if;
  return new;
end;
$$;

revoke all on function public.payment_evidence_verify_checkout_owner() from public, anon;
grant execute on function public.payment_evidence_verify_checkout_owner() to authenticated, service_role;

drop trigger if exists payment_evidence_verify_checkout_owner on public.payment_evidence;
create trigger payment_evidence_verify_checkout_owner
  before insert on public.payment_evidence
  for each row execute function public.payment_evidence_verify_checkout_owner();

alter table public.payment_evidence enable row level security;

revoke all on public.payment_evidence from public, anon, authenticated;
grant select, insert on public.payment_evidence to authenticated;
grant all on public.payment_evidence to service_role;

drop policy if exists payment_evidence_select_own on public.payment_evidence;
create policy payment_evidence_select_own on public.payment_evidence
  for select to authenticated
  using (buyer_id = auth.uid());

-- Submission is immutable for the buyer; an operator changes status/admin_note
-- through the service-role admin API only.
drop policy if exists payment_evidence_insert_own on public.payment_evidence;
create policy payment_evidence_insert_own on public.payment_evidence
  for insert to authenticated
  with check (buyer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private storage for proof images (uploads and signed URLs via service role)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  4194304, -- 4MB; the API enforces the same cap before uploading
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
