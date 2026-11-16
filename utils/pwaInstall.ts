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
  // iPadOS can request the desktop site and identify itself as a Mac. Touch
  // points distinguish that mode from an actual Mac so it still gets the iOS
  // Safari installation guide.
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** iOS only allows installation from Safari, not from Chrome/Firefox/Edge. */
export function isIosSafari(): boolean {
  if (!isIosBrowser()) return false;
  return /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);
}

export type InstallGuide = {
  title: string;
  intro: string;
  steps: string[];
};

/**
 * Clear, numbered install steps for browsers that do not fire
 * `beforeinstallprompt` (most importantly iOS Safari).
 */
export function installGuide(): InstallGuide {
  if (isIosBrowser()) {
    return {
      title: 'Install on iPhone or iPad',
      intro: isIosSafari()
        ? 'Safari installs FuhsiMarket to your home screen in a few taps.'
        : 'iPhone and iPad can only install web apps from Safari. Open this page in Safari first.',
      steps: isIosSafari()
        ? [
            'Tap the Share button at the bottom of Safari (the square with an arrow).',
            'Scroll down and tap “Add to Home Screen”.',
            'Confirm the name, then tap “Add”.',
            'Open FuhsiMarket from the new home-screen icon.',
          ]
        : [
            'Tap the address bar and copy this link.',
            'Open the Safari app and paste the link there.',
            'Tap Share, scroll down and choose “Add to Home Screen”.',
            'Confirm the name, then tap “Add”.',
          ],
    };
  }

  if (/android/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent)) {
    return {
      title: 'Install on Android',
      intro: 'Chrome and most Android browsers can install the app directly.',
      steps: [
        'Tap the menu button (three dots) in the browser.',
        'Choose “Install app” or “Add to Home screen”.',
        'Tap “Install” / “Add” to confirm.',
        'Open FuhsiMarket from your home screen or app drawer.',
      ],
    };
  }

  return {
    title: 'Install on this device',
    intro: 'Use your browser’s install option. If you do not see it, the app may already be installed.',
    steps: [
      'Chrome or Edge: open the browser menu (⋮ or ⋯).',
      'Choose “Install app”, “Apps → Install this site”, or “Add to Home screen”.',
      'Confirm the install prompt.',
      'Open FuhsiMarket from your desktop or app list.',
    ],
  };
}
