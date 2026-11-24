'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardList, Loader2, PackageCheck, RefreshCw, TriangleAlert } from 'lucide-react';

type EventType =
  | 'arrived'
  | 'picked_up'
  | 'handed_to_buyer'
  | 'returned'
  | 'missing'
  | 'issue';

type PickupEvent = {
  id: string;
  orderRef: string;
  deliveryCode: string | null;
  eventType: EventType;
  note: string | null;
  createdAt: string;
};

type FormState = {
  orderRef: string;
  deliveryCode: string;
  eventType: EventType;
  note: string;
};

type Notice = { tone: 'success' | 'error'; text: string };

const EVENT_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: 'arrived', label: 'Item arrived' },
  { value: 'picked_up', label: 'Picked up from seller' },
  { value: 'handed_to_buyer', label: 'Handed to buyer' },
  { value: 'returned', label: 'Returned to seller' },
  { value: 'missing', label: 'Missing / not found' },
  { value: 'issue', label: 'Other issue' },
];

const EVENT_LABELS: Record<EventType, string> = {
  arrived: 'Item arrived',
  picked_up: 'Picked up from seller',
  handed_to_buyer: 'Handed to buyer',
  returned: 'Returned to seller',
  missing: 'Missing / not found',
  issue: 'Other issue',
};

const INITIAL_FORM: FormState = {
  orderRef: '',
  deliveryCode: '',
  eventType: 'arrived',
  note: '',
};

function eventLabel(value: string): string {
  return EVENT_LABELS[value as EventType] ?? value;
}

function eventBadgeClass(value: string): string {
  if (value === 'handed_to_buyer') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (value === 'missing' || value === 'issue') {
    return 'border border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border border-[#ffd9c7] bg-[#fff0e9] text-[#d8552e]';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PickupPage() {
  const [events, setEvents] = useState<PickupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadEvents = useCallback(async () => {
    // Keep the first state change after an await: calling a setter synchronously
    // from the mount effect causes cascading renders in React 19.
    try {
      const response = await fetch('/api/pickup/events', { cache: 'no-store' });

      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        setEvents([]);
        setListError(null);
        return;
      }

      setDenied(false);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.events)) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Could not load pickup events.',
        );
      }

      setEvents(data.events as PickupEvent[]);
      setListError(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not load pickup events.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Defer the initial fetch so no setter runs synchronously in the effect;
    // React 19 treats that as a cascading render.
    const timer = setTimeout(() => void loadEvents(), 0);
    return () => clearTimeout(timer);
  }, [loadEvents]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const orderRef = form.orderRef.trim();
    const deliveryCode = form.deliveryCode.trim();
    const note = form.note.trim();

    if (!orderRef) {
      setNotice({ tone: 'error', text: 'Enter the order reference.' });
      return;
    }
    if (form.eventType === 'handed_to_buyer' && !deliveryCode) {
      setNotice({
        tone: 'error',
        text: 'A delivery code is required when handing an item to the buyer.',
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/pickup/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderRef,
          deliveryCode: deliveryCode || null,
          eventType: form.eventType,
          note: note || null,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Could not log the pickup event.',
        );
      }

      setForm(INITIAL_FORM);
      setRefreshing(true);
      await loadEvents();
      setNotice({
        tone: 'success',
        text: `${eventLabel(form.eventType)} logged for ${orderRef}.`,
      });
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not log the pickup event.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (denied) {
    return (
      <main className="buyer-secondary min-h-screen px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-xl space-y-4">
          <Link
            href="/buyer/profile"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#81756d] transition-colors hover:text-[#d8552e]"
          >
            ← Back to profile
          </Link>
          <section className="rounded-[1.75rem] border border-amber-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
              <TriangleAlert size={20} />
            </div>
            <h1 className="mt-4 text-xl font-black text-[#251d18]">Access denied</h1>
            <p className="mt-2 text-xs leading-relaxed text-[#81756d]">
              The pickup console is only available to staff accounts. Ask an administrator to
              grant pickup access to your account if you expect to see this page.
            </p>
            <Link
              href="/buyer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#ef6b3b] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#d8552e]"
            >
              Return to marketplace
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="buyer-secondary min-h-screen px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/buyer/profile"
              className="inline-flex items-center gap-2 text-xs font-bold text-[#81756d] transition-colors hover:text-[#d8552e]"
            >
              ← Back to profile
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff0e9] text-[#d8552e]">
                <ClipboardList size={20} />
              </span>
              <div>
                <h1 className="text-xl font-black tracking-tight text-[#251d18] sm:text-2xl">
                  Pickup console
                </h1>
                <p className="mt-0.5 text-[11px] text-[#81756d]">
                  Log arrivals, handovers and returns for campus orders.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void loadEvents();
            }}
            disabled={refreshing || saving}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-[#e8ddd4] bg-white px-4 py-2.5 text-xs font-bold text-[#6f625a] transition-colors hover:border-[#ef6b3b]/40 hover:text-[#d8552e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {notice ? (
          <div
            className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold ${
              notice.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
            role="status"
          >
            {notice.tone === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        ) : null}

        <section className="rounded-[1.75rem] border border-[#eee4dc] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2 border-b border-[#f0e9e2] pb-4">
            <PackageCheck size={16} className="text-[#d8552e]" />
            <div>
              <h2 className="text-sm font-black text-[#251d18]">Log an event</h2>
              <p className="mt-1 text-[11px] text-[#81756d]">
                Every entry is stamped with your staff account.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-5 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2"
          >
            <label className="space-y-1">
              <span className="block font-bold text-[#6f625a]">Order reference *</span>
              <input
                type="text"
                required
                maxLength={200}
                value={form.orderRef}
                onChange={(event) => setForm((current) => ({ ...current, orderRef: event.target.value }))}
                placeholder="e.g. FSH-ABC123"
                className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 text-[#251d18] outline-none focus:border-[#ef6b3b]"
              />
            </label>

            <label className="space-y-1">
              <span className="block font-bold text-[#6f625a]">
                Delivery code{' '}
                {form.eventType === 'handed_to_buyer' ? '*' : '(optional)'}
              </span>
              <input
                type="text"
                required={form.eventType === 'handed_to_buyer'}
                maxLength={100}
                value={form.deliveryCode}
                onChange={(event) => setForm((current) => ({ ...current, deliveryCode: event.target.value }))}
                placeholder="Required for buyer handovers"
                className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 font-mono text-[#251d18] outline-none focus:border-[#ef6b3b]"
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="block font-bold text-[#6f625a]">Event type</span>
              <select
                value={form.eventType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, eventType: event.target.value as EventType }))
                }
                className="w-full rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 text-[#251d18] outline-none focus:border-[#ef6b3b]"
              >
                {EVENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="flex items-center justify-between font-bold text-[#6f625a]">
                <span>Note</span>
                <span className="font-mono text-[10px] text-[#9d9188]">{form.note.length}/500</span>
              </span>
              <textarea
                rows={3}
                maxLength={500}
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Optional detail about the handover or issue"
                className="w-full resize-y rounded-xl border border-[#e8ddd4] bg-[#faf6f2] px-4 py-3 text-[#251d18] outline-none focus:border-[#ef6b3b]"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ef6b3b] px-6 py-3.5 text-xs font-black text-white shadow-lg shadow-[#ef6b3b]/20 transition-colors hover:bg-[#d8552e] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <PackageCheck size={15} />
                )}
                {saving ? 'Saving…' : 'Log event'}
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-3 rounded-[1.75rem] border border-[#eee4dc] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e9e2] pb-4">
            <div>
              <h2 className="text-sm font-black text-[#251d18]">Recent events</h2>
              <p className="mt-1 text-[11px] text-[#81756d]">
                Newest handovers and transfers first.
              </p>
            </div>
            <span className="rounded-full bg-[#faf6f2] px-2.5 py-1 font-mono text-[10px] font-bold text-[#81756d]">
              {events.length} logged
            </span>
          </div>

          {listError ? (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>{listError}</span>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-xs font-semibold text-[#81756d]">
              <Loader2 size={15} className="animate-spin" /> Loading events…
            </div>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#81756d]">
              No pickup events logged yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-[#eee4dc] bg-[#fffdfa] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-black text-[#251d18]">
                      {item.orderRef}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${eventBadgeClass(item.eventType)}`}
                    >
                      {eventLabel(item.eventType)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] text-[#81756d] sm:grid-cols-2">
                    <p>
                      <span className="font-bold text-[#6f625a]">Time: </span>
                      <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
                    </p>
                    <p>
                      <span className="font-bold text-[#6f625a]">Delivery code: </span>
                      <span className="font-mono">{item.deliveryCode || '—'}</span>
                    </p>
                  </div>
                  <p className="mt-2 break-words text-xs text-[#6f625a]">
                    <span className="font-bold">Note: </span>
                    {item.note || '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
