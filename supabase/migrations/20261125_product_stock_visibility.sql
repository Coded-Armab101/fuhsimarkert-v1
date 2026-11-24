-- Seller-controlled stock visibility.
--
-- Stock counts stay private unless a seller explicitly opts in. Buyers see the
-- exact "In stock · N left" label only when this flag is true AND stock > 0;
-- the "Sold out" state is still shown when stock reaches zero. No index: this
-- low-cardinality boolean is read with the product row, never filtered on.

alter table public.products
  add column if not exists show_stock_count boolean not null default false;

comment on column public.products.show_stock_count is
  'Seller opt-in to showing the exact remaining stock to buyers (only shown when stock > 0).';
