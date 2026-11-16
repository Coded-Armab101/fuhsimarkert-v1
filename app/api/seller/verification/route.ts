import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { hasActiveRole, isAdmin, type RoleProfile } from '@/utils/roles';
import { SELLER_VERIFICATION_CONSENT_VERSION } from '@/utils/legal';
import { accountIsActive } from '@/utils/account';

type Submission = {
  studentIdPath?: unknown;
  videoPath?: unknown;
  consent?: unknown;
  consentVersion?: unknown;
};

function ownedPath(value: unknown, userId: string, prefix: string): string | null {
  const path = String(value ?? '').trim();
  if (!path || path.length > 500) return null;
  return path.startsWith(`${userId}/${prefix}_`) ? path : null;
}

/**
 * Records a seller verification submission and its explicit, versioned consent.
 * Files are uploaded directly to the user's private storage folder first; this
 * route validates that both object paths belong to the authenticated user.
 */
export async function POST(request: Request) {
  try {
    let body: Submission;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed verification submission.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    }
    if (!(await accountIsActive(supabase, user.id))) {
      return NextResponse.json({ error: 'This account is suspended.' }, { status: 403 });
    }

    if (
      body.consent !== true ||
      body.consentVersion !== SELLER_VERIFICATION_CONSENT_VERSION
    ) {
      return NextResponse.json({
        error: 'You must agree to the student-verification use of your ID and video before submitting.',
      }, { status: 400 });
    }

    const studentIdPath = ownedPath(body.studentIdPath, user.id, 'student-id');
    const videoPath = ownedPath(body.videoPath, user.id, 'verification-video');
    if (!studentIdPath || !videoPath) {
      return NextResponse.json({ error: 'Both verification files are required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('user_persona, is_seller, seller_active, subscription_expires_at, is_admin, is_approved_seller, verification_status')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || (!isAdmin(profile as RoleProfile) && !hasActiveRole(profile as RoleProfile, 'seller'))) {
      return NextResponse.json({ error: 'An active seller plan is required.' }, { status: 403 });
    }
    if (profile.is_approved_seller === true) {
      return NextResponse.json({ error: 'This seller account is already verified.' }, { status: 409 });
    }
    if (profile.verification_status === 'pending') {
      return NextResponse.json({ error: 'Your verification is already waiting for review.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        student_id_url: studentIdPath,
        verification_video_url: videoPath,
        verification_status: 'pending',
        verification_submitted_at: now,
        verification_consent_at: now,
        verification_consent_version: SELLER_VERIFICATION_CONSENT_VERSION,
        verification_reject_reason: null,
        updated_at: now,
      })
      .eq('id', user.id);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, status: 'pending', submittedAt: now });
  } catch (error) {
    console.error('[seller/verification] submit failed', error);
    return NextResponse.json({ error: 'Could not submit your verification.' }, { status: 500 });
  }
}
