import { BRUSH_MAX, BRUSH_MIN } from './brush';
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
  /** Dots across the screen. */
  density: number;
  /** How many dots wide a stroke draws. */
  brushSize: number;
  /** The tool rail tucked away off the right edge. */
  railHidden: boolean;
}

export const SPEED_MIN = 1;
export const SPEED_MAX = 30;
export const DENSITY_MIN = 12;
export const DENSITY_MAX = 48;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  palette: 'meadow', style: 'goo', mode: 'colonies', rule: 'B3/S23',
  wrap: true, critters: true, smooth: true, speed: 8, density: 26, brushSize: 1, railHidden: false,
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
  const int = (x: unknown, min: number, max: number, fallback: number) => (typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max ? x : fallback);
  return {
    palette: isPaletteId(v.palette) ? v.palette : d.palette,
    style: oneOf(v.style, STYLES, d.style),
    mode: oneOf(v.mode, MODES, d.mode),
    rule: typeof v.rule === 'string' && parseRule(v.rule) ? v.rule : d.rule,
    wrap: flag(v.wrap, d.wrap),
    critters: flag(v.critters, d.critters),
    smooth: flag(v.smooth, d.smooth),
    speed: int(v.speed, SPEED_MIN, SPEED_MAX, d.speed),
    density: int(v.density, DENSITY_MIN, DENSITY_MAX, d.density),
    brushSize: int(v.brushSize, BRUSH_MIN, BRUSH_MAX, d.brushSize),
    railHidden: flag(v.railHidden, d.railHidden),
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
