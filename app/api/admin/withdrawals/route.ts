import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Operator/admin tools for withdrawals.
 *
 * GET  – list every withdrawal with seller identity (chronological, newest first).
 * POST – approve or reject a single pending withdrawal.
 *
 * Money model: a seller's withdrawal request already deducts the amount from
 * their wallet when it is opened (see /api/wallet/withdraw), and the money sits
 * in the platform balance. Approving confirms the payout was made (marks it
 * `paid`). Rejecting returns that money to the seller's wallet.
 *
 * Authorization: the caller must be a user whose `profiles.is_admin` is true.
 * The cookie client proves identity; the service-role client does the writes
 * because `wallets`/`withdrawals` are not user-writable under RLS.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminProfile?.is_admin !== true) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Join seller profile for names/email. All via service role (RLS bypass).
    const { data, error } = await admin
      .from('withdrawals')
      .select(
        'id, seller_id, amount_kobo, bank_name, account_number, account_name, status, request_note, created_at, processed_at',
      )
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Join seller profile for names. All via service role (RLS bypass).
    const sellerIds = [...new Set((data || []).map((w) => w.seller_id))];
    const sellers: Record<string, { full_name?: string }> = {};
    if (sellerIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', sellerIds);
      for (const p of profiles || []) sellers[p.id] = p;
    }

    const rows = (data || []).map((w) => ({
      ...w,
      amount_kobo: Number(w.amount_kobo),
      seller: sellers[w.seller_id] || null,
    }));

    return NextResponse.json({ withdrawals: rows });
  } catch (err) {
    console.error('[admin/withdrawals] error:', err);
    return NextResponse.json({ error: 'Could not load withdrawals.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: { action?: string; withdrawalId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
    }

    const action = body?.action;
    const withdrawalId = String(body?.withdrawalId || '');
    if (!['approve', 'reject'].includes(action || '')) {
      return NextResponse.json({ error: 'Valid actions: approve, reject.' }, { status: 400 });
    }
    if (!withdrawalId) {
      return NextResponse.json({ error: 'withdrawalId is required.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (adminProfile?.is_admin !== true) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Load the withdrawal and guard against double-processing.
    const { data: w, error: loadError } = await admin
      .from('withdrawals')
      .select('id, seller_id, amount_kobo, status')
      .eq('id', withdrawalId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!w) {
      return NextResponse.json({ error: 'Withdrawal not found.' }, { status: 404 });
    }
    if (w.status !== 'pending') {
      return NextResponse.json({ error: 'This withdrawal was already processed.' }, { status: 409 });
    }

    const { data: result, error: processError } = await admin.rpc('process_seller_withdrawal', {
      p_withdrawal_id: w.id,
      p_action: action,
    });
    if (processError) {
      const message = processError.message || '';
      if (message.includes('already processed')) {
        return NextResponse.json({ error: 'This withdrawal was already processed.' }, { status: 409 });
      }
      throw processError;
    }

    return NextResponse.json({ ok: true, action: result });
  } catch (err) {
    console.error('[admin/withdrawals] error:', err);
    return NextResponse.json({ error: 'Could not process the withdrawal.' }, { status: 500 });
  }
}