import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminDateWindow,
  adminRangeQuery,
  applyAdminRange,
  inAdminRange,
  parseAdminRange,
  trendBuckets,
} from '../utils/admin/date-range.ts';

const NOW = Date.parse('2026-11-24T12:34:56.000Z'); // Tuesday

test('parseAdminRange only accepts the five shared admin windows', () => {
  assert.equal(parseAdminRange('today'), 'today');
  assert.equal(parseAdminRange(' WEEK '), 'week');
  assert.equal(parseAdminRange('month'), 'month');
  assert.equal(parseAdminRange('year'), 'year');
  assert.equal(parseAdminRange('all'), 'all');
  assert.equal(parseAdminRange(null), 'all');
  assert.equal(parseAdminRange('last-week'), 'all');
});

test('adminDateWindow uses UTC days and Monday-based weeks', () => {
  const all = adminDateWindow('all', NOW);
  assert.equal(all.start, null);
  assert.equal(all.end, NOW);
  assert.equal(all.startIso, null);

  assert.equal(adminDateWindow('today', NOW).startIso, '2026-11-24T00:00:00.000Z');
  assert.equal(adminDateWindow('week', NOW).startIso, '2026-11-23T00:00:00.000Z');
  assert.equal(adminDateWindow('month', NOW).startIso, '2026-11-01T00:00:00.000Z');
  assert.equal(adminDateWindow('year', NOW).startIso, '2026-01-01T00:00:00.000Z');

  assert.equal(adminDateWindow('week', NOW).label, 'This week');
});

test('inAdminRange includes the window start and end but excludes older rows', () => {
  const week = adminDateWindow('week', NOW);
  assert.equal(inAdminRange(null, week), false);
  assert.equal(inAdminRange('not-a-date', week), false);
  assert.equal(inAdminRange('2026-11-22T23:59:59.000Z', week), false);
  assert.equal(inAdminRange('2026-11-23T00:00:00.000Z', week), true);
  assert.equal(inAdminRange('2026-11-24T12:34:56.000Z', week), true);
  assert.equal(inAdminRange('2026-11-25T00:00:00.000Z', week), false);
  assert.equal(inAdminRange('2026-09-01T00:00:00.000Z', adminDateWindow('all', NOW)), true);
});

test('applyAdminRange is a no-op for all time and adds gte otherwise', () => {
  const calls: Array<[string, string]> = [];
  const query = {
    gte(column: string, value: string) {
      calls.push([column, value]);
      return query;
    },
  };

  assert.equal(applyAdminRange(query, adminDateWindow('all', NOW)), query);
  assert.equal(calls.length, 0);

  assert.equal(applyAdminRange(query, adminDateWindow('month', NOW), 'created_at'), query);
  assert.deepEqual(calls, [['created_at', '2026-11-01T00:00:00.000Z']]);
});

test('adminRangeQuery and trendBuckets stay aligned with the selected range', () => {
  assert.equal(adminRangeQuery('all'), '');
  assert.equal(adminRangeQuery('today'), '?range=today');
  assert.equal(adminRangeQuery('week'), '?range=week');

  const today = trendBuckets('today', NOW);
  assert.equal(today.length, 24);
  assert.equal(today[0], '00:00');
  assert.equal(today[23], '23:00');

  const week = trendBuckets('week', NOW);
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-11-18');
  assert.equal(week[6], '2026-11-24');

  const year = trendBuckets('year', NOW);
  assert.equal(year.length, 12);
  assert.equal(year[11], '2026-11');
});
