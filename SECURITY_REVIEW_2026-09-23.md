# FUHSI Market — Security & Bug Hardening Review

Date: 2026-09-23

This review covers the supplied application source. It is a source-code audit; the
production Supabase policies/schema cannot be proven from the ZIP alone.

## Fixed in this patch

### Critical/high impact

1. **Paystack verification was a state-changing GET**
   - `/api/paystack/verify` now accepts `POST` only.
   - The browser callback was updated accordingly.
   - This removes a CSRF-friendly GET endpoint that could create orders/debit wallet funds.

2. **Concurrent Paystack webhook + browser verification could decrement stock twice**
   - Added `marketplace_fulfillments` with `(order_ref, product_id)` idempotency.
   - Added `fulfill_marketplace_item()` as an atomic PostgreSQL function.
   - Stock decrement and `is_sold` transition now occur through that function.

3. **Admin withdrawal rejection had a double-refund race**
   - Replaced read/update/refund sequence with atomic `process_withdrawal()`.
   - Two admin requests can no longer refund the same withdrawal twice.

4. **Seller order status could be changed directly through Supabase if an overly broad RLS UPDATE policy existed**
   - Added a server-only status workflow endpoint.
   - Added an order trigger rejecting authenticated direct status changes.
   - The server RPC enforces seller ownership and only allows:
     `in_escrow -> packing -> ready_for_pickup`.

5. **OAuth callback had an open-redirect risk**
   - `next` is now restricted to same-origin relative paths.
   - Absolute URLs, protocol-relative URLs, and backslash-based variants fall back to `/buyer`.

### Payment/data validation

6. Cart quantities are now required to be positive safe integers and duplicate product IDs are rejected.
7. A checkout now fails if any cart product disappears instead of silently pricing only the products returned by the database.
8. Product prices are required to be non-negative safe integers before payment initialization.
9. Financial totals are required to remain safe integers.
10. Delivery/customer metadata has bounded field lengths.
11. Payment verification checks the returned Paystack reference against the requested reference.
12. Subscription verification checks reference, NGN currency, exact plan amount, and rate limits repeated verification attempts.
13. Withdrawal requests now validate 10-digit Nigerian account numbers, field lengths, safe integer amounts, and are rate limited.
14. Wallet-only checkout and payment verification are rate limited.
15. Signup no longer displays raw Supabase/Auth errors to users; detailed errors remain server-console-only.

### HTTP hardening

Added baseline response headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- HSTS for production HTTPS deployments

## Required production action

Apply:

`supabase/migrations/20260923_security_bug_hardening.sql`

The application now depends on these PostgreSQL functions/tables for the affected
money/order paths. Do **not** deploy the changed application code without applying
the migration to the same database.

Also re-run the existing RLS audit from `SECURITY.md`, especially policies for:

- `profiles`
- `products`
- `orders`
- `wallets`
- `withdrawals`
- `carts`
- `wishlists`
- Storage buckets

The service-role key must remain server-only.

## Validation performed in the supplied environment

- Changed TypeScript/TSX files successfully parsed with the installed TypeScript compiler.
- `git diff --check` passes.
- No `dangerouslySetInnerHTML`, `eval`, `new Function`, `document.write`, or `javascript:` sinks were found in `app`, `utils`, `context`, or `proxy.ts`.
- Full project type-check/build could not be completed because the supplied project has no installed `node_modules`; dependency installation/network access was unavailable in the audit environment.
- `npm audit` could not reach the npm registry, so dependency CVE status remains **unverified**. Run `npm ci`, `npm audit`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` before deployment.
