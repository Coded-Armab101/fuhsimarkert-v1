-- Catalogue categories
--
-- Categories are stored as free text in public.products.category. The shared
-- list of allowed values now lives in utils/categories.ts so the seller form
-- and the marketplace read the same options. No new category table is needed.
--
-- This migration only adds indexes that make the public browse query
-- (`is_available = true`, optionally filtered by category) cheap.

create index if not exists products_category_available_idx
  on public.products (category)
  where is_available = true;

create index if not exists products_available_idx
  on public.products (is_available);

comment on column public.products.category is
  'Product category. Shared options are defined in utils/categories.ts.';

-- Optional: normalise legacy category labels left over from older landing-page
-- filters. Review the result of the SELECT before running the UPDATE, and only
-- run it if you actually have rows using these labels.
--
-- select category, count(*) from public.products group by category order by 1;
--
-- update public.products set category = 'Textbooks & Academics' where category = 'Books';
-- update public.products set category = 'Electronics & Gadgets' where category = 'Tech & Gadgets';
-- update public.products set category = 'Hostel & Room Essentials' where category = 'Campus Essentials';
-- update public.products set category = 'Fashion & Apparel' where category = 'Fashion';
