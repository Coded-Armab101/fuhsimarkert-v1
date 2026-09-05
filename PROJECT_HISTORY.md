# FUHSI Market — Project History & Handover Notes

Running log so any session (human or Claude) can pick up exactly where the last
one stopped. **Append to the Session Log at the bottom; keep the sections above
it accurate.**

---

## 1. What this project is

A campus marketplace for FUHSI students. Buyers browse listings, pay via
Paystack into escrow, and sellers/affiliates unlock their dashboards with a
monthly role subscription.

| Piece | Choice |
| --- | --- |
| Framework | **Next.js 16.2.6**, App Router, Turbopack |
| UI | React 19.2.4, Tailwind CSS v4, `lucide-react` icons |
| Backend | Supabase (Auth + Postgres + RLS) |
| Payments | Paystack — `@paystack/inline-js` **v2** popup + REST API |
| Language | TypeScript, `strict: true` |

> ⚠️ Next.js 16 is **not** the Next you may remember. `cookies()`, `headers()`
> and `params` are all async. Read `node_modules/next/dist/docs/` before
> writing framework code (see `AGENTS.md`).

## 2. Running it locally

```bash
npm run dev      # http://localhost:3000
npm run build    # production build — passes as of 2026-08-28
npx tsc --noEmit # type check — clean
npx eslint .     # lint (17 pre-existing warnings, listed in the 2026-08-28 log)
```

`next.config.ts` whitelists an ngrok host in `allowedDevOrigins` — that tunnel
is how Paystack webhooks reach the local dev server.

A passing `build` should print `ƒ Proxy (Middleware)` in the route table. If it
does not, Next has stopped picking up the root `proxy.ts` and **every route is
unprotected** — see §5 #9.

### Which URL to test on: `localhost` or the ngrok tunnel?

**Role subscriptions: `localhost`.** That flow never receives an inbound
callback. `/api/subscription/verify` confirms the payment by making an
**outbound** `GET https://api.paystack.co/transaction/verify/:ref` with the
secret key, triggered by the browser's `onSuccess`. Outbound HTTPS works fine
from `localhost`, so the tunnel adds nothing but a second cart (see Known
Issue #6) and a hostname that must be kept in `allowedDevOrigins`.

**The tunnel is only for `/api/webhooks`** — the Paystack → server *push* that
the cart checkout / escrow flow needs. As of 2026-08-28 the webhook's signature
check and its insert are correct and tested, but it still cannot write until the
`orders.product_id` migration is applied and `SUPABASE_SERVICE_ROLE_KEY` is set
(both in `SECURITY.md`, "Two things still need YOU"), and the checkout button
that would trigger it is still a stub (#7). So there is still nothing to test
through the tunnel end to end.

Caveat to fix eventually: because activation rides on the browser calling
`/api/subscription/verify`, a tab that dies between payment and that call leaves
money taken and no role granted. A `charge.success` webhook, or a
"re-verify pending reference" check on page load, would be the backstop.

### Environment variables (`.env.local`)

| Var | Used by |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server clients |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | (no longer needed for role checkout — server initialize is used instead) |
| `PAYSTACK_SECRET_KEY` | `/api/subscription/*`, `/api/paystack`, `/api/webhooks` |
| `NEXT_PUBLIC_SITE_URL` | Paystack `callback_url` for cart checkout |
| `SUPABASE_SERVICE_ROLE_KEY` | **STILL NOT SET — `/api/webhooks` cannot write escrow orders without it.** `utils/supabase/admin.ts` throws a clear error at call time rather than silently falling back to the anon key (which is what the now-deleted `api/seller/verify-subscription` did). Server-only: never `NEXT_PUBLIC_`, never imported into a Client Component — it bypasses RLS entirely. |

## 3. Code map

```
proxy.ts              ROOT-level route gate + Supabase session refresh.
                      Next 16 renamed `middleware` → `proxy`; it must sit here,
                      beside app/, NOT inside it.
app/
  (auth)/login, signup
  (dashboard)/
    layout.tsx        server-side auth gate (backstop to proxy.ts)
    buyer/            page, cart, orders, wishlist, profile ← role subscription lives here
    seller/           page, products, products/new, orders, settings
      layout.tsx      bottom nav; hidden on the paywall
      subscribe/      the seller PAYWALL (proxy.ts redirects non-sellers here)
    afilliate/        placeholder (note the typo in the folder name — proxy gates
                      '/afilliate', so fixing the spelling means fixing proxy too)
  admin-dashboard/    placeholder; gated closed for everyone (no admin column exists)
  marketplace/        public landing
  api/
    subscription/initialize   start a role subscription payment (server sets the price)
    subscription/verify       confirm payment with Paystack, then activate the role
    paystack/                 cart checkout → Paystack initialize
    webhooks/                 Paystack `charge.success` → create escrow orders
context/CartContext.tsx   client-side cart state
utils/
  supabase.ts         browser client  → import from '@/utils/supabase'
  supabase/server.ts  server client, cookie-scoped, respects RLS (async, await it)
  supabase/admin.ts   SERVICE ROLE client — BYPASSES RLS. Webhook only. Never
                      import from a Client Component.
  plans.ts            role subscription prices in kobo — the single source of truth
  money.ts            naira ↔ kobo conversion + display formatting
  roles.ts            the one definition of "has a paid, unexpired role"
  rate-limit.ts       in-memory fixed-window limiter for the payment routes
types/paystack-inline-js.d.ts   hand-written types for @paystack/inline-js (ships none)
```

Deleted 2026-08-28: `app/api/seller/verify-subscription/route.ts` (granted roles
with no auth — `SECURITY.md` C1) and `app/middleware.ts` (empty, and the wrong
filename for Next 16).

## 4. Database reality check (read this before writing any query)

The live Supabase schema contains **two generations of design** and the UI only
uses one of them. Columns that "look right" often do not exist.

**Tables the app actually uses:** `profiles`, `products`, `carts`, `orders`,
`wishlists`, `wallets`.

**Tables from an earlier draft, currently unused by the UI:** `listings`,
`users`, `escrow_transactions`, `payouts`, `disputes`, `affiliates`,
`referrals`, `kyc_verifications`, `audit_logs`.

### `profiles` — the columns that exist

`id`, `full_name`, `matric_no`, `hostel`, `dob`, `bank_name`, `account_number`,
`account_name`, `paystack_recipient_code`, `user_persona`, `is_seller`,
`seller_active`, `subscription_expires_at`, `updated_at`

**Traps that have already cost debugging time:**

- **`public.users` is a decoy for the app, but load-bearing for the schema.** It
  has `role` and `subscription_status` columns that look exactly like what you
  want, and the `handle_new_user()` trigger on `auth.users` inserts a row there
  on signup — but **nothing else in the app ever reads or writes it**. When
  checking whether a role activated, look at **`profiles`**, not `users`. (This
  has already been mistaken for a bug once.) It cannot simply be dropped,
  though: `orders.buyer_id`, `orders.seller_id` (both `RESTRICT`) and
  `listings.seller_id` (`CASCADE`) are FK'd to it, as are `affiliates`,
  `referrals`, `payouts`, `disputes`, `kyc_verifications`, `audit_logs`.
- **Nothing is FK'd to `auth.users` — not one constraint.** Verified against
  `information_schema`: `profiles.id`, `public.users.id`, `wallets.user_id`,
  `carts.user_id` and `wishlists.user_id` are all plain uuids with no foreign
  key. So **deleting a user in the Auth dashboard orphans every app row they
  own** — the `profiles` row (with its active subscription) survives, and no
  cascade fires. Any "wipe and retest from scratch" must delete the `public`
  rows explicitly, in FK order:
  `escrow_transactions → orders → payouts/referrals/disputes/kyc_verifications/affiliates/audit_logs → carts/wishlists → products → listings → wallets → profiles → users → auth.users`.
- Note the trigger writes to `users`, **not `profiles`** — so a fresh signup has
  no `profiles` row until something upserts one (the profile form, or
  `/api/subscription/verify`). `products.seller_id` is FK'd to `profiles.id`, so
  a seller who never saved their profile cannot insert a product.
- There is **no `profiles.role`** column → the role is stored in
  **`user_persona`** (`'buyer' | 'seller' | 'affiliate'`).
- There is **no `profiles.wallet_balance`** → the escrow balance lives in
  **`wallets.balance`** (kobo).
- There is **no `subscriptions`** and **no `seller_subscriptions`** table.
  Subscription state is three columns on `profiles`: `is_seller`,
  `seller_active`, `subscription_expires_at`.
- **`orders` columns, verified 2026-08-28** by probing each one over REST:
  `id`, `buyer_id`, `seller_id`, `listing_id`, `amount_kobo`, `order_ref`,
  `status`, `created_at`.
  - `status` **does** exist (an earlier note in this file said it did not —
    that was wrong).
  - `product_name`, `amount`, `paystack_reference` do **not** exist.
  - There is **no `product_id`**, and `listing_id` is FK'd to `listings`. But the
    cart holds **`products`** rows, so an order for a product purchase is
    *structurally impossible* until the migration in `SECURITY.md` item 2(a) is
    applied. `app/api/webhooks/route.ts` is already written against the
    post-migration shape and carries a `⚠️ SCHEMA DEPENDENCY` header saying so.
- Supabase swallows unknown-column writes as a returned error, not a throw — if
  the result's `error` is not checked, a broken write looks like success.

### Money units

**Everything is kobo** — the DB, the Paystack API, every server route, and
`products.price`. Naira exists only at two edges: the number a seller types into
a form, and the string rendered on screen. Convert with `utils/money.ts`
(`nairaToKobo` / `koboToNaira` / `formatNaira`) and never by hand.

This was fixed on 2026-08-28. It used to be inconsistent: the seller form wrote
`products.price` in **naira** (`parseFloat(price)`) while
`app/api/paystack/route.ts` summed the same column into `trueTotalKobo` and sent
it to Paystack as **kobo** — so a ₦1,500 item would have been charged **₦15**.
`buyer/wishlist` also divided by 100 while every other page did not, so one
product showed two different prices depending on the page.

`/api/paystack` was left as-is, because storing kobo makes it correct.

⚠️ If any `products` rows were created **before 2026-08-28**, their prices are
still naira and read 100× too cheap. There were 0 rows at the time, so nothing
needed converting — but check, and see `SECURITY.md` item 2(d) for the `update`.

### RLS notes

- **`profiles` is now owner-scoped. Fixed 2026-08-27.** It used to be
  world-readable, leaking `full_name`, `matric_no`, `hostel`, `bank_name` and
  `account_number` to anyone holding the anon key — which ships in the browser
  bundle by design. Rebuilt as three policies: `profiles_select_own`,
  `profiles_insert_own`, `profiles_update_own`, all
  `to authenticated using (auth.uid() = id)`. No DELETE policy; absent means
  denied.
- **The lesson worth keeping: permissive RLS policies are OR'd together.** A
  correctly-scoped `Users can view their own profile` policy already existed and
  did nothing, because one loose neighbour grants access regardless of how strict
  the others are. **Adding a strict policy never fixes a leak — the loose one has
  to be dropped.** The `Allow server updates on profiles` policy
  (`USING (true)` for `public`, i.e. anon could rewrite any profile's payout
  account) went in the same rebuild.
- Verified after the rebuild: anon `SELECT` returns `[]` on **all 15 tables**;
  anon `INSERT` into `profiles` returns `42501`.
- `wallets`, `carts`: owner-scoped `ALL`.
- ⚠️ **`orders`, `products` and `wallets` policies have still never been read.**
  `PROJECT_HISTORY` once recorded "several overlapping policies; safe but messy",
  and overlapping permissive policies are exactly what caused the leak above. The
  direct Postgres port has timed out on every attempt across three sessions, so
  this remains unaudited — see `SECURITY.md` M6 for the queries to run.
- The service role key bypasses RLS entirely, so `/api/webhooks` gets no
  protection from any of this. Its queries must stay correctly scoped by hand.

## 5. Known issues / backlog

> **Security items live in [`SECURITY.md`](SECURITY.md)** — audit run 2026-08-27
> against the live database and dev server, fixes applied 2026-08-28. **Read that
> file first.** It supersedes Known Issues #0, #4 and #5 below, and its top
> section lists the only two things still outstanding: the `orders.product_id`
> migration and the `SUPABASE_SERVICE_ROLE_KEY` env var. Both need your hands on
> the Supabase dashboard; neither can be done from the codebase.

**Security**

0. ✅ **RESOLVED 2026-08-27 — anyone could read every profile, including bank
   account numbers.** Fixed by dropping all policies on `profiles` and rebuilding
   them owner-scoped; details and the general lesson (permissive policies are
   OR'd, so a leak is fixed by *dropping*, never by *adding*) are in §4 "RLS
   notes" and `SECURITY.md` F1.

   One open thread: this is the change that could plausibly reintroduce #17, so
   re-read that item before trusting a fresh signup.

**Blocking**

1. ✅ **RESOLVED 2026-08-28 — `npm run build` now passes** (`✓ Compiled
   successfully`, 24/24 static pages, 22 routes). Four page files were **0 bytes**
   and therefore not modules, which failed type checking:
   `app/(dashboard)/afilliate/page.tsx`, `app/admin-dashboard/page.tsx`,
   `app/admin-dashboard/layout.tsx`, `app/marketplace/page.tsx`. All four now
   contain real components. `npx tsc --noEmit` is clean too.

   If `tsc` ever fails on a route you just deleted, the culprit is stale
   generated types in `.next/types/validator.ts` — `rm -rf .next` and re-run.

**High**

2. ✅ **RESOLVED 2026-08-28 — the infinite redirect loop.**
   `app/(dashboard)/seller/subscribe/page.tsx` held a second copy of the seller
   dashboard (`SellerDashboardPage`) that redirected to `/seller/subscribe` — its
   own URL — whenever `is_seller !== true`. It is now the actual paywall: a
   Server Component that re-checks the role during render, switches its copy
   between "Become a FUHSI Seller" and "Your seller plan has expired", and links
   to `/buyer/profile` for checkout.

   `proxy.ts` guarantees the loop cannot come back by construction: a role gate
   never guards its own `fallback` path.
3. ✅ **RESOLVED 2026-08-28 (code) — the webhook.** It inserted `product_name`,
   `amount`, `paystack_reference` (none of which exist) *and* used the
   cookie-scoped client, so it ran as `anon` and RLS blocked every write anyway.
   Rewritten with the service-role client, constant-time signature comparison,
   correct columns, an idempotent upsert, and every `error` result checked.

   ⚠️ **Still cannot write** until `SECURITY.md` items 1 and 2(a) are done —
   `orders` has no `product_id` column to write to yet.
4. ✅ **RESOLVED 2026-08-28 — `app/api/seller/verify-subscription/route.ts` is
   deleted.** It was worse than "writes to a table that does not exist": it had
   no authentication at all and took both `userId` and `expiresAt` from the
   request body. See `SECURITY.md` C1 — it was the audit's only critical, and it
   had to go *before* the service role key was added, or it would have become a
   working "grant anyone a permanent seller role" endpoint.
5. ✅ **RESOLVED 2026-08-27 — the `Allow server updates on profiles` policy is
   dropped.** Server writes now go through `utils/supabase/admin.ts` (service
   role) instead.

**Medium — these are the real open backlog**

6. **There are two unconnected carts.** `context/CartContext.tsx` keeps the cart
   in `localStorage` under `fuhsi_cart`; the `carts` **table** is a separate
   store that only `buyer/wishlist`'s "move to cart" writes to and only
   `/api/paystack` reads. So the UI cart and the checkout cart never agree, and
   because localStorage is scoped per origin, `localhost:3000` and the ngrok
   host show **different carts for the same account**. The cached items also
   survive deleting the product from the DB. Pick one store — the DB table is
   the one checkout needs. **Do this before #7**, or the checkout button will
   submit the wrong cart.
7. `app/(dashboard)/buyer/cart/page.tsx` checkout button is still an
   `alert()` stub; it never calls `/api/paystack`. This is the biggest remaining
   functional gap: escrow has never run end to end.
8. ✅ **RESOLVED 2026-08-28 — the ₦1,500-charged-as-₦15 unit mismatch.**
   `products.price` is now stored in kobo like everything else, converted at the
   form boundary by `utils/money.ts`. See §4 "Money units" for the one-time
   `update` needed if any product rows predate the fix.
9. ✅ **RESOLVED 2026-08-28 — session refresh and route protection.**

   **Correction to what this item used to say:** it claimed Next 16 expects
   `middleware.ts` at the repo root. That is wrong, and the same error is
   corrected in `SECURITY.md` H2. Next 16 **renamed the convention**: `middleware`
   is deprecated and the file is now **`proxy.ts`** at the project root, exporting
   a function named `proxy`. There is no `middleware.md` in
   `node_modules/next/dist/docs/` at all. Codemod for other projects:
   `npx @next/codemod@canary middleware-to-proxy .`

   Root `proxy.ts` created; the empty `app/middleware.ts` deleted. It refreshes
   the Supabase cookie with `auth.getUser()` — not `getSession()`, which only
   decodes a client-supplied cookie without verifying it — and copies rotated
   cookies onto redirects, so a redirect cannot silently sign the user out.
10. ✅ **RESOLVED 2026-08-28 — subscription expiry is enforced server-side**, in
    `proxy.ts` and in the paywall's render, both via `utils/roles.ts`. A lapsed
    seller is now bounced to `/seller/subscribe`.

    Worth knowing why this mattered: the old client-side `hasActiveRole()` in
    `buyer/profile` treated a **null** `subscription_expires_at` as active
    *forever*, so `is_seller = true` with no expiry passed the page's check and
    failed a correct one — the profile page would offer "Switch to Seller Studio"
    while the gate bounced them. There were three drifted copies of this logic;
    now there is one.
11. Nothing records the Paystack reference for a role subscription, so the same
    reference could be verified twice. Harmless today (the plan is fixed in the
    transaction metadata) but worth a `subscriptions` table. Tracked as
    `SECURITY.md` M7 alongside the related "tab dies before verify" gap.
12. `profiles.account_name` is never captured in the buyer profile form, but
    `seller/settings` displays it.
13. `seller/settings` reads and writes **`profiles.phone_number`, which does not
    exist** — so saving settings fails outright with a missing-column error.
14. `buyer/orders` embeds `listings ( image_url )` and `profiles:buyer_id`, but
    `listings` has no `image_url` (it has `images[]`) and `orders.buyer_id` is
    FK'd to **`users`**, not `profiles`. The query errors, so the page always
    renders the empty state. Fold this into the #3 migration — the page needs to
    read `products`, not `listings`.
15. Nothing ever inserts into `wishlists`, so the wishlist page is permanently
    empty.
16. ✅ **RESOLVED 2026-08-28 — route protection.** There are now three layers:
    `proxy.ts`, an async `(dashboard)/layout.tsx` that calls `auth.getUser()` and
    redirects, and RLS as the authoritative boundary. All 8 protected paths were
    verified returning `307 → /login?redirect=…` while signed out.
17. ~~**Unconfirmed risk:** `/api/subscription/verify` activates the role with~~
    **RESOLVED 2026-08-27** — a fresh signup on an empty database saved its
    profile and subscribed successfully, so the `profiles` insert path works.

    ⚠️ **But that test ran *before* the RLS rebuild, and passed partly *because*
    the policies were permissive.** The rebuilt set does include
    `profiles_insert_own`, so it should still work — but this has **not been
    re-tested since 2026-08-27**. A fresh end-to-end signup → save profile → pay
    is the single highest-value thing to do next.
18. ✅ **RESOLVED 2026-08-28** — `signUp()` now passes
    ``emailRedirectTo: `${window.location.origin}/login` ``, so a confirmation
    email returns to whichever origin the user actually signed up on instead of
    always following the dashboard's Site URL.

## 6. Session Log

### 2026-08-25 — Fixed "Initializing…" stuck button on role subscription

**Reported:** in Buyer → Profile → *Choose a Role to Become*, paying succeeds in
Paystack but the button stays on "Initializing…" forever and no role is granted.

**Root cause (three stacked bugs):**

1. The handler loaded Paystack **Inline v1** from the CDN
   (`js.paystack.co/v1/inline.js`) and called `PaystackPop.setup({...})`, but
   passed an **`onSuccess`** callback. v1's success hook is named
   **`callback`** — `onSuccess` is the v2 name. So on success v1 fired nothing,
   `setPaymentLoading(null)` never ran, and the spinner never cleared.
2. The success path then did `profiles.update({ role: planType })`, but
   `profiles` has **no `role` column**, so even a firing callback would not have
   granted the role.
3. The page decided who is a seller by querying a **`subscriptions` table that
   does not exist**, so the button never flipped to "Switch to Seller Studio".

**Changes:**

- `utils/plans.ts` *(new)* — `ROLE_PLANS` in kobo (seller ₦1,500 / affiliate
  ₦2,000) as the single source of truth, plus `PLAN_DURATION_DAYS = 30`.
- `utils/supabase/server.ts` *(new)* — the server client that
  `api/paystack/route.ts` and `api/webhooks/route.ts` were already importing
  from a path that did not exist. Uses Next 16's async `cookies()`.
- `types/paystack-inline-js.d.ts` *(new)* — types for `@paystack/inline-js`,
  which ships none.
- `app/api/subscription/initialize/route.ts` *(new)* — authenticated;
  server-side price lookup; calls Paystack `/transaction/initialize`; returns an
  `access_code`. The browser can no longer choose the amount.
- `app/api/subscription/verify/route.ts` *(new)* — re-verifies the reference
  with the secret key, checks `metadata.user_id` matches the caller and that the
  amount covers the plan, then sets `user_persona`, `is_seller`,
  `seller_active`, `subscription_expires_at` (+30 days).
- `app/(dashboard)/buyer/profile/page.tsx` — switched to the installed
  `@paystack/inline-js` v2 (`resumeTransaction(accessCode, { onSuccess,
  onCancel, onError })`, lazily imported so SSR never touches `window`);
  every one of the three outcomes clears `paymentLoading`; success now calls
  `/api/subscription/verify`; role detection reads the real columns via
  `hasActiveRole()`; wallet balance reads `wallets.balance`; the displayed
  prices are derived from `ROLE_PLANS`.

**Verified:** `npx tsc --noEmit` clean for all touched files (only the 4
pre-existing empty-page errors remain); no new ESLint problems; both new routes
return `401` when unauthenticated; `POST /transaction/initialize` against the
live test key returns an `access_code`.

**Not verified:** the popup → pay → verify round trip in a browser with a real
signed-in user. Do that next with a Paystack test card
(`4084 0840 8408 4081`, any future expiry, CVV `408`).

### 2026-08-27 — Confirmed the role fix worked; diagnosed the phantom cart item

**Reported:** (a) the seller role "did not update in Supabase" after paying,
(b) a product shows in the cart on `localhost` but not on the ngrok URL for the
same account, even though the product was deleted, (c) no way to un-seller the
account to retest.

**Findings — no new code bugs; two were misreadings of the schema:**

1. **The role did update.** `profiles` for `8894cd88-3aad-4131-ac66-dde2e9a94a3e`
   (`arsenielupin59@gmail.com`) reads `user_persona = 'seller'`,
   `is_seller = true`, `seller_active = true`,
   `subscription_expires_at = 2026-09-24T16:44:03Z`, written at
   `2026-08-25T16:44:03Z` — i.e. `/api/subscription/verify` ran correctly. The
   table that still says `role = 'buyer'` / `subscription_status = 'inactive'` is
   `public.users`, the legacy decoy (see §4). Nothing writes it after signup.
2. **The phantom cart item is localStorage, not the DB.** The cart lives in
   `localStorage['fuhsi_cart']` (`context/CartContext.tsx`), which is scoped per
   origin, so `localhost:3000` and the ngrok host keep separate carts, and
   neither is invalidated when the product row is deleted. `products` is now
   empty (0 rows) and the `carts` table has always been empty. Logged as
   Known Issue #6.
3. **Resetting a role for retesting** needs SQL (the app has no un-subscribe
   path):
   ```sql
   update profiles set user_persona = 'buyer', is_seller = false,
     seller_active = false, subscription_expires_at = null
   where id = '<auth uid>';
   ```

**Also catalogued while auditing every page** — see Known Issues #13–#16:
`seller/settings` writes a non-existent `profiles.phone_number`; `buyer/orders`
embeds `listings(image_url)` and `profiles:buyer_id` that don't resolve; nothing
inserts into `wishlists`; there is no route protection on `/buyer`.

**State of the data:** 1 auth user, 1 `profiles` row (seller, active), 2
`public.users` rows (one orphaned), 0 products, 0 carts, 0 wishlists, 1 old
manual `orders` row (`order_ref = 'TEST_REF_123'`).

### 2026-08-27 (later) — Clean-database retest passed; found `profiles` is world-readable

**Done:** wiped all app data + the auth user, signed up fresh on `localhost`,
saved the profile, and paid for the seller role with a Paystack test card.

**Result — the whole role flow works on a clean database.** New uid
`748851ab-a5d4-450f-ab08-118c6a10dece`: `user_persona = 'seller'`,
`is_seller = true`, `seller_active = true`,
`subscription_expires_at = 2026-09-26T12:51:35Z`, `updated_at =
2026-08-27T12:51:35Z`. Backlog item #17 (the feared missing INSERT policy on
`profiles`) did not bite — see its caveat, it may return once RLS is tightened.

**Also settled: test on `localhost`, not the tunnel.** The role flow has no
inbound webhook — `/api/subscription/verify` *pulls* from
`api.paystack.co/transaction/verify/:ref` with the secret key. Proved the machine
has outbound reach with `curl https://api.paystack.co/...` → `HTTP 401` (i.e.
Paystack itself answered). Written up as a new subsection in §2.

**New finding — Known Issue #0, security.** `GET /rest/v1/profiles` with only the
anon key and no signed-in user returned a real user's `full_name`, `matric_no`,
`bank_name` and `account_number`. The anon key is public by design, so every
student's bank details are readable by anyone. Combined with the pre-existing
`Allow server updates on profiles` policy (`USING (true)`), anon can also
overwrite any profile's payout account. **Fix this before any real user signs up.**

**Also filed #18:** `signUp()` never passes `options.emailRedirectTo`, so
confirmation emails always follow the dashboard's Site URL — which is why a
localhost signup mailed a link to the ngrok origin, landing the session on the
wrong origin (and hence a different localStorage cart / auth session).

**Tooling note:** the direct Postgres connection (port 5432) was timing out all
session (`ETIMEDOUT` on its IPv6 address). The REST API over HTTPS worked fine —
use `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=*"` with the anon key
as a fallback for inspecting data.

### 2026-08-28 — Implemented every fix in `SECURITY.md`; the build passes for the first time

**Reported:** "so let fix all this issue" — implement the whole audit.

**Result: 1 critical, 4 high and 5 medium items closed and re-tested. Two items
cannot be done from the codebase and are handed over** (top of `SECURITY.md`):
the `orders.product_id` migration, and setting `SUPABASE_SERVICE_ROLE_KEY`.

**Deleted**

- `app/api/seller/verify-subscription/route.ts` — the audit's only critical. No
  `auth.getUser()` anywhere, `userId` **and** `expiresAt` both read from the
  request body, and fail-open verification (`if (secretKey) {` — with the key
  unset it skipped verification entirely). It was contained only by accident:
  the service role key was unset and the RLS rebuild blocked anon writes. **The
  moment the key was added — which the webhook fix requires — it would have
  become a working "grant anyone a permanent seller role" endpoint**, so it had
  to go first. Now returns `404`; it previously returned `400`, which is how we
  knew it had got past the front door.
- `app/middleware.ts` — empty, and the wrong filename for Next 16.

**New files**

- `proxy.ts` (root) — session refresh + route gating. See the correction below.
- `utils/roles.ts` — the one definition of "paid, unexpired role".
- `utils/money.ts` — naira ↔ kobo at the boundary.
- `utils/supabase/admin.ts` — service-role client, with a `typeof window` throw
  as a browser-import tripwire and **call-time** (not module-load) env
  validation, so a missing key does not break `next build`.
- `utils/rate-limit.ts` — 8 payment inits per 10 min, keyed by user id.

**Rewritten**

- `app/api/webhooks/route.ts` — was using the *cookie-scoped* client for a
  cookieless server-to-server POST, so it ran as `anon` and RLS blocked every
  write regardless of the wrong column names. Now: service-role client,
  `crypto.timingSafeEqual` for the signature (lengths compared first, since it
  throws on mismatch), an idempotent `upsert` on `(order_ref, product_id)` so
  Paystack's retries are a no-op, prices read from the DB not the payload, every
  `error` result checked, only the purchased cart rows cleared, and `200` rather
  than `500` on internal failure so a valid-but-unwritable event does not trigger
  a retry storm.
- `app/(dashboard)/seller/subscribe/page.tsx` — was a duplicate seller dashboard
  that redirected to its own URL. Now the real paywall, as a Server Component.
- `app/(dashboard)/layout.tsx` — passthrough → `auth.getUser()` + redirect.
- The four 0-byte page files that had been blocking `build` since the first
  commit.

**Edited:** `seller/layout.tsx` (hide the bottom nav on the paywall — every link
in it bounces a non-seller), `seller/products/new` (kobo conversion, `https:`-only
image URLs, generic error text instead of `alert(err.message)`), the six price
render sites, `buyer/profile` (drop its local role logic), `signup` (add
`emailRedirectTo`), both payment routes (rate limit; stop forwarding Paystack's
`message`).

**Correction to earlier advice in this file.** #9 and `SECURITY.md` H2 both said
Next 16 expects `middleware.ts` at the repo root. Wrong: Next 16 **renamed the
convention** to **`proxy.ts`** (function named `proxy`, project root, Node runtime
by default — setting `runtime` there throws). There is no `middleware.md` in the
bundled docs at all. Both files now say so.

**Correction to an earlier schema note.** `orders.status` **does** exist; a note
from the previous session said it did not. What genuinely does not exist is
`orders.product_id` — and since the cart holds `products` rows while `orders` only
has `listing_id`, escrow orders are *structurally impossible* until the migration
runs. The webhook is written against the post-migration shape and says so in a
`⚠️ SCHEMA DEPENDENCY` header.

**Verified**

- `npm run build` **passes — the first time in this project.** `✓ Compiled
  successfully in 3.2s`, 24/24 static pages, 22 routes, and `ƒ Proxy
  (Middleware)` in the route table confirming Next picked up `proxy.ts`.
- `npx tsc --noEmit` clean; eslint clean on every new/rewritten file (the 17
  remaining warnings were each confirmed pre-existing per-file and per-rule).
- All 8 protected paths → `307 → /login?redirect=…` while signed out;
  `/`, `/login`, `/signup`, `/marketplace` → `200`.
- Webhook signature: no header → `401`; wrong signature of correct length →
  `401`; valid signature over a **tampered** body → `401`; valid signature,
  intact body → `200`.
- Fail-closed path with the service key deliberately unset: valid webhook logs
  `SUPABASE_SERVICE_ROLE_KEY is not set` and returns `200` in 122 ms — no retry
  storm, no half-written rows.
- All API routes `401` unauthenticated.

**Not verified — do these next**

1. **A fresh signup → save profile → pay, end to end.** The last successful run
   was *before* the RLS rebuild and passed partly because the policies were
   permissive (see #17). This is the highest-value test remaining.
2. The webhook actually writing, which needs both handover items done first.
3. Nothing is committed — all of the above is still in the working tree.

**Tooling note:** the direct Postgres connection timed out again this session, a
third time. The workaround that did work for schema questions: probe one column
at a time over REST -- `GET /rest/v1/<table>?select=<col>&limit=1` returns `200`
if the column exists and `400`/`42703` if it does not.

---

## Session Log (latest) -- Buyer pays via Paystack, seller sees & fulfils order

Enabled the real escrow purchase + delivery flow that was blocked before.

**Handover prerequisites now confirmed:** `SUPABASE_SERVICE_ROLE_KEY`,
`PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`,
`NEXT_PUBLIC_SITE_URL` are all set in `.env.local`.

**Payment method:** it is NOT card-only. `/api/paystack` returns the Paystack
hosted `authorization_url`, so the buyer picks any channel your dashboard has
enabled (card, transfer, USSD, Bank app, Mobile Money). Card is just the test
default.

**ngrok is required for the webhook.** Paystack pushes `charge.success` to your
app; it cannot reach `localhost`. Set the Paystack dashboard Webhook URL to
`https://<your-ngrok-sub>.ngrok-free.dev/api/webhooks` and keep
`NEXT_PUBLIC_SITE_URL` pointing at the same `https://` origin for testing, or
orders will be paid for but never created (confirmed: payment succeeded, orders
table stayed empty, cart never cleared, `is_sold` never flipped).

**Checkout / cancellation UX fixed:** `callback_url` is back to `/buyer/cart`;
Paystack returns there with `?reference=...`. The page calls
`/api/paystack/verify` (new) which checks the real transaction status; the
localStorage cart is cleared ONLY on confirmed `success`, and a failed/cancelled
payment shows a banner and keeps the whole cart.

**Quantity fraud hole closed:** `carts` and `orders` gained a `quantity`
column (NOT NULL, CHECK > 0). `/api/paystack` now charges `price x quantity`
(was: 1 x price because carts had no quantity). Webhook writes
`amount_kobo = price x quantity` and stores quantity. Note the earlier bug on
`/api/paystack` was a **stale dev-server bundle**, plus the embedded
`products(price)` join resolving to nothing under anon RLS -- fixed by querying
`products` explicitly (never trusting the embedded relationship).

**Delivery / receiver details (new):** buyer cart now collects receiver name,
phone, matric number (prefilled from `profiles.full_name`/`matric_no`/`hostel`)
and a School Pickup (free) vs Deliver to a place (+N500) choice. `orders`
columns added: `delivery_type`, `receiver_name`, `receiver_phone`,
`matric_number`, `delivery_address`, `delivery_fee_kobo`. `/api/paystack` adds
the N500 (constant `DELIVERY_FEE_KOBO=50000`, never from client) to the charge
only for delivery, and passes all of it through Paystack metadata; webhook
persists it.

**Fulfilment tracking (seller-driven):** added enum values `packing`,
`ready_for_pickup`, `delivered` to `order_status_type`. Sequence:
`in_escrow (Order Received) -> packing -> ready_for_pickup -> confirmed
(Received by You) -> completed`. RLS reworked: seller policy
`Sellers advance order fulfillment` (seller can set packing/ready), buyer
policy `Buyers confirm received or dispute their orders` (confirmed/delivered/
disputed), replacing the old strict buyer-only UPDATE policy.
- Seller `/seller/orders`: shows receiver contact + delivery address, with
  "Start Packing Order" then "Mark as Ready for Pickup" buttons.
- Buyer `/buyer/orders`: live tracking stepper + delivery info; "Confirm
  Received" (escrow release) becomes available at `ready_for_pickup`.

**Verified:** `npx tsc --noEmit` clean; ESLint clean (only pre-existing
`<img>` warnings); `npm run build` passes (24 routes incl. `/api/paystack/verify`).

**Test steps that still must be done manually (need the webhook URL set):**
1. Set Paystack dashboard Webhook URL to the ngrok origin + `/api/webhooks`.
2. Hard-restart `npm run dev` (Turbopack does NOT hot-reload API route modules --
   a stale server running old `/api/paystack` produced a phantom
   `400 Invalid financial amount` even though disk + DB were correct).
3. Buyer adds a product, sets quantity > 1, picks delivery, pays with test card
   `4084 0840 8408 4081` -> order appears on buyer and seller pages.
4. Seller marks packing -> ready; buyer confirms -> escrow released.

**Tooling note (still true):** direct Postgres MCP connection works this
session; `.mcp.json` holds the superuser string (gitignored, never commit).
