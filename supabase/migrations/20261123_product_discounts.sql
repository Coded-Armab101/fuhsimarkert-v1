-- Seller percentage-off discounts.
--
-- products.price stays the original list price in kobo. A seller may set a
-- whole-percentage discount (0–100); the app computes the effective unit price
-- with utils/pricing.ts `discountedUnitPriceKobo()` on BOTH the Paystack charge
-- and the immutable order snapshot, so commission, buyer fee and escrow are all
-- based on the discounted amount. The check constraint stops a bad value being
-- written directly from a client or SQL console.

alter table public.products
  add column if not exists discount_percent integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_discount_percent_chk'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_discount_percent_chk
      check (discount_percent >= 0 and discount_percent <= 100);
  end if;
end;
$$;

comment on column public.products.discount_percent is
  'Whole percentage off the list price (0–100). Checkout charges price minus this discount.';
