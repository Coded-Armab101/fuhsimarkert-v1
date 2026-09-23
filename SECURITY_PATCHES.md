# Security hardening — 2026-09-18

This patch addresses payment/order integrity issues found during the authorized review.

## Fixed in code

- Marketplace Paystack checkout now stores a server-created checkout snapshot in Paystack metadata: product ID, quantity, unit price, expected total, currency and purpose.
- `/api/paystack/verify` now requires the marketplace purpose, NGN currency, valid snapshot, and exact payment equation:
  `Paystack amount + wallet contribution = frozen checkout total`.
- Payment verification now fulfills the frozen checkout snapshot instead of reading the mutable cart quantity after payment.
- Paystack webhook handling applies the same amount/snapshot/currency checks before fulfillment.
- Wallet-only checkout now includes the buyer service fee, matching the card checkout pricing model.
- Wallet-only references are deterministic for the same checkout snapshot, reducing concurrent duplicate wallet debits.
- Subscription verification now requires the expected purpose, user binding and NGN currency.
- Subscription reference replay is checked before changing role privileges, preventing repeated verification of one reference from extending the subscription.
- Product IDs in payment metadata are required to be unique and to match the checkout snapshot exactly.
- Cart cleanup now filters `carts.product_id` rather than `carts.id`.
- Delivery handoff codes use a cryptographically secure random generator instead of `Math.random()`.
- Product upload object names use `crypto.randomUUID()` instead of predictable timestamps/random strings.
- `is_sold` is only set when tracked stock is exhausted; unlimited-stock products are not marked sold.

## Database deployment requirement

Apply `supabase/migrations/20260918_security_payment_hardening.sql` against the production Supabase database. The application relies on unique `(order_ref, product_id)` order idempotency and unique payment subscription references.

The existing RLS/profile privilege hardening described in `SECURITY.md` still requires the production database state to match that audit. Do not weaken those policies to make the new payment code work.

## Validation note

`git diff --check` passes. A full TypeScript build could not be completed in the audit container because dependency installation timed out / the available `node_modules` did not contain the required type packages. Run `npm ci`, then `npx tsc --noEmit`, `npm run lint`, and `npm run build` before deployment.

## Additional hardening — 2026-09-23

- Seller order-status changes no longer write directly from the browser. They go through `/api/orders/seller-status`, which authenticates the seller and enforces `in_escrow -> packing -> ready_for_pickup` transitions. Buyer notifications are emitted server-side.
- Stock decrement is now an atomic Postgres operation (`decrement_product_stock`), preventing concurrent buyers from overselling a tracked product.
- Seller withdrawals now use transactional Postgres functions: balance deduction + withdrawal creation is atomic, and admin approval/rejection is a locked state transition. This prevents double refunds and stranded wallet funds.
- Role subscription activation is shared by browser verification and the Paystack webhook. The webhook is now a server-side backstop if the browser closes after payment.
- Product image URLs are enforced by a database trigger to point at the marketplace Supabase Storage bucket, preventing a seller from bypassing the UI and inserting arbitrary external tracking/hotlink URLs.
- High-value RLS policies are explicitly hardened for products, orders, wallets, withdrawals and notifications. Orders and wallet/withdrawal mutations are server-side only.
- Financial quantities/amounts are rejected unless they are safe integers, preventing overflow/precision abuse in payment calculations.
- Marketplace order references and subscription references have unique database constraints for idempotency.

### Required deployment step

Apply `supabase/migrations/20260923_security_hardening.sql` in the production Supabase SQL Editor before deploying this build. The application code intentionally depends on these database-side security boundaries.
