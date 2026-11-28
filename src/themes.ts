import { contrast, difference, hexToLch, lchToHex } from './oklab';
import { readItem, writeItem } from './store';
import { isPaletteId, PALETTES, type Palette } from './palettes';

/**
 * Themes people make themselves. A theme is only seven colours: the background and one per colony.
 * Everything else a Palette needs (text, panels, lines, accent, dots, critter eyes, the solo colour
 * and the age ramp) is worked out from those, so any seven colours make a complete, readable theme.
 */

export interface CustomTheme {
  id: string;
  name: string;
  bg: string;
  /** One colour per colony: always six. */
  cells: string[];
}

export const CELL_COUNT = 6;
export const NAME_MAX = 24;
// Still "softlife" from before the app was named BloopLife: renaming it would lose everyone's saves.
const KEY = 'softlife:themes';
/** How settings.palette names a custom theme: "custom:<id>". */
const PREFIX = 'custom:';

export const themeKey = (t: CustomTheme) => PREFIX + t.id;

/** A palette setting worth keeping: a built-in theme, or a custom one (which may since have been deleted). */
export function isThemeKey(v: unknown): v is string {
  return isPaletteId(v) || (typeof v === 'string' && /^custom:[\w-]{1,40}$/.test(v));
}

/** The palette a setting names, or Meadow when it names a custom theme that no longer exists. */
export function resolvePalette(key: string, themes: readonly CustomTheme[]): Palette {
  if (isPaletteId(key)) return PALETTES[key];
  const theme = themes.find((t) => themeKey(t) === key);
  return theme ? derivePalette(theme) : PALETTES.meadow;
}

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// ---------------------------------------------------------------------------------------------
// Working out the rest of a palette

/** Below this lightness a background counts as dark: text and panels turn light. */
const DARK_BELOW = 0.6;
/** A cell colour closer than this to the background is hard to see. Meadow's yellow on cream is about 0.17. */
export const MIN_DIFFERENCE = 0.12;
/** The accent marks switches and links, so it needs real contrast with the background. */
const ACCENT_CONTRAST = 2.6;

export const isDark = (bg: string) => hexToLch(bg).l < DARK_BELOW;

/** Whether a cell colour is hard to see on the background. */
export const hardToSee = (cell: string, bg: string) => difference(cell, bg) < MIN_DIFFERENCE;

/** Step a colour's lightness away from the background until `enough` says it stands out; hue stays. */
function moveAway(hex: string, bg: string, enough: (c: string) => boolean): string {
  if (enough(hex)) return hex;
  const c = hexToLch(hex);
  const dir = isDark(bg) ? 1 : -1;
  for (let k = 1; k <= 90; k++) {
    const out = lchToHex({ ...c, l: Math.min(0.98, Math.max(0.03, c.l + dir * k * 0.01)) });
    if (enough(out)) return out;
  }
  return hex;
}

/** The nearest colour, by lightness, that stands out clearly from the background. */
export const standOut = (hex: string, bg: string) => moveAway(hex, bg, (c) => difference(c, bg) >= MIN_DIFFERENCE + 0.04);

/** How the six cell hues spread around the colour wheel, in degrees from the first. */
const HARMONIES: readonly (readonly number[])[] = [
  [0, 30, 60, 90, 120, 150], // a run of neighbouring hues
  [0, 120, 240, 40, 160, 280], // three groups, a third of the wheel apart
  [0, 180, 30, 210, 60, 240], // pairs of opposites
  [0, 137.5, 275, 52.5, 190, 327.5], // the golden angle: evenly spread, never repeating
];
/** Cell colours closer than this to each other are too alike to tell colonies apart. */
const MIN_CELL_DIFFERENCE = 0.07;

/**
 * Seven colours that go together, for "Surprise me": a light or dark background tinted with a random
 * hue, and six cell colours spread around the wheel by one of a few harmonies, with lightness and
 * colourfulness varied. Every cell stands out from the background and from the other cells.
 */
export function surpriseTheme(random: () => number = Math.random): Pick<CustomTheme, 'bg' | 'cells'> {
  const between = (a: number, b: number) => a + random() * (b - a);
  let best: Pick<CustomTheme, 'bg' | 'cells'> | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const hue = random() * 360;
    const dark = random() < 0.4;
    const bg = lchToHex({ l: dark ? between(0.15, 0.22) : between(0.94, 0.98), c: between(0.008, 0.03), h: hue });
    const spread = HARMONIES[Math.floor(random() * HARMONIES.length)]!;
    const start = hue + between(20, 340);
    const cells = spread.map((d, i) => standOut(lchToHex({
      // Alternate lighter and deeper so neighbouring colonies differ in more than hue.
      l: (dark ? 0.74 : 0.6) + (i % 2 ? 1 : -1) * between(0.04, 0.12),
      c: between(0.09, 0.18),
      h: (start + d + between(-8, 8)) % 360,
    }), bg));
    best = { bg, cells };
    const distinct = cells.every((a, i) => cells.every((b, j) => j <= i || difference(a, b) >= MIN_CELL_DIFFERENCE));
    if (distinct) break;
  }
  return best!;
}

/**
 * The full palette for a theme. Greys are tinted toward the background's hue, so a blue theme gets
 * blue-greys. The age ramp sorts the cell colours by lightness: newborns brightest, old cells deepest.
 */
export function derivePalette(t: CustomTheme): Palette {
  const bg = hexToLch(t.bg);
  const dark = bg.l < DARK_BELOW;
  const tint = Math.min(bg.c, 0.03);
  const grey = (l: number, c: number) => lchToHex({ l, c, h: bg.h });
  const fg = grey(dark ? 0.94 : 0.24, tint * 0.6);
  const lch = t.cells.map(hexToLch);
  // Critter eyes: the colour whose hue is furthest from the first, so irises stand out on most cells.
  const gap = (h: number) => { const d = Math.abs(h - lch[0]!.h) % 360; return d > 180 ? 360 - d : d; };
  let iris = 1;
  lch.forEach((c, i) => { if (i && c.c > 0.05 && gap(c.h) > gap(lch[iris]!.h)) iris = i; });
  const byLightness = t.cells.map((hex, i) => ({ hex, l: lch[i]!.l })).sort((a, b) => b.l - a.l).map((x) => x.hex);
  return {
    name: t.name,
    bg: t.bg,
    fg,
    panel: dark ? grey(bg.l + 0.05, tint) : grey(Math.min(1, bg.l + 0.035), tint * 0.4),
    line: grey(dark ? bg.l + 0.1 : bg.l - 0.07, tint * 1.2),
    muted: grey(dark ? 0.68 : 0.52, tint * 0.9 + 0.01),
    accent: moveAway(t.cells[0]!, t.bg, (c) => contrast(c, t.bg) >= ACCENT_CONTRAST),
    dot: fg + (dark ? '1C' : '1F'),
    iris: t.cells[iris]!,
    cells: t.cells,
    solo: t.cells[0]!,
    // Five steps from six colours: leave out the middle one.
    age: [byLightness[0]!, byLightness[1]!, byLightness[2]!, byLightness[4]!, byLightness[5]!],
  };
}

// ---------------------------------------------------------------------------------------------
// Saved themes

/** Saved data may be damaged or from an older version: keep the themes that still make sense. */
export function parseThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const out: CustomTheme[] = [];
  for (const v of value as unknown[]) {
    if (typeof v !== 'object' || v === null) continue;
    const { id, name, bg, cells } = v as Record<string, unknown>;
    if (typeof id !== 'string' || !isThemeKey(PREFIX + id) || out.some((t) => t.id === id)) continue;
    if (typeof name !== 'string' || !name.trim() || !isHex(bg)) continue;
    if (!Array.isArray(cells) || cells.length !== CELL_COUNT || !cells.every(isHex)) continue;
    out.push({ id, name: name.trim().slice(0, NAME_MAX), bg: bg.toUpperCase(), cells: cells.map((c) => c.toUpperCase()) });
  }
  return out;
}

/** Storage can be unavailable (private windows, blocked site data): then there are no saved themes. */
export function loadThemes(): CustomTheme[] {
  try {
    const raw = readItem(KEY);
    return parseThemes(raw ? JSON.parse(raw) : null);
  } catch {
    return [];
  }
}

export function saveThemes(themes: readonly CustomTheme[]): void {
  try {
    writeItem(KEY, JSON.stringify(themes));
  } catch {
    // Not kept; nothing else to do.
  }
}

/** "My theme 2": the first such name not already taken. */
export function nextThemeName(themes: readonly CustomTheme[]): string {
  let n = themes.length + 1;
  while (themes.some((t) => t.name === `My theme ${n}`)) n++;
  return `My theme ${n}`;
}
