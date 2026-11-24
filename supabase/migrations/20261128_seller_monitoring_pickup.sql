-- Seller monitoring and pickup-staff activity logs (2026-11-28).
--
-- Operators need one place to review a seller's products, disputes, buyer
-- complaints, payment problems and moderation history BEFORE suspending them.
-- Pickup staff also need a timestamped handover trail that the operator board
-- can audit. All new tables are private: only the service-role API may read or
-- write them, so a client cannot forge or edit an activity record.

-- ---------------------------------------------------------------------------
-- 1) Pickup staff role
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_pickup_staff boolean not null default false;

create index if not exists profiles_pickup_staff_idx
  on public.profiles (id)
  where is_pickup_staff = true;

create table if not exists public.pickup_staff_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  action text not null check (action in ('assigned', 'removed')),
  reason text not null check (char_length(reason) between 5 and 500),
  created_at timestamptz not null default now()
);

create index if not exists pickup_staff_events_user_created_idx
  on public.pickup_staff_events (user_id, created_at desc);

alter table public.pickup_staff_events enable row level security;
revoke all on table public.pickup_staff_events from public, anon, authenticated;
grant select, insert on public.pickup_staff_events to service_role;

-- ---------------------------------------------------------------------------
-- 2) Pickup handover log
-- ---------------------------------------------------------------------------
create table if not exists public.pickup_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  order_ref text not null
    check (order_ref ~ '^[A-Za-z0-9_-]{1,200}$'),
  delivery_code text
    check (delivery_code is null or delivery_code ~ '^[A-Za-z0-9_-]{1,100}$'),
  event_type text not null check (
    event_type in (
      'arrived',
      'picked_up',
      'handed_to_buyer',
      'returned',
      'missing',
      'issue'
    )
  ),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists pickup_events_created_idx
  on public.pickup_events (created_at desc);
create index if not exists pickup_events_order_ref_idx
  on public.pickup_events (order_ref, created_at desc);
create index if not exists pickup_events_staff_idx
  on public.pickup_events (staff_id, created_at desc);

alter table public.pickup_events enable row level security;
revoke all on table public.pickup_events from public, anon, authenticated;
grant select, insert on public.pickup_events to service_role;

-- ---------------------------------------------------------------------------
-- 3) Internal seller-review notes
-- ---------------------------------------------------------------------------
create table if not exists public.seller_review_events (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  note text not null check (char_length(note) between 10 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists seller_review_events_seller_created_idx
  on public.seller_review_events (seller_id, created_at desc);

alter table public.seller_review_events enable row level security;
revoke all on table public.seller_review_events from public, anon, authenticated;
grant select, insert on public.seller_review_events to service_role;
