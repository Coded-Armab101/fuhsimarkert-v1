'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function PwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallEvent); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed || (!promptEvent && !showIosHelp)) return <button onClick={() => setShowIosHelp(true)} className="fixed right-4 top-4 z-[70] rounded-full bg-[#fff0e9] p-2 text-[#d8552e] shadow-sm" aria-label="How to install FuhsiMarket"><Download size={17} /></button>;
  const install = async () => { if (!promptEvent) { setShowIosHelp(true); return; } await promptEvent.prompt(); const choice = await promptEvent.userChoice; if (choice.outcome === 'accepted') setPromptEvent(null); else setDismissed(true); };
  return <div className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-sm rounded-[1.5rem] bg-[#2e2520] p-4 text-white shadow-2xl"><button onClick={() => setDismissed(true)} className="absolute right-3 top-3 text-white/60" aria-label="Close install message"><X size={16}/></button><p className="text-sm font-bold">Install FuhsiMarket</p><p className="mt-1 pr-5 text-xs leading-5 text-white/75">Open the market faster from your home screen.</p><button onClick={install} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ef6b3b] py-2.5 text-xs font-bold"><Download size={15}/>{promptEvent ? 'Install app' : 'How to install on iPhone'}</button>{showIosHelp && !promptEvent && <p className="mt-3 text-[11px] leading-5 text-white/75">In Safari, tap Share, then choose “Add to Home Screen”.</p>}</div>;
}
