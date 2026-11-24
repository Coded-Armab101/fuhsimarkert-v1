import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  adminDateWindow,
  applyAdminRange,
  parseAdminRange,
} from '@/utils/admin/date-range';

/**
 * Operator pickup audit view.
 *
 * GET ?range=<shared window> -> handover events, assigned staff, and staff
 * assignment/removal history. All reads use the service role; the new audit
 * tables are private to that role.
 *
 * Authorization: profiles.is_admin = true.
 */

type Row = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient>;

type AdminContext =
  | { admin: AdminClient; user: { id: string } }
  | { error: string; status: number };

function text(value: unknown, max = 1000): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function createdAt(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function safeRows(
  run: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  label: string,
): Promise<Row[]> {
  try {
    const { data, error } = await run();
    if (error) {
      console.warn(`[admin/pickup] ${label} query failed`, error.message);
      return [];
    }
    return Array.isArray(data) ? (data as Row[]) : [];
  } catch (error) {
    console.warn(`[admin/pickup] ${label} query unavailable`, error);
    return [];
  }
}

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

async function loadProfiles(admin: AdminClient, ids: string[]): Promise<Row[]> {
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 1000);
  const rows: Row[] = [];
  for (let offset = 0; offset < unique.length; offset += 200) {
    rows.push(...await safeRows(
      () => admin
        .from('profiles')
        .select('id, full_name, is_pickup_staff')
        .in('id', unique.slice(offset, offset + 200)),
      'referenced profiles',
    ));
  }
  return rows;
}

export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const window = adminDateWindow(parseAdminRange(new URL(request.url).searchParams.get('range')));
  const admin = ctx.admin;

  try {
    const [events, staffChanges, staffRows] = await Promise.all([
      safeRows(
        () => applyAdminRange(
          admin
            .from('pickup_events')
            .select('id, staff_id, order_ref, delivery_code, event_type, note, created_at')
            .order('created_at', { ascending: false }),
          window,
        ).limit(500),
        'pickup_events',
      ),
      safeRows(
        () => applyAdminRange(
          admin
            .from('pickup_staff_events')
            .select('id, user_id, admin_id, action, reason, created_at')
            .order('created_at', { ascending: false }),
          window,
        ).limit(200),
        'pickup_staff_events',
      ),
      safeRows(
        () => admin
          .from('profiles')
          .select('id, full_name, is_pickup_staff')
          .eq('is_pickup_staff', true)
          .order('full_name', { ascending: true })
          .limit(500),
        'pickup staff',
      ),
    ]);

    const referencedIds = [
      ...events.map((row) => String(row.staff_id ?? '')),
      ...staffChanges.map((row) => String(row.user_id ?? '')),
      ...staffChanges.map((row) => String(row.admin_id ?? '')),
    ];
    const extraProfiles = await loadProfiles(admin, referencedIds);
    const profileById = new Map<string, Row>();
    for (const row of [...extraProfiles, ...staffRows]) profileById.set(String(row.id), row);
    const nameOf = (id: unknown): string | null =>
      text(profileById.get(String(id ?? ''))?.full_name, 200);

    // Assigned staff, plus anyone still referenced by a historical event.
    const staffIds = Array.from(new Set([
      ...staffRows.map((row) => String(row.id)),
      ...events.map((row) => String(row.staff_id ?? '')),
      ...staffChanges.map((row) => String(row.user_id ?? '')),
    ])).filter(Boolean).slice(0, 500);
    const staff = staffIds.map((id) => ({
      id,
      name: text(profileById.get(id)?.full_name, 200),
      isPickupStaff: profileById.get(id)?.is_pickup_staff === true,
    }));

    return NextResponse.json({
      events: events.map((row) => ({
        id: String(row.id),
        staffId: String(row.staff_id ?? ''),
        staffName: nameOf(row.staff_id),
        orderRef: text(row.order_ref, 200),
        deliveryCode: text(row.delivery_code, 100),
        eventType: text(row.event_type, 50),
        note: text(row.note, 500),
        createdAt: createdAt(row.created_at),
      })),
      staff,
      staffChanges: staffChanges.map((row) => ({
        id: String(row.id),
        userId: String(row.user_id ?? ''),
        userName: nameOf(row.user_id),
        action: text(row.action, 50),
        reason: text(row.reason, 500),
        createdAt: createdAt(row.created_at),
        adminName: nameOf(row.admin_id),
      })),
    });
  } catch (error) {
    console.error('[admin/pickup] GET failed', error);
    return NextResponse.json({ error: 'Could not load pickup activity.' }, { status: 500 });
  }
}
