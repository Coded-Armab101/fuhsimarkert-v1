import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client authenticated with the **service role key**.
 *
 * This client BYPASSES Row Level Security entirely. It exists for one reason:
 * server-to-server callers that carry no user session, i.e. the Paystack
 * webhook. A webhook POST has no cookies, so the cookie-based client in
 * `./server.ts` runs as `anon` and — correctly — cannot write anything.
 *
 * Rules:
 *  - Never import this file from a Client Component or anything reachable from
 *    one. The guard below is a tripwire, not a substitute for care.
 *  - Never expose the key as `NEXT_PUBLIC_*`.
 *  - Scope every query yourself. RLS will not save you here.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'utils/supabase/admin.ts was imported into client code. This would leak the ' +
      'service role key to the browser. Import utils/supabase.ts instead.',
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Validated at call time rather than module load, so a missing key surfaces as
  // a clear runtime error on the one route that needs it instead of breaking
  // `next build` for the whole app.
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.');
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (server-only, ' +
        'never NEXT_PUBLIC_). Find it under Supabase → Project Settings → API.',
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      // No user session to persist or refresh; this client is not a browser.
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
