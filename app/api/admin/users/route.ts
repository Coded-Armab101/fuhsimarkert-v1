import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { loadAdminUsers } from '@/utils/admin/metrics';
import { parseAdminRange } from '@/utils/admin/date-range';

/**
 * Operator people directory: every profile with role, verification state,
 * wallet balance and simple buyer/seller activity totals.
 *
 * Query params:
 *   q      – case-insensitive name or id search
 *   limit  – max rows returned (default 200, capped at 500)
 *   range  – shared admin date window (signup date)
 *
 * Authorization: profiles.is_admin = true.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || '';
    const requestedLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
      : 200;

    const range = parseAdminRange(searchParams.get('range'));
    const result = await loadAdminUsers(admin, search, limit, range);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[admin/users] failed', err);
    return NextResponse.json({ error: 'Could not load the user directory.' }, { status: 500 });
  }
}

type ModerationBody = {
  userId?: unknown;
  action?: unknown;
  reason?: unknown;
};

/** Suspend or restore a buyer/seller account, with an immutable audit event. */
export async function PATCH(request: Request) {
  try {
    let body: ModerationBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed moderation request.' }, { status: 400 });
    }

    const userId = String(body.userId ?? '').trim();
    const action = String(body.action ?? '').trim();
    const reason = String(body.reason ?? '').trim().slice(0, 500);
    const pickupAction = action === 'assign_pickup' || action === 'remove_pickup';
    if (!userId || !['suspend', 'restore', 'assign_pickup', 'remove_pickup'].includes(action)) {
      return NextResponse.json({ error: 'A user and valid moderation action are required.' }, { status: 400 });
    }
    if (reason.length < 5) {
      return NextResponse.json({ error: 'Enter a clear reason of at least 5 characters.' }, { status: 400 });
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

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, is_admin, is_suspended, is_pickup_staff')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    if (target.id === user.id) {
      return NextResponse.json({ error: 'You cannot change your own account here.' }, { status: 403 });
    }
    if (!pickupAction && target.is_admin === true) {
      return NextResponse.json({ error: 'Administrator accounts cannot be suspended here.' }, { status: 403 });
    }

    if (pickupAction) {
      const shouldBeStaff = action === 'assign_pickup';
      if (target.is_pickup_staff === shouldBeStaff) {
        return NextResponse.json({
          ok: true,
          isPickupStaff: shouldBeStaff,
          unchanged: true,
        });
      }
      const { error: roleError } = await admin
        .from('profiles')
        .update({ is_pickup_staff: shouldBeStaff })
        .eq('id', userId);
      if (roleError) throw roleError;
      const { error: auditError } = await admin.from('pickup_staff_events').insert({
        user_id: userId,
        admin_id: user.id,
        action: shouldBeStaff ? 'assigned' : 'removed',
        reason,
      });
      // The role change is already committed. A missing audit table must not
      // silently roll it back; log loudly so it can be reconciled.
      if (auditError) console.error('[admin/users] pickup role audit failed', auditError);
      return NextResponse.json({
        ok: true,
        isPickupStaff: shouldBeStaff,
        status: shouldBeStaff ? 'pickup_staff' : 'active',
      });
    }

    const shouldSuspend = action === 'suspend';
    if (target.is_suspended === shouldSuspend) {
      return NextResponse.json({
        ok: true,
        status: shouldSuspend ? 'suspended' : 'active',
        unchanged: true,
      });
    }

    // Supabase Auth blocks future sign-ins and token refreshes. The profile flag
    // is checked by proxy/layout and is also a database-write backstop for an
    // access token that was issued just before the ban.
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: shouldSuspend ? '876000h' : 'none',
    });
    if (banError) {
      console.error('[admin/users] auth moderation failed', banError);
      return NextResponse.json({ error: 'Could not update this account in authentication.' }, { status: 502 });
    }

    const now = new Date().toISOString();
    const { error: profileError } = await admin
      .from('profiles')
      .update(
        shouldSuspend
          ? {
              is_suspended: true,
              suspended_at: now,
              suspension_reason: reason,
              suspended_by: user.id,
            }
          : {
              is_suspended: false,
              suspended_at: null,
              suspension_reason: null,
              suspended_by: null,
            },
      )
      .eq('id', userId);

    if (profileError) {
      // Keep Auth and the profile ledger in agreement if the database update
      // fails after the provider accepted the ban/unban.
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: shouldSuspend ? 'none' : '876000h',
      });
      throw profileError;
    }

    const { error: auditError } = await admin.from('account_moderation_events').insert({
      user_id: userId,
      admin_id: user.id,
      action,
      reason,
    });
    if (auditError) {
      // The account safety decision has already completed. Do not silently undo
      // it because a secondary audit insert failed; log loudly for reconciliation.
      console.error('[admin/users] moderation audit insert failed', auditError);
    }

    return NextResponse.json({
      ok: true,
      status: shouldSuspend ? 'suspended' : 'active',
    });
  } catch (err) {
    console.error('[admin/users] moderation failed', err);
    return NextResponse.json({ error: 'Could not update this account.' }, { status: 500 });
  }
}
