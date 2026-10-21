import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase admin client authenticated with the service role key.
 *
 * Server-side only. This client bypasses Row Level Security (RLS).
 * Use it only for trusted server-side operations, such as Paystack
 * webhook processing and verified subscription activation.
 *
 * Never expose SUPABASE_SERVICE_ROLE_KEY to client-side code.
 * Explicitly scope database queries because RLS does not protect
 * operations performed with this key.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'utils/supabase/admin.ts was imported into client code. ' +
      'This would expose the service role key to the browser. ' +
      'Import utils/supabase.ts instead.',
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL environment variable.',
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
        'The Supabase admin client cannot be initialized safely.',
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

