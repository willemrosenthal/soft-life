/**
 * The bits that differ in the iOS app (Capacitor). In a browser every function here is a no-op or
 * falls back to the web behaviour, so main.ts can call them unconditionally.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { setMirror } from './store';

export const isNative = Capacitor.isNativePlatform();

/**
 * Where shared links point. The app itself lives at capacitor://localhost, which nobody else can
 * open, so links go to the web version, which loads the pattern from the link the same way.
 */
export const PUBLIC_URL = 'https://soft-life-nt63.onrender.com/';

/**
 * Before the app starts: copy what's saved natively back into localStorage (iOS may have cleared
 * the web view's copy), then mirror every later write into native storage.
 */
export async function restoreStorage(): Promise<void> {
  if (!isNative) return;
  try {
    const { keys } = await Preferences.keys();
    for (const key of keys) {
      const { value } = await Preferences.get({ key });
      if (value !== null) {
        try { localStorage.setItem(key, value); } catch { /* the native copy is still read next launch */ }
      }
    }
  } catch {
    // Native storage unavailable: carry on with whatever localStorage has.
  }
  setMirror((key, value) => { void Preferences.set({ key, value }); });
}

/** A light tap, for starting a stroke. */
export function tapLight(): void {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Light });
}

/** A firmer bump, for things that change the whole board (soup, clear, a pattern). */
export function tapMedium(): void {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Medium });
}

/** A tick, for toggles like play and pause. */
export function tick(): void {
  if (isNative) void Haptics.selectionChanged();
}

/** Opens the iOS share sheet with the link. Returns false outside the app, so the web path runs. */
export async function nativeShare(url: string): Promise<boolean> {
  if (!isNative) return false;
  try {
    await Share.share({ title: 'BloopLife pattern', url });
  } catch {
    // Closing the share sheet is not an error worth reporting.
  }
  return true;
}

/** Dark status bar text on light themes, light text on dark ones. */
export function matchStatusBar(bg: string): void {
  if (!isNative) return;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(bg);
  if (!m) return;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255) as [number, number, number];
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
  void StatusBar.setStyle({ style: light ? Style.Light : Style.Dark });
}
