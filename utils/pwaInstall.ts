export type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PromptListener = (prompt: PwaInstallPromptEvent | null) => void;

let deferredPrompt: PwaInstallPromptEvent | null = null;
const listeners = new Set<PromptListener>();

function emit() {
  for (const listener of listeners) listener(deferredPrompt);
}

export function capturePwaInstallPrompt(event: Event) {
  event.preventDefault();
  deferredPrompt = event as PwaInstallPromptEvent;
  emit();
}

export function getPwaInstallPrompt(): PwaInstallPromptEvent | null {
  return deferredPrompt;
}

export function clearPwaInstallPrompt() {
  deferredPrompt = null;
  emit();
}

export function subscribeToPwaInstallPrompt(listener: PromptListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pwaIsInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    iosNavigator.standalone === true
  );
}

export function isIosBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
