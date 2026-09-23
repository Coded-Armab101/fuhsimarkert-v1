# FUHSI Market — Security Audit

**Audited 2026-08-27**, **fixes applied 2026-08-28**, against the live Supabase
project and the running dev server. Every "confirmed" item below was reproduced,
not inferred; every "FIXED" item was re-tested after the change. Cross-referenced
from `PROJECT_HISTORY.md` §5.

---

## ⚠️ Two things still need YOU — code cannot do them

Everything else in this file is done. These two need database/env access.

### 1. Add the service role key to `.env.local`

The Paystack webhook cannot write escrow orders without it. Supabase dashboard →
**Project Settings → API → `service_role`**:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Server-only. **Never** prefix it `NEXT_PUBLIC_`, never import it into a Client
Component. It bypasses RLS completely. `utils/supabase/admin.ts` throws if it is
imported into browser code, but that tripwire is not a substitute for care.

Until it is set, `/api/webhooks` logs
`SUPABASE_SERVICE_ROLE_KEY is not set` and returns `200` without creating
orders — verified. Safe, but no escrow.

### 2. Run this SQL

**(a) The webhook's missing columns.** `orders` can currently only point at
`listings`, but the cart holds `products` rows, so an order for a product
purchase is structurally impossible. Verified 2026-08-28: `orders` has exactly
`id, buyer_id, seller_id, listing_id, amount_kobo, order_ref, status, created_at`
— there is no `product_id`.

```sql
alter table public.orders
  add column if not exists product_id uuid references public.products(id) on delete restrict;

-- The cart holds products, not listings, so listing_id must be optional.
alter table public.orders alter column listing_id drop not null;

-- Idempotency for webhook retries. Paystack retries by design, and one
-- reference legitimately produces one row per product — so the unique grain is
-- (order_ref, product_id), not order_ref alone.
create unique index if not exists orders_order_ref_product_id_key
  on public.orders (order_ref, product_id);
```

**(b) Confirm the `status` value the code writes is allowed.** The webhook writes
`'locked'`. If there is a check constraint that forbids it, the insert fails:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.orders'::regclass and contype = 'c';
```

If `'locked'` is not permitted, change `ESCROW_HELD_STATUS` in
`app/api/webhooks/route.ts` to a value that is.

**(c) M6 — audit the policies that were never reviewed** (see M6 below):

```sql
select tablename, policyname, cmd, permissive, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- A table with RLS off ignores its policies entirely.
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

**(d) Only if you have added products since 2026-08-27.** `products.price` is now
stored in **kobo** (see H4). Existing naira rows need converting **once**:

```sql
-- Check first. If this returns 0 rows, skip the update.
select id, title, price from public.products;

-- Then, only if those prices are in naira:
update public.products set price = price * 100;
```

Paste each block separately — the Supabase SQL Editor wraps a script in one
transaction, so a single failure rolls back everything above it.

---

## CRITICAL — 0 open

### C1. `/api/seller/verify-subscription` granted roles with no authentication ✅ FIXED

`app/api/seller/verify-subscription/route.ts` — **deleted 2026-08-28.**

**Was confirmed.** An unauthenticated POST with no session cookie was *not*
rejected — it proceeded to Paystack verification:

```
POST /api/seller/verify-subscription   (no cookie)
  {"reference":"definitely_not_a_real_reference",
   "userId":"748851ab-…","expiresAt":"2099-01-01T00:00:00Z"}
→ 400 {"error":"Payment verification failed at Paystack."}     ← got past the door
```

Four defects stacked: no `auth.getUser()` anywhere; `userId` taken from the
request body so the caller named the account to upgrade; `expiresAt` taken from
the request body so the caller chose their own expiry; and **fail-open**
verification (`if (secretKey) { …verify… }` — with the key unset, verification was
skipped entirely). Even with the key set it never checked amount, plan, or that
the reference belonged to the named user, so any successful reference on the
merchant account could be replayed for any `userId`, repeatedly.

It was contained only by accident: the service role key was unset and the RLS
tightening blocked anon writes. **The moment `SUPABASE_SERVICE_ROLE_KEY` was
added — which the webhook fix requires — it would have become a working "grant
anyone a permanent seller role" endpoint.** So it had to go before item 1 above.

`/api/subscription/verify` supersedes it and is correct.

**Verified after the fix:** the same request now returns `404`. Nothing in the
codebase referenced the route (`grep -rn "verify-subscription" app/ utils/
context/ types/` → no matches).

---

## FIXED — verified closed

### F1. `profiles` was world-readable, including bank account numbers ✅

Before the fix, `GET /rest/v1/profiles` with only the anon key and **no signed-in
user** returned `full_name`, `matric_no`, `hostel`, `bank_name`,
`account_number` for every user. The anon key ships in the browser bundle by
design (`NEXT_PUBLIC_*`), so this was public to anyone who viewed source.

Root cause: a permissive SELECT policy sat *alongside* a correctly-scoped
`Users can view their own profile`. **Permissive RLS policies are OR'd**, so the
loose one granted access regardless. Adding a strict policy could not fix it;
the loose one had to be dropped.

**Fixed 2026-08-27** by dropping every policy on `profiles` via a `do` block and
recreating three owner-scoped ones (`profiles_select_own`, `profiles_insert_own`,
`profiles_update_own`, all `to authenticated using (auth.uid() = id)`). No
DELETE policy — absent means denied.

| Probe (anon key, no login) | Result |
| --- | --- |
| `SELECT` on all 15 tables | `[]` for every one |
| `INSERT` into `profiles` | `42501 new row violates row-level security policy` |
| `UPDATE` on `profiles` | no rows; no anon-visible policy remains |

Owner-only SELECT is safe: every `profiles` read in the codebase is a signed-in
user fetching their own row. **If the marketplace later needs public seller
names, expose a view with only safe columns — do not reopen the table.**

### H1. No server-side route protection ✅ FIXED

Was: `app/(dashboard)/layout.tsx` was a passthrough, `seller/layout.tsx` was
cosmetic, and all gating was client-side `useEffect` + `router.push` — a UI
convenience, not a boundary. It could be bypassed with devtools, and the page's
data fetches fired regardless.

Now there are **three** layers:

1. **`proxy.ts`** (root) redirects before the route renders.
2. **`app/(dashboard)/layout.tsx`** is an async Server Component that calls
   `auth.getUser()` and redirects — the backstop if proxy coverage is ever lost
   to a matcher edit.
3. **RLS** remains the authoritative data boundary.

`app/(dashboard)/seller/subscribe/page.tsx` also re-checks during render.

### F1b. Self-promotion via `profiles` UPDATE/INSERT privilege columns ✅ FIXED

**Confirmed 2026-09-03 against the live DB.** `profiles_update_own` scoped UPDATE
to `auth.uid() = id` but imposed **no column restriction**, and `profiles_insert_own`
let a user INSERT their own row with any columns. A signed-in user could therefore:

```
PATCH /rest/v1/profiles?id=eq.<me>  {"is_admin": true}
  → 200 (was accepted)  →  profiles.is_admin became true
```

...plus `is_seller`, `seller_active`, `subscription_expires_at`,
`is_approved_seller` (bypass seller verification), `storage_quota`, and the
verification review fields. This promoted a normal user to admin and took every
admin endpoint. The code audit could not reach Postgres, so this was only verified
live via a throwaway test user + REST POST — the escalation returned HTTP **200**.

**Fixed 2026-09-03** with `public.protect_profile_privileges()` — a `BEFORE
UPDATE OR INSERT` trigger. For the `authenticated` role (from the JWT via
`auth.role()`, owner-agnostic) it:
- rejects any UPDATE that changes a server-managed privilege column
  (`is_admin`, `is_seller`, `seller_active`, `subscription_expires_at`,
  `is_approved_seller`, `storage_quota`, `verification_reviewed_at`,
  `verification_reject_reason`) — but leaves self-service fields writable
  (`full_name`, `matric_no`, `bank_*`, `student_id_url`, `verification_status`,
  `verification_submitted_at`, `session_nonce`, …);
- rejects any INSERT that sets a privilege column away from its neutral default.

Service-role / `postgres` writes (admin verifications, webhooks, RPCs, and now
`/api/subscription/verify`) bypass it, so legitimate role activation is unaffected.

**Verified after the fix (live):** `is_admin=true` (and every other privilege column)
→ HTTP **400**, value unchanged; `full_name`/`bank`/`verification_status=pending`
self-service → HTTP **200**; privilege-bearing INSERT → HTTP **400**; neutral
INSERT → HTTP **201**. Service-role writes of the same columns → **200**. The
single user-token writer of a privilege column (`app/api/subscription/verify`)
was migrated to the service-role (`createAdminClient`) client to match.

**Note:** a user can still set `verification_status='approved'` cosmetically, but
that grants nothing — the hard seller gate is `is_approved_seller` (proxy.ts),
which is protected.

| Path | Result |
| --- | --- |
| `/buyer` `/buyer/cart` `/buyer/profile` | `307 → /login?redirect=…` |
| `/seller` `/seller/products` `/seller/subscribe` | `307 → /login?redirect=…` |
| `/afilliate` `/admin-dashboard` | `307 → /login?redirect=…` |
| `/` `/login` `/signup` `/marketplace` | `200` |

`/admin-dashboard` is gated on a persona `user_persona` cannot hold, so it is
closed to **everyone** — there is no admin column in the schema, and failing
closed is the right default until there is one.

### H2. No root middleware — sessions never refreshed ✅ FIXED

Only `app/middleware.ts` existed, and it was **empty** (0 bytes) *and* in the
wrong place.

**Correction to the original audit:** Next 16 did not just move this file, it
**renamed the convention**. `middleware` is deprecated; the file is now
`proxy.ts` at the project root, exporting a function named `proxy`. There is no
`middleware.md` in `node_modules/next/dist/docs/` at all. (Codemod for existing
projects: `npx @next/codemod@canary middleware-to-proxy .`)

Created root **`proxy.ts`**; deleted the empty `app/middleware.ts`. It refreshes
the Supabase cookie via `auth.getUser()` (not `getSession()`, which only decodes
a client-supplied cookie without verifying it) and carries rotated cookies onto
redirects so a redirect cannot silently sign the user out.

`npm run build` reports `ƒ Proxy (Middleware)`, confirming it is picked up.

Proxy runs on the Node.js runtime by default; setting `runtime` in a proxy file
throws. `/api` is excluded from the matcher on purpose — `/api/webhooks` verifies
an HMAC over the raw body and must not be touched, and every other handler calls
`auth.getUser()` itself. The Next docs are explicit that authorization belongs
inside the handler rather than in proxy.

### H3. The webhook could not write, and used the wrong client ✅ FIXED (code)

`app/api/webhooks/route.ts` called `createClient()` from
`@/utils/supabase/server` — a **cookie-based** client. A webhook is a
server-to-server POST carrying no cookies, so it ran as `anon` and RLS blocked
every write.

Rewritten:

- Uses the new `utils/supabase/admin.ts` service-role client.
- **Constant-time signature compare** via `crypto.timingSafeEqual` (lengths
  checked first, since it throws on mismatch). Was `hash !== header`.
- **Idempotency**: `upsert(..., { onConflict: 'order_ref,product_id',
  ignoreDuplicates: true })`, so Paystack's retries are a no-op instead of
  duplicate escrow orders. Needs the unique index in item 2(a) above.
- **Correct columns**: `product_id`, `amount_kobo`, `order_ref`, `status` —
  was `product_name`, `amount`, `paystack_reference`, none of which exist.
- Every `error` result is checked and thrown. supabase-js returns write failures
  as `error` rather than throwing, so an unchecked result makes a broken write
  look like success.
- Clears only the purchased cart rows, not the whole cart.
- Returns `200` on internal failure (with a server-side log keyed by reference)
  rather than `500`: the signature was valid and the payload understood, so
  retrying will not help and would just pile up.
- Errors are logged server-side and never returned to the caller.

**Verified 2026-08-28** against the dev server:

| Request | Result |
| --- | --- |
| No `x-paystack-signature` | `401 {"error":"Invalid signature."}` |
| Wrong signature, correct length | `401` |
| Valid signature, body tampered after signing | `401` |
| Valid signature, intact body | `200 {"received":true}` |

Still blocked on items 1 and 2(a) above before it can actually write.

### H4. Cart checkout charged 1/100th of the price ✅ FIXED

`/api/paystack` summed `products.price` into `trueTotalKobo` and sent it to
Paystack as **kobo**, but the seller form wrote naira (`parseFloat(price)`). A
₦5,000 item would have been charged **₦50**.

Fixed by making **kobo the unit everywhere**, which is what the rest of the
system already used — so `/api/paystack` needed no change and is now correct.

- New `utils/money.ts` — `nairaToKobo()` (rounds, so 19.99 → 1999 not 1998),
  `koboToNaira()`, `formatNaira()`. The unit rule now lives in one file.
- `seller/products/new` converts on submit: `price: nairaToKobo(price)`.
- Every render site divides: `buyer/page`, `buyer/cart`, `seller/products`,
  `seller/subscribe`, `buyer/profile`, `buyer/wishlist`.
- `CartItem.price` is documented as kobo.

This also removed a live inconsistency: `buyer/wishlist` already divided by 100
while every other page did not, so the same product showed two different prices.

### M1. No server-side subscription expiry enforcement ✅ FIXED

`subscription_expires_at` was only checked client-side. A lapsed seller kept full
`/seller` access.

Now enforced in `proxy.ts` and in the paywall's server-side render, both via a
single shared helper.

This surfaced a real inconsistency worth recording: the old client-side
`hasActiveRole()` in `buyer/profile` returned **true when
`subscription_expires_at` was null** — so a profile with `is_seller = true` and no
expiry counted as active forever, and the profile page would offer "Switch to
Seller Studio" while a correct gate bounced them. Consolidated into
`utils/roles.ts` (`hasActiveRole`, `hasLapsedRole`, `activeRole`,
`subscriptionExpiry`); `proxy.ts` and both pages now import it, so the definition
cannot drift again.

### M2. `SUPABASE_SERVICE_ROLE_KEY` not set ⚠️ NEEDS YOU

Client added (`utils/supabase/admin.ts`, with a browser-import tripwire and a
clear error when the key is missing). **The key itself is still not set** — see
item 1 at the top.

### M3. Unvalidated external `image_url` ✅ PARTIALLY FIXED

`products.image_url` was free text from the seller, rendered directly: arbitrary
third-party requests from every viewer's browser (IP logging / tracking pixels),
hotlinking, broken images. Not XSS in an `<img src>`, but it becomes XSS the
moment that value lands in an `<a href>` or a CSS `url()`.

`seller/products/new` now parses the URL and requires the `https:` protocol,
which blocks `javascript:` and `data:`. **This is the floor, not the ceiling** —
any https host is still allowed, so tracking pixels and hotlinking remain
possible. The real fix is uploading to Supabase Storage and storing our own URL.

### M4. Raw database errors shown to users ✅ FIXED

Was `alert('Failed to post product: ' + err.message)`, surfacing column names,
constraint names and policy details.

`seller/products/new` now logs the real error with `console.error` and shows an
inline generic message. `/api/subscription/initialize` no longer forwards
Paystack's `message` field either. The webhook logs and returns nothing
diagnostic.

### M5. No rate limiting on payment initialization ✅ FIXED

`/api/subscription/initialize` and `/api/paystack` would each start an unlimited
number of Paystack transactions for an authenticated user.

New `utils/rate-limit.ts`: fixed-window limiter, 8 attempts per 10 minutes,
keyed by **user id** (not IP — everyone on campus wifi shares one), returning
`429` with `Retry-After`.

**Honest caveat:** the counters are in-memory and per-process, so they reset on
restart and are not shared between instances. That is enough for the single Node
server this app runs on today. If it is ever deployed to more than one instance
or to serverless, move the counters to Redis/Upstash — the call signature was
written to match those libraries so only that one file changes.

---

## MEDIUM — still open

### M6. `orders` / `products` / `wallets` policies unreviewed ⚠️ NEEDS YOU

`PROJECT_HISTORY.md` records "several overlapping policies; safe but messy" for
`orders` and `products` — that predates this audit and has still not been
re-verified, because the direct Postgres connection (port 5432) has timed out on
every attempt across two sessions (`ETIMEDOUT` on its IPv6 address), and the
available MCP query tool is read-only.

Overlapping permissive policies are exactly what caused F1, so this matters. Run
the queries in item 2(c) above and check that no policy grants `public`/`anon`
more than intended.

What *is* verified: anon `SELECT` returns `[]` on all 15 tables. That rules out
the F1-class leak but says nothing about what an authenticated user can read of
*another* user's rows.

Note the service role key (item 1) bypasses RLS entirely, so the webhook's
queries must stay correctly scoped by hand.

### M7. Role activation webhook backstop ✅ FIXED 2026-09-23

Role subscriptions are now processed by the signed Paystack `charge.success` webhook as a server-side backstop. Browser verification and webhook delivery share an idempotent `subscriptions.reference` ledger, so closing the payment tab no longer leaves a successful payment permanently unactivated, and the same reference cannot activate the role twice.

---

## VERIFIED CLEAN

- **No secrets in git.** `.env.local` is untracked; no `.env*`, `.mcp.json`,
  secret or credential file appears anywhere in history (`git log --all
  --name-only`). `.gitignore` covers `.env*` and `.mcp.json`.
- **Role subscription pricing is server-authoritative.** The browser sends only a
  plan name; `utils/plans.ts` supplies the amount, and
  `/api/subscription/verify` re-checks with Paystack, binds `metadata.user_id`
  to the session user, and rejects underpayment.
- **Cart checkout pricing is server-authoritative** — recomputed from the DB, not
  taken from the client. (The unit was wrong, H4; the amount never was.)
- **All API routes reject unauthenticated callers.** Re-verified 2026-08-28:
  `/api/subscription/initialize` `401`, `/api/subscription/verify` `401`,
  `/api/paystack` `401`, `/api/webhooks` `401` without a valid signature.
- **No `dangerouslySetInnerHTML`, no `eval`** anywhere in the codebase.
- **No Supabase Storage buckets in use** — no bucket policy to misconfigure yet.
- **Anon read is blocked on all 15 tables** (post-F1).
- **`npm run build`, `npx tsc --noEmit` and `npx eslint` on all new/rewritten
  files are clean** as of 2026-08-28, so these fixes are actually verifiable
  rather than merely written. The build had never passed before (four 0-byte page
  files were not modules); they now contain real components.
