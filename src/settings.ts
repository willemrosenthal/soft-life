import { BRUSH_MAX, BRUSH_MIN } from './brush';
import { parseRule } from './life';
import { isPaletteId, type PaletteId } from './palettes';
import type { CellStyle, ColourMode } from './render';
import { GAPS_MAX, GAPS_MIN, MELT_MAX, MELT_MIN } from './melt';
import { STICKINESS_MAX, STICKINESS_MIN } from './slime';

/** Everything remembered between visits. The board itself isn't saved; share a link for that. */
export interface Settings {
  palette: PaletteId;
  style: CellStyle;
  mode: ColourMode;
  rule: string;
  wrap: boolean;
  critters: boolean;
  smooth: boolean;
  /** Generations per second: one of SPEED_STEPS. */
  speed: number;
  /** Dots across the screen. */
  density: number;
  /** Goo style: how readily neighbours melt together, 0 (tight) to 100 (gloopy). */
  stickiness: number;
  /** Goo style: how readily different colours join, 0 (never) to 100. */
  melt: number;
  /** Goo style, with melt: the holes where mixed colours meet, 0 (closed) to 100 (wide). */
  gaps: number;
  /** How many dots wide a stroke draws. */
  brushSize: number;
  /** The tool rail tucked away off the right edge. */
  railHidden: boolean;
}

export const SPEED_MIN = 1;
export const SPEED_MAX = 30;
/** Speeds below one a second, slowest first: a step every 3s, 2s and 1.5s. */
export const SLOW_SPEEDS: readonly number[] = [1 / 3, 1 / 2, 2 / 3];
/** Every speed the slider offers, slowest first; the slider's value is an index into this. */
export const SPEED_STEPS: readonly number[] = [
  ...SLOW_SPEEDS,
  ...Array.from({ length: SPEED_MAX - SPEED_MIN + 1 }, (_, i) => SPEED_MIN + i),
];
export const DENSITY_MIN = 12;
export const DENSITY_MAX = 48;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  palette: 'meadow', style: 'goo', mode: 'colonies', rule: 'B3/S23',
  wrap: true, critters: true, smooth: true, speed: 8, density: 26, stickiness: 50, melt: 75, gaps: 50, brushSize: 1, railHidden: false,
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
    speed: SPEED_STEPS.includes(v.speed as number) ? (v.speed as number) : d.speed,
    density: int(v.density, DENSITY_MIN, DENSITY_MAX, d.density),
    stickiness: int(v.stickiness, STICKINESS_MIN, STICKINESS_MAX, d.stickiness),
    melt: int(v.melt, MELT_MIN, MELT_MAX, d.melt),
    gaps: int(v.gaps, GAPS_MIN, GAPS_MAX, d.gaps),
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
