This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Security deployment note

Before deploying the hardened build, apply `supabase/migrations/20260923_security_hardening.sql` to the production Supabase project. The build expects the database-side RLS, atomic stock/withdrawal functions, profile privilege trigger, image URL validation trigger, and payment idempotency indexes from that migration.

Also apply `supabase/migrations/20261112_verification_storage.sql`. It sets the private `verification-documents` bucket to a 25MB per-file limit and (re)creates the owner-only storage policies, so seller ID images and selfie videos upload reliably. Without it, a hand-configured 1MB bucket limit still rejects phone photos even though the app allows 10MB.

Then apply `supabase/migrations/20261113_features.sql`. It adds product selling units and per-seller delivery fees, the `search_products` function (so search can match seller names without exposing profiles), the `reviews` table plus public `product_ratings` view, and the `confirm_order_group` / `dispute_order` escrow functions the app already calls. Without it, search falls back to title/description/category, ratings stay blank, and Confirm receipt fails.

Then apply `supabase/migrations/20261114_ops.sql`. It fixes the multi-item/multi-seller checkout (composite uniqueness on `carts(user_id, product_id)` and `orders(order_ref, product_id)` instead of single-column keys), adds the card-refund columns and the `claim_order_refund` / `finalize_order_refund` functions, adds Paystack transfer fields to `withdrawals`, exposes the public `verified_seller_ids` badge RPC, and raises the `product-images` bucket to 5MB per file. **Without this migration, saving a cart/order with more than one product can fail silently.**

Next apply `supabase/migrations/20261115_payout_hardening.sql`. It atomically reserves one Paystack transfer reference per withdrawal (preventing double payouts), blocks an approve/reject race, makes simultaneous withdrawal requests safe, and adds exactly-once wallet fallback bookkeeping for an asynchronous `refund.failed` webhook.

Then apply `supabase/migrations/20261116_order_reliability.sql`. It removes notification side effects from escrow release/refund transactions, adds the order status/timestamp fields used by the UI, and exposes a service-only checkout preflight. Card and wallet checkout now stop before moving money if the database still has legacy single-item constraints.

Apply `supabase/migrations/20261117_broadcasts_variants.sql` for product size/colour variants and administrator broadcasts.

Next apply `supabase/migrations/20261118_trust_safety.sql`. It adds legal and seller-verification consent records, account suspension and moderation audit fields, disputed-product return confirmation, dispute audit events, and the Paystack transfer error field. The matching build expects this migration before signup, verification, suspension, dispute and withdrawal actions are used.

Then apply `supabase/migrations/20261119_wallet_funding_fees.sql`. It adds source-aware wallet credit lots, buyer wallet funding, Paystack provider-fee records, the 14-day cash-out hold, and the withdrawal fee debits needed by the money report.

Then apply `supabase/migrations/20261120_wallet_subscription_renewal.sql`. It lets sellers renew their monthly plan from spendable wallet balance (including money still inside the 14-day cash-out hold), records the subscription debit, and can reverse it if activation fails. Without it, the wallet renewal button stays hidden because the wallet summary RPC is unavailable.

Then apply `supabase/migrations/20261121_review_update_hardening.sql`. It limits review updates to `rating`/`comment` via column grants, RLS and a trigger, so a buyer cannot move a review to another product/order after the verified-purchase check.

Then apply `supabase/migrations/20261122_notifications_inbox.sql`. It adds `read_at`, `url` and `created_at` to `public.notifications`, an index for the inbox query, and an RLS update policy plus column grant so a signed-in user can only mark their OWN notifications read. Without it the notification bell and bottom-nav badge cannot work, and `POST /api/notifications/read` will fail.

Finally apply `supabase/migrations/20261123_product_discounts.sql`. It adds `products.discount_percent` (whole numbers 0–100, default 0) with a check constraint. Without it, sellers cannot save a percentage-off discount and product saves will fail with an unknown-column error. Checkout always charges the discounted price; the 3% seller commission and tiered buyer fee are computed from that discounted amount.

### Notifications (in-app inbox + Web Push)

Both buyers and sellers receive notifications for the full order lifecycle — new paid order, packing/ready for pickup, completion, disputes, returns and refunds. Two delivery channels are used together:

1. **In-app inbox** — every event writes a persistent row to `public.notifications`. The bell (`OrderNotificationBell`) and the buyer bottom-nav badge read unread rows (`read_at is null`) from that table, so an alert generated while the tab was closed is still visible on return. `POST /api/notifications/read` marks the signed-in user's rows read. Messages are only ever written by trusted server code (`utils/notifications.ts`); clients get SELECT and `UPDATE (read_at)` only.
2. **Web Push** — `utils/notifications.ts` also calls `sendPushToUsers()` so the same event reaches the phone even when the app is closed. Sellers enrol from Settings or the bell; buyers enrol from the profile page ("Get order alerts on your phone") or the bell. Both roles use the same VAPID keys and device subscription (stored per user).

All notification failures are best-effort and never block the order/payment transition that triggered them. Email reminders (via `RESEND_API_KEY`) remain an additional channel but are not required for the in-app inbox to work.

### Product image uploads

Seller product images are uploaded through `POST /api/upload/product-image`, which authenticates the seller and enforces the per-seller storage quota on the server using the service-role client. A failed storage listing is treated as an error (never as zero usage), and every object in the seller's prefix is counted via pagination. The app enforces a 4MB per-file cap to stay under Vercel's 4.5MB serverless request-body limit; the bucket's own limit can remain higher.

### Security headers / CSP

`vercel.json` adds a `Content-Security-Policy` (plus `X-Content-Type-Options` and `Referrer-Policy`) to every deployment route, including Vercel-internal paths such as `/.well-known/vercel/security/request-challenge`. This covers pages, API route handlers and redirects, so security scanners no longer report a missing CSP header. The policy allow-lists Supabase (auth/storage), Paystack Inline's checkout iframe and SDK origins, blob/data images, and the service worker. Local development adds the same header from `next.config.ts` with `'unsafe-eval'` for React's debug tooling; that keyword is deliberately absent from the production policy.

## Tests

Run the security regression tests (safe image URLs, same-origin redirects and push-submission SSRF validation) with:

```bash
npm test
```

They use Node's built-in test runner and require no extra dependency.

## Transactional email (Resend)

Order placed, order completed, refund and payout emails are sent through Resend's REST API using plain `fetch`. Email is best-effort: a missing key or a provider outage never blocks an order or a payout.

```bash
RESEND_API_KEY=re_...
EMAIL_FROM="FuhsiMarket <orders@your-verified-domain.com>"
NEXT_PUBLIC_SITE_URL=https://your-site.example
```

`EMAIL_FROM` must be a verified sender/domain in Resend. When `RESEND_API_KEY` is absent, every send is skipped and the rest of the app behaves normally.

## Automatic seller payouts (Paystack Transfers)

Approving a withdrawal now sends the money through Paystack instead of only updating the ledger:

1. Enable **Transfers** on your Paystack account and keep enough balance in the Paystack wallet.
   Paystack **Starter Business** accounts cannot initiate third-party payouts; complete Paystack business verification/upgrade first. When Paystack returns that specific block, FuhsiMarket records the transfer as `not-started`, allowing an admin to reject the request and safely return the held amount to the seller wallet.
2. Disable transfer OTP for API transfers in the Paystack dashboard (Settings → Preferences → Transfer OTP). If OTP is on, approve returns a clear error and the withdrawal stays pending.
3. Use `PAYSTACK_SECRET_KEY` from the same account that receives checkout payments.
4. Set the Paystack webhook URL to `https://your-site.example/api/webhooks`. Refund status events use this same signed endpoint; if a queued card refund later fails, its card amount is credited to the buyer's wallet exactly once.

Bank names are resolved against Paystack's live NGN bank list (with aliases such as GTB/UBA). If a seller's bank cannot be matched, the withdrawal stays pending with the reason shown to the admin, and no money moves. A transfer that Paystack reports as `pending`/`queued`/`processing` stays pending until a later Approve verifies it as `success`; only then is the ledger marked `paid` and the seller emailed.

If an older failed attempt is already recorded as `unknown`, Reject remains blocked because an API or network error does not prove that money was not sent. Search the **exact transfer reference** in Paystack first. If no transfer exists, use **I checked Paystack** on the payout row, record the evidence note, then Reject. This audited two-step reconciliation prevents a bank payout plus wallet return from paying the same withdrawal twice.


For password reset, add `<your site origin>/auth/callback?next=/reset-password` to the Supabase Auth **Redirect URLs** allow-list.

## Phone alerts for buyers and sellers (Web Push)

Sellers can turn on sales alerts from **Seller Settings** or the bell menu in the
seller header. Buyers can turn on order alerts from the **Account** page (the
"Get order alerts on your phone" card) or from the bell menu in the buyer home
header. Alerts use a service worker (`public/sw.js`) plus Web Push, so they arrive
on an installed PWA even when the app is closed.

1. Apply `supabase/migrations/20261111_push_subscriptions.sql`.
2. Generate a VAPID key pair (for example `npx web-push generate-vapid-keys`).
3. Add these environment variables to the deployment:

   ```bash
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:you@example.com
   ```

4. Redeploy, then enable alerts from **Seller Settings** or the **Buyer Account** page (or either bell menu).

Push is best-effort: if the keys are missing or a device is offline, the order is
still recorded and the in-app bell still updates. Installation and notifications
require HTTPS (or localhost). On iPhone, the app must be added to the Home Screen
(iOS 16.4+) before alerts can be enabled.

