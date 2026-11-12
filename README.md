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

## Phone alerts for sellers (Web Push)

Sellers can turn on order alerts from **Seller Settings**, or from the bell menu in
the seller header. Alerts use a service worker (`public/sw.js`) plus Web Push, so
they arrive on an installed PWA even when the app is closed.

1. Apply `supabase/migrations/20261111_push_subscriptions.sql`.
2. Generate a VAPID key pair (for example `npx web-push generate-vapid-keys`).
3. Add these environment variables to the deployment:

   ```bash
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:you@example.com
   ```

4. Redeploy, open **Seller Settings**, and tap **Enable order alerts**.

Push is best-effort: if the keys are missing or a device is offline, the order is
still recorded and the in-app bell still updates. Installation and notifications
require HTTPS (or localhost). On iPhone, the app must be added to the Home Screen
(iOS 16.4+) before alerts can be enabled.

