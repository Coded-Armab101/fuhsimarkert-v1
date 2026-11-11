'use client';

import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import {
  currentPushState,
  enablePushNotifications,
  registerServiceWorker,
  type PushState,
} from '@/utils/push-client';

type Props = {
  /** `card` is the full settings panel, `inline` fits inside a dropdown. */
  variant?: 'card' | 'inline';
};

const BUTTON_LABEL: Partial<Record<PushState, string>> = {
  default: 'Enable order alerts',
  granted: 'Enable order alerts',
};

function stateCopy(state: PushState): { title: string; detail: string; tone: 'ok' | 'warn' | 'muted' } {
  switch (state) {
    case 'checking':
      return { title: 'Checking this device…', detail: 'Seeing whether phone alerts can be turned on.', tone: 'muted' };
    case 'unsupported':
      return {
        title: 'Phone alerts are not supported here',
        detail: 'On iPhone, first add FuhsiMarket to your Home Screen (iOS 16.4 or newer), then open it from there.',
        tone: 'warn',
      };
    case 'unconfigured':
      return {
        title: 'Phone alerts are not set up yet',
        detail: 'The app owner still needs to add the push notification keys on the server.',
        tone: 'warn',
      };
    case 'denied':
      return {
        title: 'Notifications are blocked',
        detail: 'Allow notifications for FuhsiMarket in your browser or phone settings, then try again.',
        tone: 'warn',
      };
    case 'subscribed':
      return {
        title: 'Order alerts are on',
        detail: 'New paid orders will pop up on this phone, even when the app is closed.',
        tone: 'ok',
      };
    case 'error':
      return {
        title: 'Could not turn on alerts',
        detail: 'Check your connection and try again.',
        tone: 'warn',
      };
    case 'granted':
      return {
        title: 'Almost there',
        detail: 'Permission is allowed — tap below to finish linking this device.',
        tone: 'muted',
      };
    default:
      return {
        title: 'Get order alerts on your phone',
        detail: 'Install FuhsiMarket, then allow notifications so a new paid order reaches you immediately.',
        tone: 'muted',
      };
  }
}

export default function PushNotificationToggle({ variant = 'card' }: Props) {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await registerServiceWorker();
      const next = await currentPushState();
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    setState('checking');
    const next = await enablePushNotifications();
    setState(next);
    setBusy(false);
  };

  const copy = stateCopy(state);
  const canEnable = state === 'default' || state === 'granted';
  const isLoading = state === 'checking' || busy;

  const icon = isLoading ? (
    <Loader2 size={18} className="animate-spin" />
  ) : copy.tone === 'ok' ? (
    <CheckCircle2 size={18} />
  ) : copy.tone === 'warn' ? (
    <TriangleAlert size={18} />
  ) : (
    <BellRing size={18} />
  );

  const iconTone =
    copy.tone === 'ok'
      ? 'bg-[#ecfdf5] border-[#c7f0dd] text-[#17805b]'
      : copy.tone === 'warn'
        ? 'bg-[#fff7e8] border-[#f2e0b8] text-[#8a650f]'
        : 'bg-[#fff0e9] border-[#ffe0cf] text-[#ef6b3b]';

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 border-t border-[#f0e9e2] px-4 py-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${iconTone}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-[#251d18]">{copy.title}</p>
          {canEnable ? (
            <button
              onClick={enable}
              disabled={busy}
              className="mt-0.5 text-[10px] font-bold text-[#d8552e] underline-offset-2 hover:underline disabled:opacity-60"
            >
              {busy ? 'Turning on…' : 'Turn on phone alerts'}
            </button>
          ) : (
            <p className="truncate text-[10px] text-[#81756d]">{copy.detail}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="seller-secondary bg-white border border-[#eee4dc] rounded-[1.75rem] p-6 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${iconTone}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#251d18]">{copy.title}</h2>
          <p className="mt-1 text-xs text-[#81756d]">{copy.detail}</p>
        </div>
      </div>

      {canEnable ? (
        <button
          onClick={enable}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 bg-[#ef6b3b] hover:bg-[#d8552e] disabled:opacity-60 text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all cursor-pointer shadow-sm"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />}
          {busy ? 'Turning on…' : BUTTON_LABEL[state] || 'Enable order alerts'}
        </button>
      ) : null}
    </div>
  );
}
