import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { adminDateWindow, applyAdminRange, parseAdminRange } from '@/utils/admin/date-range';

/**
 * Admin broadcast management.
 *
 * A broadcast is a dismissible modal shown to buyers/sellers. The display
 * window is `starts_at` → `ends_at`, so an admin can schedule an announcement
 * ahead of time and switch it off later. The tables have RLS enabled with no
 * client policies; every read/write here runs under the service-role client
 * after `profiles.is_admin = true` is verified.
 */

const AUDIENCES = ['all', 'buyers', 'sellers'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Audience = (typeof AUDIENCES)[number];

type BroadcastRow = {
  id: string;
  title: string;
  message: string;
  audience: Audience;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.is_admin !== true) {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) };
  }

  return { user, admin };
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateWasProvided(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { admin } = auth;

    const range = parseAdminRange(new URL(request.url).searchParams.get('range'));
    const window = adminDateWindow(range);
    let query = admin
      .from('broadcasts')
      .select('id, title, message, audience, starts_at, ends_at, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });
    query = applyAdminRange(query, window, 'created_at');
    const { data, error } = await query.limit(100);

    if (error) throw error;

    const rows = (data || []) as BroadcastRow[];

    // Small, bounded dismissal count per broadcast for the admin list.
    const counts: Record<string, number> = {};
    if (rows.length > 0) {
      const { data: dismissals, error: dismissalsError } = await admin
        .from('broadcast_dismissals')
        .select('broadcast_id')
        .in('broadcast_id', rows.map((row) => row.id));
      if (dismissalsError) throw dismissalsError;
      for (const row of dismissals || []) {
        const id = (row as { broadcast_id: string }).broadcast_id;
        counts[id] = (counts[id] || 0) + 1;
      }
    }

    const now = Date.now();
    return NextResponse.json({
      broadcasts: rows.map((row) => {
        const starts = new Date(row.starts_at).getTime();
        const ends = row.ends_at ? new Date(row.ends_at).getTime() : null;
        const live = row.is_active && starts <= now && (ends === null || ends > now);
        return {
          ...row,
          dismissals: counts[row.id] || 0,
          status: !row.is_active
            ? 'draft'
            : ends !== null && ends <= now
              ? 'ended'
              : starts > now
                ? 'scheduled'
                : 'live',
          live,
        };
      }),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('[admin/broadcasts] GET failed', err);
    return NextResponse.json({ error: 'Could not load broadcasts.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { admin, user } = auth;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = text(body.title, 120);
    const message = text(body.message, 2000);
    const audience = AUDIENCES.includes(body.audience as Audience)
      ? (body.audience as Audience)
      : null;
    const startsAt = dateWasProvided(body.starts_at)
      ? parseDate(body.starts_at)
      : new Date().toISOString();
    const endsAt = dateWasProvided(body.ends_at) ? parseDate(body.ends_at) : null;

    if (!title) {
      return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
    }
    if (!audience) {
      return NextResponse.json({ error: 'Choose a valid audience.' }, { status: 400 });
    }
    if (!startsAt) {
      return NextResponse.json({ error: 'Choose a valid start time.' }, { status: 400 });
    }
    if (dateWasProvided(body.ends_at) && !endsAt) {
      return NextResponse.json({ error: 'Choose a valid end time.' }, { status: 400 });
    }
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      return NextResponse.json(
        { error: 'The end time must be after the start time.' },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from('broadcasts')
      .insert({
        title,
        message,
        audience,
        starts_at: startsAt,
        ends_at: endsAt,
        is_active: body.is_active === undefined ? true : body.is_active === true,
        created_by: user.id,
      })
      .select('id, title, message, audience, starts_at, ends_at, is_active, created_at, updated_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ broadcast: data }, { status: 201 });
  } catch (err) {
    console.error('[admin/broadcasts] POST failed', err);
    return NextResponse.json({ error: 'Could not create the broadcast.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { admin } = auth;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = text(body.id, 64);
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Missing broadcast id.' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await admin
      .from('broadcasts')
      .select('id, starts_at, ends_at')
      .eq('id', id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ error: 'Broadcast not found.' }, { status: 404 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) {
      const title = text(body.title, 120);
      if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
      update.title = title;
    }
    if (body.message !== undefined) {
      const message = text(body.message, 2000);
      if (!message) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
      update.message = message;
    }
    if (body.audience !== undefined) {
      if (!AUDIENCES.includes(body.audience as Audience)) {
        return NextResponse.json({ error: 'Choose a valid audience.' }, { status: 400 });
      }
      update.audience = body.audience;
    }
    if (body.starts_at !== undefined) {
      const startsAt = parseDate(body.starts_at);
      if (!startsAt) {
        return NextResponse.json({ error: 'Invalid start time.' }, { status: 400 });
      }
      update.starts_at = startsAt;
    }
    if (body.ends_at !== undefined) {
      const endsAt = dateWasProvided(body.ends_at) ? parseDate(body.ends_at) : null;
      if (dateWasProvided(body.ends_at) && !endsAt) {
        return NextResponse.json({ error: 'Invalid end time.' }, { status: 400 });
      }
      update.ends_at = endsAt;
    }
    if (body.is_active !== undefined) {
      update.is_active = body.is_active === true;
    }

    const finalStart = typeof update.starts_at === 'string' ? update.starts_at : existing.starts_at;
    const finalEnd = Object.prototype.hasOwnProperty.call(update, 'ends_at')
      ? (update.ends_at as string | null)
      : existing.ends_at;
    if (finalEnd && new Date(finalEnd) <= new Date(finalStart)) {
      return NextResponse.json(
        { error: 'The end time must be after the start time.' },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from('broadcasts')
      .update(update)
      .eq('id', id)
      .select('id, title, message, audience, starts_at, ends_at, is_active, created_at, updated_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Broadcast not found.' }, { status: 404 });
    }
    return NextResponse.json({ broadcast: data });
  } catch (err) {
    console.error('[admin/broadcasts] PATCH failed', err);
    return NextResponse.json({ error: 'Could not update the broadcast.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { admin } = auth;

    const id = new URL(request.url).searchParams.get('id') || '';
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Missing broadcast id.' }, { status: 400 });
    }

    const { error } = await admin.from('broadcasts').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/broadcasts] DELETE failed', err);
    return NextResponse.json({ error: 'Could not delete the broadcast.' }, { status: 500 });
  }
}
