import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Database backstop for a Supabase Auth ban. Auth normally rejects a banned
 * user at getUser(), but an access token issued immediately before suspension
 * may still reach an API process. Sensitive routes call this before mutating.
 */
export async function accountIsActive(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_suspended')
    .eq('id', userId)
    .maybeSingle<{ is_suspended: boolean | null }>();
  if (error) throw error;
  return data?.is_suspended !== true;
}
