import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const displayMode = window.matchMedia('(display-mode: standalone)');
const isStandalone = () => displayMode.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
let state = { installed: isStandalone(), prompt: null as InstallPromptEvent | null };
const subscribers = new Set<() => void>();
function update(next: typeof state) {
  state = next;
  subscribers.forEach(listener => listener());
}

// Capture this before asynchronous storage initialization and React mounting.
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  update({ installed: isStandalone(), prompt: event as InstallPromptEvent });
});
window.addEventListener('appinstalled', () => update({ installed: true, prompt: null }));
displayMode.addEventListener('change', () => update({ ...state, installed: isStandalone() }));

export function useAppInstall() {
  return useSyncExternalStore(listener => {
    subscribers.add(listener);
    return () => { subscribers.delete(listener); };
  }, () => state);
}

export async function promptAppInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = state.prompt;
  if (!prompt) return 'unavailable';
  // Browser install events can only be used once, even when dismissed.
  update({ ...state, prompt: null });
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') update({ installed: true, prompt: null });
  return outcome;
}

export function installInstructions() {
  if (!window.isSecureContext) return 'Open the HTTPS address of this app to install it on your device.';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return 'Open this app in Safari.\n\n1. Tap Share in the browser toolbar.\n2. Choose Add to Home Screen.\n3. Keep Open as Web App enabled if shown, then tap Add.\n\nLaunch Booran Warranty from your Home Screen.';
  if (/Android/.test(navigator.userAgent)) return 'Open the browser menu (⋮), then choose Install app or Add to Home screen and confirm.\n\nIf that option is missing, open this app in Chrome and try again.';
  if (/Mac/.test(navigator.platform) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent)) return 'In Safari, choose File → Add to Dock, then confirm Add.\n\nYou can also open this app in Chrome or Edge and use the install icon in the address bar.';
  return 'Use the install icon in the browser address bar, or open the browser menu and choose Install Booran Warranty.\n\nIf that option is missing, open this app in Chrome or Edge and try again.';
}
