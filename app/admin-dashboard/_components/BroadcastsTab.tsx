'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useNotifications } from '@/components/NotificationProvider';

type Audience = 'all' | 'buyers' | 'sellers';
type BroadcastStatus = 'draft' | 'scheduled' | 'live' | 'ended';

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
  dismissals: number;
  status: BroadcastStatus;
  live: boolean;
};

const STATUS_STYLE: Record<BroadcastStatus, string> = {
  live: 'border-emerald-800 bg-emerald-950/60 text-emerald-300',
  scheduled: 'border-blue-800 bg-blue-950/60 text-blue-300',
  ended: 'border-neutral-700 bg-neutral-900 text-neutral-400',
  draft: 'border-amber-800 bg-amber-950/60 text-amber-300',
};

function localDateTime(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function audienceLabel(audience: Audience): string {
  if (audience === 'buyers') return 'Buyers only';
  if (audience === 'sellers') return 'Sellers only';
  return 'All users';
}

function freshStart(): string {
  return localDateTime(new Date());
}

export default function BroadcastsTab({ refreshToken = 0 }: { refreshToken?: number }) {
  const { confirm } = useNotifications();
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [startsAt, setStartsAt] = useState(freshStart);
  const [endsAt, setEndsAt] = useState('');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/broadcasts', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load announcements.');
      setRows((data.broadcasts || []) as BroadcastRow[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load announcements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshToken]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setMessage('');
    setAudience('all');
    setStartsAt(freshStart());
    setEndsAt('');
    setIsActive(true);
  };

  const edit = (row: BroadcastRow) => {
    setEditingId(row.id);
    setTitle(row.title);
    setMessage(row.message);
    setAudience(row.audience);
    setStartsAt(localDateTime(row.starts_at));
    setEndsAt(row.ends_at ? localDateTime(row.ends_at) : '');
    setIsActive(row.is_active);
    setError(null);
    setSuccess(null);
    document.getElementById('broadcast-editor')?.scrollIntoView({ behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const start = new Date(startsAt);
    const end = endsAt ? new Date(endsAt) : null;
    if (!startsAt || Number.isNaN(start.getTime())) {
      setError('Choose a valid start time.');
      return;
    }
    if (end && (Number.isNaN(end.getTime()) || end <= start)) {
      setError('The end time must be after the start time.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/broadcasts', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          title,
          message,
          audience,
          starts_at: start.toISOString(),
          ends_at: end?.toISOString() ?? null,
          is_active: isActive,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the announcement.');
      setSuccess(editingId ? 'Announcement updated.' : 'Announcement created.');
      resetForm();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the announcement.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: BroadcastRow) => {
    setActingId(row.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/admin/broadcasts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not update the announcement.');
      setSuccess(row.is_active ? 'Announcement paused.' : 'Announcement activated.');
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Could not update the announcement.');
    } finally {
      setActingId(null);
    }
  };

  const remove = async (row: BroadcastRow) => {
    const accepted = await confirm({
      title: 'Delete announcement?',
      message: `Delete “${row.title}”? This cannot be undone.`,
      confirmLabel: 'Delete announcement',
      tone: 'danger',
    });
    if (!accepted) return;
    setActingId(row.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/broadcasts?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not delete the announcement.');
      if (editingId === row.id) resetForm();
      setRows((current) => current.filter((item) => item.id !== row.id));
      setSuccess('Announcement deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the announcement.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <form
        id="broadcast-editor"
        onSubmit={submit}
        className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Megaphone size={16} className="text-[#FF9B73]" />
              {editingId ? 'Edit announcement' : 'Broadcast an announcement'}
            </div>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-neutral-500">
              It appears as a dismissible modal when matching users enter the app. Times below use your device&apos;s local time.
            </p>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 rounded-xl border border-neutral-700 px-3 py-2 text-[11px] font-bold text-neutral-300 hover:text-white"
            >
              <X size={13} /> Cancel edit
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-[11px] font-bold text-neutral-300">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
              placeholder="e.g. Marketplace maintenance tonight"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-[#DE6437]"
            />
          </label>

          <label className="space-y-1.5 sm:col-span-2">
            <span className="flex items-center justify-between text-[11px] font-bold text-neutral-300">
              Message <span className="font-mono font-normal text-neutral-600">{message.length}/2000</span>
            </span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              maxLength={2000}
              rows={5}
              placeholder="Tell users what is happening and what they need to do."
              className="w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm leading-6 text-white outline-none placeholder:text-neutral-600 focus:border-[#DE6437]"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-bold text-neutral-300">Audience</span>
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value as Audience)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-white outline-none focus:border-[#DE6437]"
            >
              <option value="all">All users</option>
              <option value="buyers">Buyers only</option>
              <option value="sellers">Sellers only</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 accent-[#DE6437]"
            />
            <span>
              <span className="block text-[11px] font-bold text-neutral-200">Active</span>
              <span className="block text-[10px] text-neutral-500">Turn off to save it without showing users.</span>
            </span>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-bold text-neutral-300">Starts</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-white outline-none focus:border-[#DE6437]"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-bold text-neutral-300">Ends (optional)</span>
            <input
              type="datetime-local"
              value={endsAt}
              min={startsAt || undefined}
              onChange={(event) => setEndsAt(event.target.value)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 py-3 text-sm text-white outline-none focus:border-[#DE6437]"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#DE6437] px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-[#C9511F] disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : editingId ? <CheckCircle2 size={14} /> : <Send size={14} />}
          {saving ? 'Saving…' : editingId ? 'Save changes' : isActive ? 'Schedule broadcast' : 'Save draft'}
        </button>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2.5 font-mono text-[11px] text-red-400">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-3 py-2.5 font-mono text-[11px] text-emerald-300">{success}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-sm font-black text-white">Announcements</h2>
            <p className="text-[10px] font-mono text-neutral-500">Newest first · users dismiss each message once</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="text-[11px] font-bold text-[#FF9B73] disabled:opacity-50">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-14"><Loader2 className="animate-spin text-neutral-600" size={22} /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-10 text-center">
            <Megaphone className="mx-auto text-neutral-700" size={30} />
            <p className="mt-3 text-xs font-bold text-neutral-300">No announcements yet</p>
            <p className="mt-1 text-[11px] text-neutral-600">Create one above when users need an update.</p>
          </div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{row.title}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono font-bold uppercase ${STATUS_STYLE[row.status]}`}>
                      {row.status}
                    </span>
                    <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[9px] font-mono text-neutral-400">
                      {audienceLabel(row.audience)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-xs leading-5 text-neutral-400">{row.message}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-neutral-600">
                    <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> Starts {new Date(row.starts_at).toLocaleString()}</span>
                    <span>{row.ends_at ? `Ends ${new Date(row.ends_at).toLocaleString()}` : 'No end time'}</span>
                    <span>{row.dismissals} dismissal{row.dismissals === 1 ? '' : 's'}</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => edit(row)}
                    disabled={actingId === row.id}
                    className="inline-flex items-center gap-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-[10px] font-bold text-neutral-300 hover:text-white disabled:opacity-50"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(row)}
                    disabled={actingId === row.id}
                    className="inline-flex items-center gap-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-[10px] font-bold text-neutral-300 hover:text-white disabled:opacity-50"
                  >
                    {actingId === row.id ? <Loader2 size={12} className="animate-spin" /> : row.is_active ? <Pause size={12} /> : <Play size={12} />}
                    {row.is_active ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    disabled={actingId === row.id}
                    className="inline-flex items-center gap-1 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-[10px] font-bold text-red-400 hover:bg-red-950/60 disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
