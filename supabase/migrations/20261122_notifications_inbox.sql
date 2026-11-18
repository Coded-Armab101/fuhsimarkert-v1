-- In-app notification inbox.
--
-- The server already writes rows to public.notifications for new orders, status
-- changes, completion, disputes and refunds, but no UI ever read that table:
-- the bell derived notices from `orders` and kept "unread" in localStorage, so
-- alerts written while the user was offline were invisible. This migration
-- gives the table the columns the inbox needs and lets a signed-in user mark
-- their OWN notifications read. All notification creation stays server-side.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid,
  type text not null,
  title text not null,
  message text not null,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The table already exists in older projects; add only the missing columns.
alter table public.notifications add column if not exists url text;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists created_at timestamptz not null default now();

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_owner on public.notifications;
create policy notifications_select_owner on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- A user may mark their own notifications read, but cannot change the content,
-- the recipient or the linked order.
drop policy if exists notifications_mark_read_owner on public.notifications;
create policy notifications_mark_read_owner on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on public.notifications from public, anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select on public.notifications to authenticated;
-- Server-side writers (order lifecycle) must keep full update rights, and must
-- be able to insert new rows regardless of the column-level client grant.
grant all on public.notifications to service_role;
