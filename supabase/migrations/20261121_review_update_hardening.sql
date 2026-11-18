-- Hardening for review updates.
--
-- The original `reviews_update_own` policy only checked the reviewer, so a
-- buyer could move a review to another product/order, or rewrite reviewer_id,
-- after the verified-purchase insert check had run. Three layers now apply:
--
--   1. Column privileges: authenticated users may update ONLY rating/comment.
--   2. RLS WITH CHECK: the reviewed order must still be a completed order that
--      belongs to the caller AND matches the review's product.
--   3. A BEFORE UPDATE trigger rejects any change to immutable identity fields
--      (also covers privileged/service-role updates that bypass RLS).

revoke update on public.reviews from public, anon, authenticated;
grant update (rating, comment) on public.reviews to authenticated;

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.buyer_id = auth.uid()
        and o.product_id = reviews.product_id
        and o.status = 'completed'
    )
  );

create or replace function public.reviews_enforce_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.order_id is distinct from old.order_id
     or new.product_id is distinct from old.product_id
     or new.reviewer_id is distinct from old.reviewer_id
     or new.created_at is distinct from old.created_at then
    raise exception 'review identity and purchase fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_enforce_immutable_fields on public.reviews;
create trigger reviews_enforce_immutable_fields
  before update on public.reviews
  for each row execute function public.reviews_enforce_immutable_fields();
