'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';

type Broadcast = {
  id: string;
  title: string;
  message: string;
  audience: 'all' | 'buyers' | 'sellers';
  starts_at: string;
  ends_at: string | null;
};

const SESSION_PREFIX = 'fuhsi_broadcast_seen_';

/**
 * Shows admin announcements as a dismissible modal when a buyer/seller enters
 * the app. Dismissals are stored server-side so an announcement is not repeated
 * across devices/reloads.
 */
export default function BroadcastModal() {
  const [queue, setQueue] = useState<Broadcast[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/broadcasts/active', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const rows = (data.broadcasts || []) as Broadcast[];
        // Ignore anything already dismissed in this browser session, even if
        // the server dismissal write failed earlier.
        const visible = rows.filter((row) => {
          try {
            return window.sessionStorage.getItem(`${SESSION_PREFIX}${row.id}`) !== '1';
          } catch {
            return true;
          }
        });
        if (!cancelled) setQueue(visible);
      } catch {
        // Announcements are non-critical; stay silent on failure.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    // Announcements take priority over the first-run guide on app entry. Keep a
    // light one-minute refresh so a scheduled message can appear for someone
    // who already had the app open when its start time arrived.
    const timer = window.setTimeout(() => void load(), 250);
    const interval = window.setInterval(() => void load(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const dismiss = useCallback(async () => {
    const current = queue[0];
    if (!current || dismissing) return;

    try {
      window.sessionStorage.setItem(`${SESSION_PREFIX}${current.id}`, '1');
    } catch {
      // Private mode can block storage; the modal still closes.
    }

    setDismissing(true);
    setQueue((rows) => rows.slice(1));

    try {
      await fetch('/api/broadcasts/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcastId: current.id }),
      });
    } catch {
      // Best effort: it shows again on the next device, which is acceptable.
    } finally {
      setDismissing(false);
    }
  }, [dismissing, queue]);

  if (!loaded || queue.length === 0) return null;

  const current = queue[0];

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="broadcast-title"
        className="w-full max-w-md overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="flex items-start gap-3 bg-gradient-to-br from-[#ff9a55] via-[#f47a3f] to-[#d9552f] px-5 pb-4 pt-5 text-white">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/20">
            <Megaphone size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/80">
              FuhsiMarket update
            </p>
            <h2 id="broadcast-title" className="mt-0.5 text-lg font-black leading-tight">
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            aria-label="Dismiss announcement"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="whitespace-pre-line text-sm leading-6 text-[#5f5650]">{current.message}</p>
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            className="mt-5 w-full rounded-2xl bg-[#ef6b3b] py-3 text-sm font-bold text-white transition-colors hover:bg-[#d8552e] disabled:opacity-60"
          >
            Got it
          </button>
          {queue.length > 1 && (
            <p className="mt-2 text-center text-[10px] font-mono text-[#9d9188]">
              {queue.length - 1} more announcement{queue.length - 1 === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
