/**
 * Shared date window for the operator console.
 *
 * Every admin list and metric uses the same window so switching "Today" filters
 * orders, users, payments, payouts, products and support in exactly the same way.
 * Windows are UTC-based, which is deterministic on Vercel's serverless runtime;
 * the label is for humans, the numeric start/end are the source of truth.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminRange = 'all' | 'today' | 'week' | 'month' | 'year';

export type AdminDateWindow = {
  key: AdminRange;
  label: string;
  start: number | null;
  end: number;
  startIso: string | null;
  endIso: string;
};

export const ADMIN_RANGE_OPTIONS: Array<{ id: AdminRange; label: string }> = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
];

export function parseAdminRange(raw: unknown): AdminRange {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'today' || value === 'week' || value === 'month' || value === 'year'
    ? value
    : 'all';
}

function startOfUtcDay(input: Date): Date {
  const day = new Date(input);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

export function adminDateWindow(range: AdminRange, now = Date.now()): AdminDateWindow {
  const end = now;
  let start: number | null = null;

  if (range === 'today') {
    start = startOfUtcDay(new Date(now)).getTime();
  } else if (range === 'week') {
    const day = startOfUtcDay(new Date(now));
    // Monday-based week. getUTCDay(): 0 = Sunday.
    const offset = (day.getUTCDay() + 6) % 7;
    start = day.getTime() - offset * 24 * 60 * 60 * 1000;
  } else if (range === 'month') {
    const day = startOfUtcDay(new Date(now));
    day.setUTCDate(1);
    start = day.getTime();
  } else if (range === 'year') {
    const day = startOfUtcDay(new Date(now));
    day.setUTCMonth(0, 1);
    start = day.getTime();
  }

  const label = ADMIN_RANGE_OPTIONS.find((option) => option.id === range)?.label || 'All time';
  return {
    key: range,
    label,
    start,
    end,
    startIso: start === null ? null : new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  };
}

/** True when an ISO timestamp falls inside the selected admin window. */
export function inAdminRange(
  iso: string | null | undefined,
  window: AdminDateWindow,
): boolean {
  if (window.start === null) return true;
  if (!iso) return false;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) && value >= window.start && value <= window.end;
}

/** Query param helper for client fetches. */
export function adminRangeQuery(range: AdminRange): string {
  return range === 'all' ? '' : `?range=${encodeURIComponent(range)}`;
}

/** Apply a range to a Supabase query that has a created_at-style column. */
export function applyAdminRange<T>(
  query: T,
  window: AdminDateWindow,
  column = 'created_at',
): T {
  if (window.startIso === null) return query;
  return (query as unknown as {
    gte: (column: string, value: string) => T;
  }).gte(column, window.startIso);
}

/**
 * Auth signup dates live in `auth.users`, not reliably on `profiles`. This
 * resolves the IDs joined in a window so lists such as storage can use the same
 * "This month" filter as the rest of the board. Paged and bounded like metrics.
 */
export async function authUserIdsInRange(
  admin: SupabaseClient,
  window: AdminDateWindow,
): Promise<Set<string> | null> {
  if (window.start === null) return null;
  const ids = new Set<string>();
  try {
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const user of users) {
        if (inAdminRange(user.created_at, window)) ids.add(user.id);
      }
      const lastPage = Number((data as { lastPage?: number } | null)?.lastPage);
      if (users.length < 1000 || page >= (Number.isFinite(lastPage) ? lastPage : page)) break;
    }
    return ids;
  } catch (error) {
    console.warn('[admin/date-range] auth signups unavailable for range filter', error);
    return null;
  }
}

/** Bucket key for the overview trend in the selected window. */
export function trendBucket(iso: string | null | undefined, range: AdminRange): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (range === 'today') {
    return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
  }
  if (range === 'week' || range === 'month') {
    return date.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 7);
}

/**
 * Ordered trend bucket keys. Kept small (24/7/30/12) so the board stays fast
 * even with a large table; aggregated values still come from the filtered rows.
 */
export function trendBuckets(range: AdminRange, now = Date.now()): string[] {
  const buckets: string[] = [];
  const base = new Date(now);

  if (range === 'today') {
    base.setUTCHours(0, 0, 0, 0);
    for (let hour = 0; hour < 24; hour += 1) {
      buckets.push(`${String(hour).padStart(2, '0')}:00`);
    }
    return buckets;
  }

  if (range === 'week' || range === 'month') {
    const days = range === 'week' ? 7 : 30;
    base.setUTCHours(0, 0, 0, 0);
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      buckets.push(new Date(base.getTime() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    }
    return buckets;
  }

  base.setUTCDate(1);
  for (let offset = 11; offset >= 0; offset -= 1) {
    const month = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - offset, 1));
    buckets.push(month.toISOString().slice(0, 7));
  }
  return buckets;
}
