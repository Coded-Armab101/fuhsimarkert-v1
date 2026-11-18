import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { accountIsActive } from '@/utils/account';
import { getSellerStorageUsed, uploadProductImage } from '@/utils/upload';

/**
 * Trusted product-image upload endpoint.
 *
 * The browser posts the raw file here. Authentication, the account status, the
 * storage quota and the current usage are all read on the server, and the file
 * is uploaded with the service-role client. This is the only place product
 * images are written, so a tampered browser cannot bypass the quota by passing
 * a different `storage_quota` or by ignoring a failed usage lookup.
 *
 * GET  -> { quota, usedBytes } for the signed-in seller (for the quota meter).
 * POST -> multipart form with a `file` field -> { ok: true, url }.
 */
async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized.' as const, status: 401 as const };
  if (!(await accountIsActive(supabase, user.id))) {
    return { error: 'This account is suspended.' as const, status: 403 as const };
  }
  return { user };
}

export async function GET() {
  try {
    const auth = await authenticatedUser();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('storage_quota')
      .eq('id', auth.user.id)
      .maybeSingle<{ storage_quota: number | null }>();

    // The quota is trusted server data; the browser never supplies it.
    const quota = profile?.storage_quota != null ? Number(profile.storage_quota) : null;

    const usage = await getSellerStorageUsed(admin, auth.user.id);
    if (!usage.ok) {
      // Fail closed: do not report a misleading zero that could be used to
      // justify an upload the server would otherwise reject.
      return NextResponse.json({ error: usage.error }, { status: 500 });
    }

    return NextResponse.json({ quota, usedBytes: usage.bytes });
  } catch (err) {
    console.error('[upload] GET failed', err);
    return NextResponse.json({ error: 'Could not read your storage allowance.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticatedUser();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const formData = await request.formData().catch(() => null);
    const entry = formData?.get('file');
    if (!entry || typeof entry === 'string') {
      return NextResponse.json({ error: 'No image file was provided.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('storage_quota')
      .eq('id', auth.user.id)
      .maybeSingle<{ storage_quota: number | null }>();
    const quota = profile?.storage_quota != null ? Number(profile.storage_quota) : null;

    const result = await uploadProductImage(admin, auth.user.id, entry, quota);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, url: result.url });
  } catch (err) {
    console.error('[upload] POST failed', err);
    return NextResponse.json({ error: 'Could not upload the image. Please try again.' }, { status: 500 });
  }
}
