import React from 'react';
import * as Native from 'react-native-web';
import { resolveMedia } from './storage';
export * from 'react-native-web';
const NativeImage = Native.Image as unknown as typeof import('react-native').Image;
const NativeLinking = (Native as any).Linking as typeof import('react-native').Linking;

type AlertButton = { text?: string; style?: string; onPress?: (value?: string) => void };
const alertQueue: { title: string; message: string; buttons: AlertButton[]; options?: any }[] = [];
let changed: (() => void) | undefined;
export const Alert = {
  alert(title: string, message = '', buttons: AlertButton[] = [{ text: 'OK' }], options?: any) {
    alertQueue.push({ title, message, buttons, options }); changed?.();
  },
};
export function AlertHost() {
  const [, update] = React.useState(0);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { changed = () => update(n => n + 1); changed(); return () => { changed = undefined; }; }, []);
  const item = alertQueue[0];
  React.useEffect(() => { closeRef.current?.focus(); }, [item]);
  if (!item) return null;
  const choose = (button: AlertButton) => { alertQueue.shift(); changed?.(); button.onPress?.(); };
  return <div className="dialog-overlay" role="presentation">
    <section className="native-alert" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-message"
      onKeyDown={event => {
        if (event.key === 'Escape' && item.options?.cancelable) choose(item.buttons.find(b => b.style === 'cancel') || {});
        if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll('button')]; const current = buttons.indexOf(document.activeElement as HTMLButtonElement); event.preventDefault(); buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
      }}>
      <h2 id="alert-title">{item.title}</h2><p id="alert-message">{item.message}</p>
      <div>{item.buttons.map((button, i) => <button key={i} ref={i === 0 ? closeRef : undefined} className={button.style || ''} onClick={() => choose(button)}>{button.text || 'OK'}</button>)}</div>
    </section>
  </div>;
}
export const Image = Object.assign(React.forwardRef<any, any>(function WebImage({ source, ...props }, ref) {
  const resolved = typeof source === 'object' && source?.uri ? { ...source, uri: resolveMedia(source.uri) } : source;
  return <Native.Image {...props} ref={ref} source={resolved} />;
}), {
  getSize: (uri: string, success: any, failure?: any) => NativeImage.getSize(resolveMedia(uri), success, failure),
  prefetch: (uri: string) => NativeImage.prefetch(resolveMedia(uri)),
  queryCache: (uris: string[]) => NativeImage.queryCache(uris.map(resolveMedia)),
});
export const Linking = new Proxy(NativeLinking, {
  get(target, property) {
    if (property === 'openURL') return (uri: string) => target.openURL(resolveMedia(uri));
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
// React Native Web has no Android permissions. Permission prompts are issued by the browser APIs.
export const PermissionsAndroid = { PERMISSIONS: {}, RESULTS: { GRANTED: 'granted' }, request: async () => 'granted' } as any;
export const Share = {
  sharedAction: 'sharedAction', dismissedAction: 'dismissedAction',
  async share(content: { title?: string; message?: string; url?: string }) {
    if (navigator.share) { await navigator.share({ title: content.title, text: content.message, url: content.url }); return { action: 'sharedAction' }; }
    await navigator.clipboard.writeText([content.message, content.url].filter(Boolean).join('\n'));
    Alert.alert('Copied', 'The details have been copied to your clipboard.');
    return { action: 'sharedAction' };
  },
};
