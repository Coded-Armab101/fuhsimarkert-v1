import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Admin review of seller identity-verification submissions.
 *
 * GET  – list sellers whose verification is pending or rejected, including
 *        signed URLs so the admin can view the uploaded student ID card and the
 *        3-second verification video (the bucket is private).
 * POST – approve or reject a submission.
 *        - Approve: mark the seller verified (`is_approved_seller`).
 *        - Reject:  mark rejected + record a reason and delete the submitted
 *          files so the seller can re-record and resubmit. The paid fee is KEPT
 *          (no refund) and active seller access is left intact.
 *
 * Authorization: profiles.is_admin = true.
 */
const BUCKET = 'verification-documents';

/**
 * Delete a seller's verification files (student ID + video) once the admin has
 * decided, so resolved submissions do not keep consuming storage.
 *
 * This runs with the service-role client (bypasses the owner-scoped bucket RLS)
 * and VERIFIES the removal — the old code ignored the `.remove()` error, which is
 * why files stayed in the bucket (and their signed URLs kept working) even though
 * the profile paths were nulled out.
 */
async function deleteVerificationFiles(admin: ReturnType<typeof createAdminClient>, sellerId: string) {
  const { data: profile } = await admin
    .from('profiles')
    .select('student_id_url, verification_video_url')
    .eq('id', sellerId)
    .maybeSingle();

  const keys = [profile?.student_id_url, profile?.verification_video_url].filter(
    (k): k is string => Boolean(k)
  );
  if (keys.length === 0) return;

  const { error } = await admin.storage.from(BUCKET).remove(keys);
  if (error) {
    throw new Error(`Could not remove verification files: ${error.message}`);
  }
  console.log(`[admin/verifications] removed ${keys.length} file(s) for seller ${sellerId}: ${keys.join(', ')}`);
}

type VerificationDoc = {
  student_id_url?: string | null;
  verification_video_url?: string | null;
};

async function signUrls(admin: ReturnType<typeof createAdminClient>, docs: VerificationDoc) {
  const out: { student_id_url: string | null; verification_video_url: string | null } = {
    student_id_url: null,
    verification_video_url: null,
  };
  for (const [key, path] of Object.entries({ ...docs })) {
    if (!path) continue;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 4);
    void error;
    if (data?.signedUrl) out[key as keyof typeof out] = data.signedUrl;
  }
  return out;
}

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

    const { data, error } = await admin
      .from('profiles')
      .select(
        'id, full_name, is_approved_seller, verification_status, verification_submitted_at, verification_reviewed_at, verification_reject_reason, student_id_url, verification_video_url'
      )
      .in('verification_status', ['pending', 'rejected'])
      .order('verification_submitted_at', { ascending: true, nullsFirst: false });
    if (error) throw error;

    const sellers = await Promise.all(
      (data || []).map(async (s) => ({
        id: s.id,
        full_name: s.full_name,
        submittedAt: s.verification_submitted_at,
        reviewedAt: s.verification_reviewed_at,
        status: s.verification_status,
        rejectReason: s.verification_reject_reason,
        isApproved: s.is_approved_seller === true,
        urls: await signUrls(admin, {
          student_id_url: s.student_id_url,
          verification_video_url: s.verification_video_url,
        }),
      }))
    );

    return NextResponse.json({ sellers });
  } catch (err) {
    console.error('[admin/verifications] GET error:', err);
    return NextResponse.json({ error: 'Could not load verification submissions.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const sellerId = String(body?.sellerId || '');
    const action = String(body?.action || '');
    const rejectReason = String(body?.rejectReason || '').trim();

    if (!sellerId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'sellerId and a valid action are required.' }, { status: 400 });
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

    // Rejecting requires a reason.
    if (action === 'reject' && !rejectReason) {
      return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      // Delete the uploaded ID + video first (paths still on the profile), then
      // mark approved and clear the references so they do not consume storage.
      await deleteVerificationFiles(admin, sellerId);
      const { error } = await admin
        .from('profiles')
        .update({
          is_approved_seller: true,
          verification_status: 'approved',
          verification_reviewed_at: now,
          verification_reject_reason: null,
          student_id_url: null,
          verification_video_url: null,
        })
        .eq('id', sellerId);
      if (error) throw error;
      return NextResponse.json({ ok: true, action: 'approve' });
    }

    // REJECT: mark rejected + record a reason but KEEP the paid fee and keep the
    // seller's active access, so they can re-record and resubmit to get approved.
    // The submitted files are deleted to free storage; the seller uploads fresh
    // ones on their next attempt.
    await deleteVerificationFiles(admin, sellerId);

    const { error: rejectError } = await admin
      .from('profiles')
      .update({
        is_approved_seller: false,
        verification_status: 'rejected',
        verification_reviewed_at: now,
        verification_reject_reason: rejectReason,
        // Drop the stale file references (files are already deleted above); the
        // seller re-uploads on their next submission.
        student_id_url: null,
        verification_video_url: null,
      })
      .eq('id', sellerId);
    if (rejectError) throw rejectError;

    return NextResponse.json({ ok: true, action: 'reject' });
  } catch (err) {
    console.error('[admin/verifications] POST error:', err);
    return NextResponse.json({ error: 'Could not process this verification.' }, { status: 500 });
  }
}