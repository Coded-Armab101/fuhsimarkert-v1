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

/**
 * Profile install card.
 *
 * `beforeinstallprompt` only fires in Chromium when the browser decides the app
 * is installable. iOS Safari/Chrome and Firefox never fire it, so hiding the
 * card until that event arrives made the install button invisible for most
 * users. The card is now always shown (unless installed/dismissed) and falls
 * back to plain-language manual instructions when no native prompt exists.
 */
export default function ProfileInstallApp() {
  const { notify } = useNotifications();
  const [checked, setChecked] = useState(false);
  const [handled, setHandled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<PwaInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    const refreshState = () => {
      const complete = pwaIsInstalled() || pwaInstallWasHandled();
      setHandled(complete);
      setPromptEvent(complete ? null : getPwaInstallPrompt());
      setChecked(true);
    };

    const initialState = window.setTimeout(() => {
      refreshState();
      // Deferred so the server and first client render match during hydration.
      const iosNavigator = navigator as Navigator & { standalone?: boolean };
      setIsApple(
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
          iosNavigator.standalone === true,
      );
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
    if (!promptEvent) {
      setShowHelp(true);
      return;
    }

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
      setShowHelp(true);
      notify('This browser cannot install FuhsiMarket right now. Use the manual steps instead.', { tone: 'warning' });
    }
  };

  const dismiss = () => {
    rememberPwaInstallChoice('dismissed');
    setHandled(true);
    setPromptEvent(null);
  };

  if (!checked || handled) return null;

  const instructions = isApple
    ? 'Tap the Share button, then choose “Add to Home Screen”.'
    : 'Open your browser menu and choose “Install app” or “Add to Home screen”.';

  return (
    <section className="relative flex flex-wrap items-center gap-3 rounded-2xl border border-[#eee4dc] bg-white px-4 py-3 shadow-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#faf6f2] text-[#81756d]">
        <Smartphone size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-xs font-bold text-[#251d18]">Install on this device</h2>
        <p className="truncate text-[10px] text-[#81756d]">Open FuhsiMarket directly from your home screen.</p>
        {showHelp && (
          <p className="mt-1 text-[10px] leading-4 text-[#5f5650]">{instructions}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#e3dad1] bg-[#faf6f2] px-3 py-2 text-[11px] font-bold text-[#5f5650] transition-colors hover:border-[#ef6b3b] hover:text-[#d8552e]"
      >
        <Download size={13} /> {promptEvent ? 'Install' : showHelp ? 'Hide steps' : 'How to install'}
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
