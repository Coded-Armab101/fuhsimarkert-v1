export type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PromptListener = (prompt: PwaInstallPromptEvent | null) => void;

let deferredPrompt: PwaInstallPromptEvent | null = null;
const listeners = new Set<PromptListener>();
const INSTALL_CHOICE_KEY = 'fuhsi_pwa_install_choice_v1';

export type PwaInstallChoice = 'installed' | 'dismissed';

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

/** Remember that this browser already completed or declined the one-time CTA. */
export function rememberPwaInstallChoice(choice: PwaInstallChoice) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INSTALL_CHOICE_KEY, choice);
  } catch {
    // Private browsing can block storage. Installed display-mode detection still
    // prevents the CTA inside the PWA itself.
  }
}

export function pwaInstallWasHandled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INSTALL_CHOICE_KEY) !== null;
  } catch {
    return false;
  }
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
