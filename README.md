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

Then apply `supabase/migrations/20261123_product_discounts.sql`. It adds `products.discount_percent` (whole numbers 0–100, default 0) with a check constraint. Without it, sellers cannot save a percentage-off discount and product saves will fail with an unknown-column error. Checkout always charges the discounted price; the 3% seller commission and tiered buyer fee are computed from that discounted amount.

Finally apply `supabase/migrations/20261124_manual_payment_confirmation.sql`. It creates `checkout_attempts` (the frozen, server-side checkout snapshot written before Paystack initialize) and an append-only `manual_payment_confirmation_events` audit table. Without it, checkout cannot start because there is nowhere to record the payment reference, and the admin Payments tab cannot verify a paid-but-unrecorded order.

Then apply `supabase/migrations/20261125_product_stock_visibility.sql`. It adds `products.show_stock_count` (default `false`) so sellers control whether buyers see the remaining-unit count on a listing.

Then apply `supabase/migrations/20261126_support_payment_evidence.sql`. It creates in-app support tickets, threaded replies and payment-proof submissions, plus the private `payment-proofs` Storage bucket. Without it the Support Center and failed-payment evidence form cannot work, and admin proof links cannot be signed.

Apply `supabase/migrations/20261127_platform_absorbs_transfer_fees.sql` after the earlier wallet migrations. It makes the platform absorb Paystack transfer/stamp charges from the 3% seller commission: new withdrawals debit only the bank amount while the provider fee stays on the row for accounting. Historical rows are deliberately left untouched.

Finally apply `supabase/migrations/20261128_seller_monitoring_pickup.sql`. It adds the pickup-staff role, tamper-proof pickup handover logs, staff-role change audit, and internal seller-review notes used by the admin Seller activity board. Pickup staff cannot write these tables directly; all logs go through authenticated API routes with the service role.

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

Run the regression tests (safe image URLs, same-origin redirects, push-submission SSRF validation, pricing/platform-fee rules and the product-variant flow) with:

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

## Customer support WhatsApp + paid-but-unrecorded orders

Set the support number that buyers can chat with when a bank transfer was made but the order did not appear:

```bash
NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER=+234 803 000 0000
```

Formatting (spaces, dashes, `+`) is stripped automatically; a Nigerian 11-digit `0803…` number is converted to `234803…`. The floating **Need help?** button and the **Contact support** link on a failed payment banner only appear when a plausible number is configured. Because `NEXT_PUBLIC_*` values are inlined at build time, changing the number requires a Vercel redeploy.

Every checkout now writes a `checkout_attempts` row with a generated reference before Paystack is initialised. Operators recover a stuck payment from **Admin board → Payments**:

1. Give the buyer's reference/email and ask them to confirm the bank transfer and amount.
2. Click **Re-check Paystack**. The server verifies the exact reference against Paystack and only records the order when the transaction is `success` with a matching buyer, NGN currency and charged amount. This is the normal, safest path.
3. Only if Paystack genuinely has not processed it, click **Confirm manually**, enter the evidence note (bank, account, date, amount, buyer's proof) and tick the attestation. The order and escrow rows are then created from the frozen snapshot.

Both actions call the existing idempotent `recordOrder()` routine, so a late webhook, a buyer retry and an admin action can never create two orders, debit a wallet twice or double-count escrow. A conditional status update makes confirmation single-winner, and every action is written to the append-only audit table with the admin id and note.

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

## Failed and hung payments

Every marketplace checkout writes a frozen `checkout_attempts` row (reference, items, expected total, wallet split, delivery details) **before** Paystack is initialized. If a buyer says they transferred but no order appeared:

1. Ask the buyer for the payment reference/email **and proof of payment** (bank debit SMS, receipt or transfer screenshot). Attach that proof to the support ticket.
2. Open **Admin board → Payments** and click **Re-check Paystack**. This is the normal, safest path: the server verifies the exact reference against Paystack and records an order only when the transaction is `success`, NGN, for the expected amount and for that buyer.
3. A transfer Paystack still reports as `pending`/`queued`/`processing` is **hung, not failed**. Do not confirm it manually; ask the buyer to wait and re-check later. Webhooks and the buyer's return-verification call are idempotent, so a late retry cannot duplicate the order.
4. **Confirm manually** is a last resort, used only when Paystack genuinely has no record of the money. Require the buyer's proof in the ticket, enter a detailed evidence note and tick the attestation. The order/escrow are created from the frozen snapshot through the same idempotent `recordOrder()` path, so a late webhook, buyer retry and admin action converge on one order. A conditional status update makes confirmation single-winner, and every action is appended to `manual_payment_confirmation_events` with the admin id and note. Manual confirmation is audited and never a substitute for a successful Paystack re-check.

## Support

- Buyers can open tickets from **Account → Support**. `support_tickets` and `support_ticket_messages` store the categories (`payment`, `order`, `product`, `account`, `other`), status (`open`, `pending`, `resolved`, `closed`) and threaded replies. Payment issues can also attach proof to `checkout_attempts` via the payment-evidence form. Work tickets from the admin support queue and link them to the payment reference/Paystack reference before changing an order.
- WhatsApp is the optional fast channel, not the system of record. After resolving a chat, record the outcome on the ticket. The floating **Need help?** button and the **Contact support** link on the failed-payment banner open WhatsApp when a number is configured:

  ```bash
  NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER=+234 803 000 0000
  ```

  Spaces, dashes and `+` are stripped automatically; a Nigerian `0803…` number becomes `234803…`. `NEXT_PUBLIC_*` values are inlined at build time, so changing the number needs a Vercel redeploy. See the earlier **Customer support WhatsApp + paid-but-unrecorded orders** section for the buyer-facing behaviour.
- Use WhatsApp for proof collection and reassurance only. Money and order decisions happen in the admin board so they are idempotent and audited. Never ask a buyer for OTPs, PINs or card details.

## Operator review, date filters and pickup logs

The admin board has one global date filter — **All time / Today / This week / This month / This year** — applied consistently to overview, orders, people, payouts, verifications, storage, broadcasts, payments, support, seller activity and pickup logs. Windows are UTC-based (weeks start Monday) so server-rendered numbers and API lists agree.

Before suspending a seller, open **People → Seller review** (or the **Seller activity** tab). That view gathers the seller's products, orders, disputes, low-rated reviews/support complaints, hung checkout attempts, moderation history and internal review notes in one place. Suspension still requires a reason and writes an audit event; pickup-role changes do too. Birthdays (when a profile has a date of birth) are shown in the People directory so the team can recognise regular customers.

Pickup staff are assigned from **People → Pickup** with a reason. They get `/pickup`, where they log timestamped events (`arrived`, `picked_up`, `handed_to_buyer`, `returned`, `missing`, `issue`) for a real order reference. A hand-to-buyer event must include the matching delivery code. The API verifies the staff member from their signed-in session and writes with the service role, so a client cannot forge or edit another staff member's log. Operators see every event, the current staff list and every role change under **Admin → Pickup logs**.

## Seller withdrawal fees

Paystack transfer and stamp charges on seller payouts are a **platform cost funded by the 3% seller commission**. The expected fee is still computed server-side and stored on `withdrawals.transfer_fee_kobo` for accounting (source `platform_commission`), but it is never added to the seller's wallet debit. Since migration `20261127_platform_absorbs_transfer_fees.sql`, `wallet_debit_kobo = amount_kobo` for every new withdrawal, and a rejected withdrawal restores only the bank amount. Historical rows are deliberately not rewritten; they still show their original debit and the seller wallet labels their fee as a platform-paid transfer cost. Do not re-add `transfer_fee_kobo` to seller debits in reports or UI.

## Infrastructure and traffic plan

Target: roughly 1,000 peak daily active users during a campus rush, with room to grow. Quotas below are late-2026 figures — verify them on the provider pricing pages before a launch.

- **Supabase free tier reality:** 500 MB database, 1 GB file storage, 5 GB egress, 50k MAU, 2 active projects, shared Nano compute (~0.5 GB RAM, 60 direct connections / 200 pooled clients), no automatic backups or PITR, and the project pauses after a week of inactivity. That fits 1k *daily* users if queries stay small, but it is **not** a 1k-*concurrent-request* guarantee. Use the pooled/transaction and HTTP APIs from Vercel; never open a long-lived direct `postgres://` connection per serverless instance. Keep service-role writes in short RPC calls.
- **Schema discipline:** keep RLS enabled on user tables, service-role-only execution for money functions, and the indexes already added by the ops migrations (`orders(buyer_id/seller_id, status, created_at)`, `withdrawals(seller_id, status)`, `wallet_credits(user_id, withdrawable_at)`, `checkout_attempts(reference/status)`). Check `pg_stat_statements` for sequential scans before adding more indexes. Do server-side aggregation and keyset/range pagination for order, payout and admin lists — never `select *` into the browser and slice there.
- **Vercel Hobby reality:** 1M function invocations, 4 active CPU-hours, 100 GB fast data transfer, 1M CDN requests and 5k image transformations per month; 300s max function duration, 2 GB memory, 4.5 MB request body, and one default function region. Keep API handlers short (verify signature, write idempotently, return), keep uploads under the 4 MB app cap with direct-to-Storage signed URLs, and avoid long-running payout/reconciliation work inside a request. Hobby cannot buy more usage: exceeding the allotment pauses the project.
- **Images and CDN:** serve product images through Supabase Storage public URLs plus `next/image`/Vercel image caching; transform/resize on upload rather than per request. A 1 GB free bucket holds only ~250 photos at 4 MB, so plan a storage upgrade or an external CDN before catalogue photos grow.
- **Caching:** static legal/marketing pages and short ISR on catalogue/category pages; `cache: 'no-store'` for wallet, orders, payments and admin views. Cache Supabase Storage assets at the CDN edge. Never cache personalized balances or one-time payment responses.
- **Rate limiting:** throttle login/OTP, payment initialize/verify, wallet funding, withdrawals and uploads per user + IP. Put the counters in a small Supabase table or an external store (e.g. Upstash); keep Paystack webhooks signature-verified and idempotent rather than relying on rate limits.
- **Background work:** use `pg_cron`/`pgmq` (or a small queue table with a worker) for retries of email/webhook delivery, stale `checkout_attempts` cleanup and daily reconciliation reports. Do **not** auto-retry money movement: payouts stay admin-approved and reference-locked. The 14-day wallet hold is computed at read time, so it needs no cron.
- **Monitoring and backups:** watch Supabase DB size/CPU/connections and slow queries, Vercel function duration/errors/Speed Insights, and Paystack failed-transfer alerts. Free Supabase has no automatic backups — export `pg_dump` nightly to external storage if the data matters, or upgrade to Pro for 7-day daily backups and optional PITR.
- **When to upgrade:** move to Supabase Pro when the DB passes ~300–400 MB, egress passes ~3–4 GB, storage passes ~700 MB, pooled connections sit above ~70%, or p95 money queries exceed ~200–300 ms. Move to Vercel Pro when you need more invocations/CPU, multiple regions, longer functions or paid overages instead of a hard pause. A Supabase region is fixed at project creation and Vercel Hobby runs in a single region by default; pick the closest supported region up front and plan a deliberate migration (not a toggle) if you need to move. Paystack is Nigeria-focused, so keep the payment path close to Nigerian users and monitor its dashboard separately.

