import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { notifyUsers } from '@/utils/notifications';
import { adminDateWindow, applyAdminRange, parseAdminRange } from '@/utils/admin/date-range';

/**
 * Operator review of hung-payment evidence.
 *
 * GET  -> all submissions with buyer identity, frozen checkout details and a
 *         15-minute signed URL for each stored private proof image.
 * POST -> { id, status: 'under_review'|'resolved'|'rejected', adminNote }
 *         records the decision and notifies the buyer.
 *
 * Only paths read from payment_evidence are ever signed. Admin identity comes
 * from the verified session, never from the request body.
 */

const BUCKET = 'payment-proofs';
const SIGNED_URL_SECONDS = 15 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AdminClient = ReturnType<typeof createAdminClient>;

type AdminContext =
  | { admin: AdminClient; user: { id: string } }
  | { error: string; status: number };

const textField = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Unauthorized.', status: 401 };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) return { error: 'Forbidden.', status: 403 };
  return { admin, user: { id: user.id } };
}

/**
 * `notifyUsers` de-duplicates on (user, order_id, type). Evidence reviews are
 * separate events, so each gets a fresh UUID correlation id; the URL points the
 * buyer back to Support. notifications.order_id has no FK.
 */
const notificationCorrelationId = (): string => globalThis.crypto.randomUUID();

export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const range = parseAdminRange(new URL(request.url).searchParams.get('range'));
    const window = adminDateWindow(range);
    let query = ctx.admin
      .from('payment_evidence')
      .select(
        'id, checkout_reference, buyer_id, buyer_reference, amount_naira, paid_at, note, proof_path, status, admin_note, resolved_by, resolved_at, created_at',
      )
      .order('created_at', { ascending: false });
    query = applyAdminRange(query, window, 'created_at');
    const { data, error } = await query.limit(200);
    if (error) throw error;

    const submissions = (data ?? []) as Array<Record<string, unknown>>;
    const buyerIds = Array.from(new Set(submissions.map((row) => String(row.buyer_id))));
    const references = Array.from(
      new Set(submissions.map((row) => String(row.checkout_reference))),
    );

    const [profileRows, attemptRows, emailEntries] = await Promise.all([
      buyerIds.length > 0
        ? ctx.admin.from('profiles').select('id, full_name').in('id', buyerIds)
        : Promise.resolve({ data: [], error: null }),
      references.length > 0
        ? ctx.admin
            .from('checkout_attempts')
            .select('reference, expected_total_kobo, status, buyer_email, created_at')
            .in('reference', references)
        : Promise.resolve({ data: [], error: null }),
      Promise.all(
        buyerIds.map(async (userId): Promise<[string, string | null]> => {
          try {
            const { data } = await ctx.admin.auth.admin.getUserById(userId);
            return [userId, data.user?.email ?? null];
          } catch (lookupError) {
            console.warn('[admin/payment-evidence] buyer email lookup failed', lookupError);
            return [userId, null];
          }
        }),
      ),
    ]);

    if (profileRows.error) throw profileRows.error;
    if (attemptRows.error) throw attemptRows.error;

    const nameById = new Map(
      ((profileRows.data ?? []) as Array<Record<string, unknown>>).map((row) => [
        String(row.id),
        typeof row.full_name === 'string' ? row.full_name : null,
      ]),
    );
    const attemptByReference = new Map(
      ((attemptRows.data ?? []) as Array<Record<string, unknown>>).map((row) => [
        String(row.reference),
        row,
      ]),
    );
    const emailById = new Map(emailEntries);

    const items = await Promise.all(
      submissions.map(async (row) => {
        const reference = String(row.checkout_reference);
        const buyerId = String(row.buyer_id);
        const attempt = attemptByReference.get(reference);
        const storedPath = typeof row.proof_path === 'string' && row.proof_path
          ? row.proof_path
          : null;

        let proofUrl: string | null = null;
        if (storedPath) {
          // The path came from the database row, never from a query parameter.
          const { data: signed, error: signError } = await ctx.admin.storage
            .from(BUCKET)
            .createSignedUrl(storedPath, SIGNED_URL_SECONDS);
          if (signError || !signed?.signedUrl) {
            console.warn('[admin/payment-evidence] could not sign proof', signError);
          } else {
            proofUrl = signed.signedUrl;
          }
        }

        return {
          ...row,
          buyer_name: nameById.get(buyerId) ?? null,
          buyer_email: emailById.get(buyerId) ??
            (typeof attempt?.buyer_email === 'string' ? attempt.buyer_email : null),
          checkout_status: attempt?.status ?? null,
          expected_total_kobo: attempt?.expected_total_kobo ?? null,
          checkout_created_at: attempt?.created_at ?? null,
          proof_url: proofUrl,
        };
      }),
    );

    return NextResponse.json({ submissions: items });
  } catch (error) {
    console.error('[admin/payment-evidence] GET failed', error);
    return NextResponse.json({ error: 'Could not load payment evidence.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
    }

    const id = textField(body.id);
    const status = textField(body.status);
    const adminNote = textField(body.adminNote);

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'A valid evidence id is required.' }, { status: 400 });
    }
    if (!['under_review', 'resolved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Choose a valid review status.' }, { status: 400 });
    }
    if (adminNote.length < 1 || adminNote.length > 2000) {
      return NextResponse.json(
        { error: 'Add a review note of 1 to 2000 characters.' },
        { status: 400 },
      );
    }

    const { data: updated, error } = await ctx.admin
      .from('payment_evidence')
      .update({
        status,
        admin_note: adminNote,
        resolved_by: ctx.user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, buyer_id, checkout_reference, status, admin_note, resolved_at')
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      return NextResponse.json({ error: 'Payment evidence not found.' }, { status: 404 });
    }

    try {
      await notifyUsers(ctx.admin, {
        userIds: [String(updated.buyer_id)],
        orderId: notificationCorrelationId(),
        type: 'support_reply',
        title: 'Your payment proof was reviewed',
        message: `Status: ${status}. ${adminNote.slice(0, 240)}`,
        url: '/buyer/support',
        tag: `payment-evidence-${String(updated.id)}`,
      });
    } catch (notifyError) {
      console.warn('[admin/payment-evidence] buyer notification failed', notifyError);
    }

    return NextResponse.json({ ok: true, submission: updated });
  } catch (error) {
    console.error('[admin/payment-evidence] POST failed', error);
    return NextResponse.json({ error: 'Could not update this payment evidence.' }, { status: 500 });
  }
}
