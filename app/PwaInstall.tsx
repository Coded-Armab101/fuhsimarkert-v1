'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import {
  capturePwaInstallPrompt,
  clearPwaInstallPrompt,
  getPwaInstallPrompt,
  pwaInstallWasHandled,
  pwaIsInstalled,
  rememberPwaInstallChoice,
  subscribeToPwaInstallPrompt,
  type PwaInstallPromptEvent,
} from '@/utils/pwaInstall';

export default function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState<PwaInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Register unconditionally so offline browsing works even when the install
    // prompt is dismissed or the user is signed in.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('[pwa] service worker registration failed', err);
      });
    }

    const initialState = window.setTimeout(() => {
      setInstalled(pwaIsInstalled() || pwaInstallWasHandled());
      setChecked(true);
      setPromptEvent(getPwaInstallPrompt());
    }, 0);

    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));

    const promptHandler = (event: Event) => capturePwaInstallPrompt(event);
    const unsubscribe = subscribeToPwaInstallPrompt(setPromptEvent);
    const appInstalled = () => {
      rememberPwaInstallChoice('installed');
      clearPwaInstallPrompt();
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', promptHandler);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.clearTimeout(initialState);
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', promptHandler);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      clearPwaInstallPrompt();
      rememberPwaInstallChoice(choice.outcome === 'accepted' ? 'installed' : 'dismissed');
      if (choice.outcome === 'accepted') setInstalled(true);
      else setDismissed(true);
    } catch {
      clearPwaInstallPrompt();
      rememberPwaInstallChoice('dismissed');
      setDismissed(true);
    }
  };

  if (!checked || installed || dismissed || signedIn !== false || !promptEvent) return null;

  const dismiss = () => {
    rememberPwaInstallChoice('dismissed');
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-sm rounded-[1.5rem] bg-[#2C2C2C] p-4 text-white shadow-2xl">
      <button
        onClick={dismiss}
        className="absolute right-3 top-3 text-white/60"
        aria-label="Close install message"
      >
        <X size={16} />
      </button>
      <p className="text-sm font-bold">Install FuhsiMarket</p>
      <p className="mt-1 pr-5 text-xs leading-5 text-white/75">
        Open the market faster from your home screen.
      </p>
      <button
        onClick={install}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#DE6437] py-2.5 text-xs font-bold transition-colors hover:bg-[#C9511F]"
      >
        <Download size={15} />
        Install app
      </button>
    </div>
  );
}
