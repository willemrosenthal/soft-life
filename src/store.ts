/**
 * Saved data (settings, themes, rules) goes through here. In the browser it's plain localStorage.
 * In the iOS app, localStorage lives in the web view and iOS may clear it when space is short, so
 * native.ts also mirrors every write into native storage and copies it back before the app starts.
 */

type Mirror = (key: string, value: string) => void;
let mirror: Mirror | null = null;

/** Native code registers here to receive a copy of every write. */
export function setMirror(m: Mirror): void {
  mirror = m;
}

/** Throws if storage is unavailable; callers already handle that. */
export function readItem(key: string): string | null {
  return localStorage.getItem(key);
}

export function writeItem(key: string, value: string): void {
  // The mirror goes first, so a full or blocked localStorage doesn't stop the native copy.
  mirror?.(key, value);
  localStorage.setItem(key, value);
}
