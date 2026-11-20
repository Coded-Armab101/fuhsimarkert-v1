'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
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

/**
 * Global install banner. It used to be hidden for signed-in users AND until a
 * `beforeinstallprompt` event arrived, which meant most buyers never saw it.
 * Now every visitor gets the banner; Chromium gets a one-tap install, while
 * iOS/Firefox get simple manual steps.
 */
export default function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState<PwaInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isApple, setIsApple] = useState(false);

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
      // Deferred so the server and first client render match during hydration.
      const iosNavigator = navigator as Navigator & { standalone?: boolean };
      setIsApple(
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
          iosNavigator.standalone === true,
      );
    }, 0);

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
    if (!promptEvent) {
      setShowHelp(true);
      return;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      clearPwaInstallPrompt();
      rememberPwaInstallChoice(choice.outcome === 'accepted' ? 'installed' : 'dismissed');
      if (choice.outcome === 'accepted') setInstalled(true);
      else setDismissed(true);
    } catch {
      clearPwaInstallPrompt();
      setShowHelp(true);
    }
  };

  const dismiss = () => {
    rememberPwaInstallChoice('dismissed');
    setDismissed(true);
  };

  if (!checked || installed || dismissed) return null;

  const instructions = isApple
    ? 'Tap Share, then “Add to Home Screen”.'
    : 'Open your browser menu and choose “Install app” or “Add to Home screen”.';

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
      {showHelp && <p className="mt-2 text-[11px] leading-5 text-white/90">{instructions}</p>}
      <button
        onClick={() => void install()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#DE6437] py-2.5 text-xs font-bold transition-colors hover:bg-[#C9511F]"
      >
        <Download size={15} />
        {promptEvent ? 'Install app' : showHelp ? 'Hide steps' : 'How to install'}
      </button>
    </div>
  );
}
