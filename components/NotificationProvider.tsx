'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react';

export type NoticeTone = 'success' | 'error' | 'warning' | 'info';

type NoticeOptions = {
  tone?: NoticeTone;
  title?: string;
  durationMs?: number;
};

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'default';
};

type Notice = Required<Pick<NoticeOptions, 'tone' | 'title'>> & {
  id: number;
  message: string;
  durationMs: number;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type NotificationContextValue = {
  notify: (message: string, options?: NoticeOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const NOTICE_STYLE: Record<NoticeTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  error: 'border-red-200 bg-red-50 text-red-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  info: 'border-sky-200 bg-sky-50 text-sky-950',
};

const NOTICE_ICON: Record<NoticeTone, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="text-emerald-600" />,
  error: <ShieldAlert size={18} className="text-red-600" />,
  warning: <AlertTriangle size={18} className="text-amber-600" />,
  info: <Info size={18} className="text-sky-600" />,
};

const DEFAULT_TITLE: Record<NoticeTone, string> = {
  success: 'Done',
  error: 'Something went wrong',
  warning: 'Please check',
  info: 'FuhsiMarket',
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const nextId = useRef(1);
  const confirmRef = useRef<PendingConfirm | null>(null);

  const dismiss = useCallback((id: number) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const notify = useCallback((message: string, options: NoticeOptions = {}) => {
    const tone = options.tone ?? 'info';
    const notice: Notice = {
      id: nextId.current++,
      message,
      tone,
      title: options.title ?? DEFAULT_TITLE[tone],
      durationMs: options.durationMs ?? (tone === 'error' ? 7000 : 4500),
    };
    setNotices((current) => [...current.slice(-3), notice]);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    // Only one decision dialog can be active. If another action opens one,
    // safely cancel the older promise instead of leaving it unresolved.
    confirmRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      confirmRef.current = next;
      setPendingConfirm(next);
    });
  }, []);

  const resolveConfirm = useCallback((value: boolean) => {
    const current = confirmRef.current;
    confirmRef.current = null;
    setPendingConfirm(null);
    current?.resolve(value);
  }, []);

  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((notice) =>
      window.setTimeout(() => dismiss(notice.id), notice.durationMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismiss, notices]);

  useEffect(() => {
    if (!pendingConfirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolveConfirm(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingConfirm, resolveConfirm]);

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-4 z-[120] mx-auto flex w-full max-w-md flex-col gap-2 px-4"
      >
        {notices.map((notice) => (
          <div
            key={notice.id}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-[0_18px_50px_rgba(37,29,24,0.18)] ${NOTICE_STYLE[notice.tone]}`}
          >
            <span className="mt-0.5 shrink-0">{NOTICE_ICON[notice.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black">{notice.title}</p>
              <p className="mt-0.5 whitespace-pre-line text-[11px] leading-relaxed opacity-80">
                {notice.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(notice.id)}
              aria-label="Dismiss notification"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-[#251d18]/65 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) resolveConfirm(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-message"
            className="w-full max-w-sm rounded-[1.75rem] border border-[#ECE5DE] bg-white p-6 text-[#251d18] shadow-2xl"
          >
            <div
              className={`grid h-12 w-12 place-items-center rounded-2xl ${
                pendingConfirm.tone === 'danger'
                  ? 'bg-red-50 text-red-600'
                  : pendingConfirm.tone === 'warning'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-[#FFF0E9] text-[#DE6437]'
              }`}
            >
              {pendingConfirm.tone === 'danger' ? (
                <ShieldAlert size={22} />
              ) : (
                <AlertTriangle size={22} />
              )}
            </div>
            <h2 id="app-confirm-title" className="mt-4 text-lg font-black">
              {pendingConfirm.title}
            </h2>
            <p id="app-confirm-message" className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#6F625A]">
              {pendingConfirm.message}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => resolveConfirm(false)}
                className="rounded-xl border border-[#E7E0D8] bg-white px-4 py-3 text-xs font-bold text-[#5F5650] transition-colors hover:bg-[#FAF6F2]"
              >
                {pendingConfirm.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                className={`rounded-xl px-4 py-3 text-xs font-bold text-white transition-colors ${
                  pendingConfirm.tone === 'danger'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-[#DE6437] hover:bg-[#C9511F]'
                }`}
              >
                {pendingConfirm.confirmLabel ?? 'Continue'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }
  return context;
}
