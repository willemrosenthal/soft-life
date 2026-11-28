import { BRUSH_MAX, BRUSH_MIN, stepForWidth } from "./brush";
import { readItem, writeItem } from "./store";
import { ABUNDANCE_MAX, ABUNDANCE_MIN, DEFAULT_ABUNDANCE } from "./critters";
import { parseRule } from "./life";
import type { CellStyle, ColourMode } from "./render";
import { isThemeKey } from "./themes";
import { GAPS_MAX, GAPS_MIN, MELT_MAX, MELT_MIN } from "./melt";
import {
  DIAGONALS_MAX,
  DIAGONALS_MIN,
  STICKINESS_MAX,
  STICKINESS_MIN,
} from "./slime";

/** Everything remembered between visits. The board itself isn't saved; share a link for that. */
export interface Settings {
  /** A built-in theme's id, or "custom:<id>" for one the player made (see themes.ts). */
  palette: string;
  style: CellStyle;
  mode: ColourMode;
  rule: string;
  wrap: boolean;
  critters: boolean;
  /** How readily critters appear, 0 (only very stable cells, rarely) to 100 (almost anything that lives a few generations). */
  critterAbundance: number;
  smooth: boolean;
  /** Generations per second: one of SPEED_STEPS. */
  speed: number;
  /** The Rule lab preview's generations per second: one of SPEED_STEPS. */
  labSpeed: number;
  /** Dots across the screen. */
  density: number;
  /** Goo style: how readily neighbours melt together, 0 (tight) to 100 (gloopy). */
  stickiness: number;
  /** Goo style: how strongly diagonal neighbours of one colour join, 0 (apart, as Life is usually drawn) to 100. */
  diagonals: number;
  /** Goo style: how readily different colours join, 0 (never) to 100. */
  melt: number;
  /** Goo style, with melt: the holes where mixed colours meet, 0 (closed) to 100 (wide). */
  gaps: number;
  /** How many dots wide a stroke draws. */
  /** Index into BRUSHES. */
  brushStep: number;
  /** After each stroke drawn in a colour, move on to the next colour in the palette. */
  rotateColours: boolean;
  /** The tool rail tucked away off the right edge. */
  railHidden: boolean;
  /** The cell style preview in Settings: still shapes, or a live board at the board's speed. */
  stylePreview: StylePreview;
  /** Whether the cell style preview is showing; it starts hidden behind a button. */
  stylePreviewShown: boolean;
}

export type StylePreview = "shapes" | "live";

export const SPEED_MIN = 1;
export const SPEED_MAX = 30;
/** Speeds below one a second, slowest first: a step every 3s, 2s and 1.5s. */
export const SLOW_SPEEDS: readonly number[] = [1 / 3, 1 / 2, 2 / 3];
/** Every speed the slider offers, slowest first; the slider's value is an index into this. */
export const SPEED_STEPS: readonly number[] = [
  ...SLOW_SPEEDS,
  ...Array.from({ length: SPEED_MAX - SPEED_MIN + 1 }, (_, i) => SPEED_MIN + i),
];
/** A speed as people read it: "8/s", or "every 2s" below one a second. */
export function formatSpeed(speed: number): string {
  return speed >= 1 ? `${speed}/s` : `every ${+(1 / speed).toFixed(1)}s`;
}
export const DENSITY_MIN = 12;
export const DENSITY_MAX = 48;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  palette: "meadow",
  style: "goo",
  mode: "colonies",
  rule: "B3/S23",
  wrap: true,
  critters: true,
  critterAbundance: DEFAULT_ABUNDANCE,
  smooth: true,
  speed: 5,
  labSpeed: 10,
  density: 18,
  stickiness: 45,
  diagonals: 85,
  melt: 90,
  gaps: 50,
  brushStep: 0,
  rotateColours: true,
  railHidden: false,
  stylePreview: "shapes",
  stylePreviewShown: false,
};

const STYLES: readonly CellStyle[] = ["goo", "dots", "pixels"];
const MODES: readonly ColourMode[] = ["colonies", "solo", "age"];
const PREVIEWS: readonly StylePreview[] = ["shapes", "live"];
// Still "softlife" from before the app was named Bloop Life: renaming it would lose everyone's saves.
const KEY = "softlife:settings";

/** Saved data may be from an older version or damaged: anything unusable falls back to its default. */
export function parseSettings(value: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (typeof value !== "object" || value === null) return { ...d };
  const v = value as Record<string, unknown>;
  const flag = (x: unknown, fallback: boolean) =>
    typeof x === "boolean" ? x : fallback;
  const oneOf = <T extends string>(
    x: unknown,
    options: readonly T[],
    fallback: T,
  ) => (options.includes(x as T) ? (x as T) : fallback);
  const int = (x: unknown, min: number, max: number, fallback: number) =>
    typeof x === "number" && Number.isInteger(x) && x >= min && x <= max
      ? x
      : fallback;
  return {
    palette: isThemeKey(v.palette) ? v.palette : d.palette,
    style: oneOf(v.style, STYLES, d.style),
    mode: oneOf(v.mode, MODES, d.mode),
    rule: typeof v.rule === "string" && parseRule(v.rule) ? v.rule : d.rule,
    wrap: flag(v.wrap, d.wrap),
    critters: flag(v.critters, d.critters),
    critterAbundance: int(
      v.critterAbundance,
      ABUNDANCE_MIN,
      ABUNDANCE_MAX,
      d.critterAbundance,
    ),
    smooth: flag(v.smooth, d.smooth),
    speed: SPEED_STEPS.includes(v.speed as number)
      ? (v.speed as number)
      : d.speed,
    labSpeed: SPEED_STEPS.includes(v.labSpeed as number)
      ? (v.labSpeed as number)
      : d.labSpeed,
    density: int(v.density, DENSITY_MIN, DENSITY_MAX, d.density),
    stickiness: int(v.stickiness, STICKINESS_MIN, STICKINESS_MAX, d.stickiness),
    diagonals: int(v.diagonals, DIAGONALS_MIN, DIAGONALS_MAX, d.diagonals),
    melt: int(v.melt, MELT_MIN, MELT_MAX, d.melt),
    gaps: int(v.gaps, GAPS_MIN, GAPS_MAX, d.gaps),
    // Older saves kept a width (`brushSize`), from before the in-between brushes.
    brushStep: int(
      v.brushStep,
      BRUSH_MIN,
      BRUSH_MAX,
      typeof v.brushSize === "number" ? stepForWidth(v.brushSize) : d.brushStep,
    ),
    rotateColours: flag(v.rotateColours, d.rotateColours),
    railHidden: flag(v.railHidden, d.railHidden),
    stylePreview: oneOf(v.stylePreview, PREVIEWS, d.stylePreview),
    stylePreviewShown: flag(v.stylePreviewShown, d.stylePreviewShown),
  };
}

/** Storage can be unavailable (private windows, blocked site data): then settings just aren't kept. */
export function loadSettings(): Settings {
  try {
    const raw = readItem(KEY);
    return parseSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    writeItem(KEY, JSON.stringify(s));
  } catch {
    // Not kept; nothing else to do.
  }
}
