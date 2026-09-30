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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'placeholder';

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
