'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { createClient } from '@/utils/supabase';
import {
  capturePwaInstallPrompt,
  clearPwaInstallPrompt,
  getPwaInstallPrompt,
  pwaIsInstalled,
  subscribeToPwaInstallPrompt,
  type PwaInstallPromptEvent,
} from '@/utils/pwaInstall';

export default function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState<PwaInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
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
      setInstalled(pwaIsInstalled());
      setChecked(true);
      setPromptEvent(getPwaInstallPrompt());
    }, 0);

    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));

    const promptHandler = (event: Event) => capturePwaInstallPrompt(event);
    const unsubscribe = subscribeToPwaInstallPrompt(setPromptEvent);
    const appInstalled = () => {
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
    if (!promptEvent) {
      setShowInstallHelp(true);
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    clearPwaInstallPrompt();
    if (choice.outcome === 'accepted') setInstalled(true);
    else setDismissed(true);
  };

  if (!checked || installed || signedIn !== false) return null;

  if (dismissed || (!promptEvent && !showInstallHelp)) {
    return (
      <button
        onClick={() => {
          setDismissed(false);
          setShowInstallHelp(true);
        }}
        className="fixed right-4 top-4 z-[70] rounded-full bg-[#FDF0EA] p-2 text-[#DE6437] shadow-sm"
        aria-label="How to install FuhsiMarket"
      >
        <Download size={17} />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-sm rounded-[1.5rem] bg-[#2C2C2C] p-4 text-white shadow-2xl">
      <button
        onClick={() => setDismissed(true)}
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
        {promptEvent ? 'Install app' : 'How to install'}
      </button>
      {showInstallHelp && !promptEvent && (
        <p className="mt-3 text-[11px] leading-5 text-white/75">
          On iPhone, open Safari, tap Share, then “Add to Home Screen”. On Android or desktop, open the browser menu and choose “Install app”.
        </p>
      )}
    </div>
  );
}
