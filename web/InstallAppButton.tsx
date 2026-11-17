import React from 'react';
import { Download } from 'lucide-react';
import { Alert } from './react-native';
import { installInstructions, promptAppInstall, useAppInstall } from './install';

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { installed } = useAppInstall();
  const [busy, setBusy] = React.useState(false);
  if (installed) return null;
  const install = async () => {
    setBusy(true);
    try {
      if (await promptAppInstall() === 'unavailable') Alert.alert('Install Booran Warranty', installInstructions());
    } catch {
      Alert.alert('Install Booran Warranty', installInstructions());
    } finally { setBusy(false); }
  };
  return <button className={`pwa-install${compact ? ' pwa-install-compact' : ''}`} disabled={busy} onClick={() => void install()}>
    <Download size={18} aria-hidden="true" />
    <span>{busy ? 'Opening install…' : 'Install app'}</span>
  </button>;
}
