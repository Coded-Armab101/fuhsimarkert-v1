'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import {
  clearPwaInstallPrompt,
  getPwaInstallPrompt,
  pwaInstallWasHandled,
  pwaIsInstalled,
  rememberPwaInstallChoice,
  subscribeToPwaInstallPrompt,
  type PwaInstallPromptEvent,
} from '@/utils/pwaInstall';
import { useNotifications } from '@/components/NotificationProvider';

/** Profile install card, hidden automatically inside the installed PWA. */
export default function ProfileInstallApp() {
  const { notify } = useNotifications();
  const [checked, setChecked] = useState(false);
  const [handled, setHandled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<PwaInstallPromptEvent | null>(null);

  useEffect(() => {
    const refreshState = () => {
      const complete = pwaIsInstalled() || pwaInstallWasHandled();
      setHandled(complete);
      setPromptEvent(complete ? null : getPwaInstallPrompt());
      setChecked(true);
    };

    const initialState = window.setTimeout(() => {
      refreshState();
    }, 0);

    const unsubscribe = subscribeToPwaInstallPrompt((event) => {
      if (!pwaInstallWasHandled() && !pwaIsInstalled()) setPromptEvent(event);
    });
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const appInstalled = () => {
      rememberPwaInstallChoice('installed');
      clearPwaInstallPrompt();
      setPromptEvent(null);
      setHandled(true);
    };

    displayMode.addEventListener('change', refreshState);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.clearTimeout(initialState);
      unsubscribe();
      displayMode.removeEventListener('change', refreshState);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      rememberPwaInstallChoice(choice.outcome === 'accepted' ? 'installed' : 'dismissed');
      clearPwaInstallPrompt();
      setPromptEvent(null);
      setHandled(true);
    } catch {
      clearPwaInstallPrompt();
      setPromptEvent(null);
      notify('This browser cannot install FuhsiMarket right now.', { tone: 'warning' });
    }
  };

  const dismiss = () => {
    rememberPwaInstallChoice('dismissed');
    setHandled(true);
    setPromptEvent(null);
  };

  // `beforeinstallprompt` is the browser's authoritative signal that a direct
  // install is possible. No prompt means no misleading button or manual steps.
  if (!checked || handled || !promptEvent) return null;

  return (
    <section className="relative flex items-center gap-3 rounded-2xl border border-[#eee4dc] bg-white px-4 py-3 shadow-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#faf6f2] text-[#81756d]">
        <Smartphone size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-xs font-bold text-[#251d18]">Install on this device</h2>
        <p className="truncate text-[10px] text-[#81756d]">Open FuhsiMarket directly from your home screen.</p>
      </div>
      <button
        type="button"
        onClick={install}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#e3dad1] bg-[#faf6f2] px-3 py-2 text-[11px] font-bold text-[#5f5650] transition-colors hover:border-[#ef6b3b] hover:text-[#d8552e]"
      >
        <Download size={13} /> Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Do not show install again"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#b4aaa2] hover:bg-[#faf6f2] hover:text-[#81756d]"
      >
        <X size={13} />
      </button>
    </section>
  );
}
