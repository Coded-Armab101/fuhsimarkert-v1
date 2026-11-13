'use client';

import { useEffect, useState } from 'react';
import { Download, Share2, Smartphone, X } from 'lucide-react';
import {
  clearPwaInstallPrompt,
  getPwaInstallPrompt,
  isIosBrowser,
  pwaIsInstalled,
  subscribeToPwaInstallPrompt,
  type PwaInstallPromptEvent,
} from '@/utils/pwaInstall';

/** Profile install card, hidden automatically inside the installed PWA. */
export default function ProfileInstallApp() {
  const [checked, setChecked] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<PwaInstallPromptEvent | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const refreshInstalledState = () => {
      setInstalled(pwaIsInstalled());
      setChecked(true);
    };

    const initialState = window.setTimeout(() => {
      refreshInstalledState();
      setIos(isIosBrowser());
      setPromptEvent(getPwaInstallPrompt());
    }, 0);

    const unsubscribe = subscribeToPwaInstallPrompt(setPromptEvent);
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const appInstalled = () => {
      clearPwaInstallPrompt();
      setInstalled(true);
    };

    displayMode.addEventListener('change', refreshInstalledState);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.clearTimeout(initialState);
      unsubscribe();
      displayMode.removeEventListener('change', refreshInstalledState);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) {
      setShowSteps(true);
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    clearPwaInstallPrompt();
    setPromptEvent(null);
    if (choice.outcome === 'accepted') setInstalled(true);
    else setShowSteps(true);
  };

  if (!checked || installed) return null;

  return (
    <section className="rounded-[1.75rem] border border-[#ffd9c4] bg-gradient-to-br from-[#fff7f2] to-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ef6b3b] text-white shadow-sm">
          <Smartphone size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-[#251d18]">Install FuhsiMarket</h2>
          <p className="mt-1 text-[11px] leading-5 text-[#81756d]">
            Add the marketplace to your home screen for faster access, offline fallback and phone notifications.
          </p>
          <button
            type="button"
            onClick={install}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#ef6b3b] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#d8552e]"
          >
            <Download size={15} />
            {promptEvent ? 'Install app' : 'Show install steps'}
          </button>
        </div>
      </div>

      {showSteps && !promptEvent && (
        <div className="relative mt-4 rounded-2xl border border-[#eee4dc] bg-white p-4 pr-9 text-[11px] leading-5 text-[#5f5650]">
          <button
            type="button"
            onClick={() => setShowSteps(false)}
            className="absolute right-3 top-3 text-[#9d9188]"
            aria-label="Hide install instructions"
          >
            <X size={14} />
          </button>
          <p className="flex items-center gap-1.5 font-bold text-[#251d18]">
            <Share2 size={14} className="text-[#ef6b3b]" />
            {ios ? 'Install on iPhone or iPad' : 'Install from your browser'}
          </p>
          <p className="mt-1">
            {ios
              ? 'Open this page in Safari, tap Share, scroll down, then choose “Add to Home Screen” and confirm Add.'
              : 'Open your browser menu and choose “Install app” or “Add to Home screen”. Chrome may also show an install icon in the address bar.'}
          </p>
        </div>
      )}
    </section>
  );
}
