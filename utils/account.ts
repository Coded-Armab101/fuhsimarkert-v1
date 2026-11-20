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

type BuyerProfile = {
  full_name: string | null;
  matric_no: string | null;
  hostel: string | null;
  dob: string | null;
};

const hasValue = (value: unknown): boolean =>
  value !== null && value !== undefined && String(value).trim().length > 0;

/**
 * A buyer must supply the tracking fields before they can pay for anything.
 * Checked again on the server at both checkout entry points; the client-side
 * check is only a convenience, never the authority.
 */
export async function buyerProfileComplete(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, matric_no, hostel, dob')
    .eq('id', userId)
    .maybeSingle<BuyerProfile>();
  if (error) throw error;
  if (!data) return false;

  return (
    hasValue(data.full_name) &&
    hasValue(data.matric_no) &&
    hasValue(data.hostel) &&
    hasValue(data.dob)
  );
}
