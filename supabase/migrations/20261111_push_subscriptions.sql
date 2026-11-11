-- 20261111_push_subscriptions.sql
--
-- Web Push subscriptions for installed-PWA order alerts.
--
-- One row per browser/device subscription. `endpoint` is unique across the
-- whole table because a push endpoint identifies a single browser install; if a
-- user signs in on another account the row is re-assigned on upsert.
--
-- Only the server (service role) reads and writes this table, so RLS is enabled
-- with no policies: the browser talks to /api/push/subscribe, never Supabase.
--
-- Safe to re-run.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Keep updated_at fresh when a device re-subscribes.
create or replace function public.touch_push_subscription()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
create trigger push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.touch_push_subscription();

comment on table public.push_subscriptions is
  'Web Push endpoints for FuhsiMarket PWA order notifications. Server-only.';
