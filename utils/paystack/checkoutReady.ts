import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Verify the database can persist a multi-item checkout before any money moves.
 * Missing RPC means the reliability migration itself has not been applied.
 */
export async function checkoutDatabaseReady(
  admin: SupabaseClient,
): Promise<{ ready: true } | { ready: false; reason: string }> {
  const { data, error } = await admin.rpc('marketplace_checkout_ready');
  if (error) {
    return {
      ready: false,
      reason: `Checkout database preflight failed: ${error.message}`,
    };
  }
  if (data !== true) {
    return {
      ready: false,
      reason: 'Legacy single-item cart/order constraints are still present.',
    };
  }
  return { ready: true };
}
