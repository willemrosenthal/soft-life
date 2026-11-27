import { parseRule } from './life';
import { isPaletteId, type PaletteId } from './palettes';
import type { CellStyle, ColourMode } from './render';

/** Everything remembered between visits. The board itself isn't saved; share a link for that. */
export interface Settings {
  palette: PaletteId;
  style: CellStyle;
  mode: ColourMode;
  rule: string;
  wrap: boolean;
  critters: boolean;
  smooth: boolean;
  /** Generations per second. */
  speed: number;
  /** Controls folded away for a bigger board. */
  dockHidden: boolean;
}

export const SPEED_MIN = 1;
export const SPEED_MAX = 30;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  palette: 'meadow', style: 'goo', mode: 'colonies', rule: 'B3/S23',
  wrap: true, critters: true, smooth: true, speed: 8, dockHidden: false,
};

const STYLES: readonly CellStyle[] = ['goo', 'dots', 'pixels'];
const MODES: readonly ColourMode[] = ['colonies', 'solo', 'age'];
const KEY = 'softlife:settings';

/** Saved data may be from an older version or damaged: anything unusable falls back to its default. */
export function parseSettings(value: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (typeof value !== 'object' || value === null) return { ...d };
  const v = value as Record<string, unknown>;
  const flag = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);
  const oneOf = <T extends string>(x: unknown, options: readonly T[], fallback: T) => (options.includes(x as T) ? (x as T) : fallback);
  return {
    palette: isPaletteId(v.palette) ? v.palette : d.palette,
    style: oneOf(v.style, STYLES, d.style),
    mode: oneOf(v.mode, MODES, d.mode),
    rule: typeof v.rule === 'string' && parseRule(v.rule) ? v.rule : d.rule,
    wrap: flag(v.wrap, d.wrap),
    critters: flag(v.critters, d.critters),
    smooth: flag(v.smooth, d.smooth),
    speed: typeof v.speed === 'number' && Number.isInteger(v.speed) && v.speed >= SPEED_MIN && v.speed <= SPEED_MAX ? v.speed : d.speed,
    dockHidden: flag(v.dockHidden, d.dockHidden),
  };
}

/** Storage can be unavailable (private windows, blocked site data): then settings just aren't kept. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return parseSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not kept; nothing else to do.
  }
}
