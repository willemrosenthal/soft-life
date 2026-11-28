/** Themes. Each fills the same roles: the app's own colours, plus the colours cells are drawn in. */
export interface Palette {
  name: string;
  bg: string;
  fg: string;
  panel: string;
  line: string;
  muted: string;
  accent: string;
  /** The faint dot marking each empty cell. */
  dot: string;
  /** Iris of the "tinted" critters' eyes. */
  iris: string;
  /** One colour per colony. */
  cells: readonly string[];
  /** The single colour for "solo" mode. */
  solo: string;
  /** Colours by age, youngest first (see ageBucket in render.ts). */
  age: readonly string[];
}

export const PALETTES = {
  meadow: {
    name: 'Meadow', bg: '#F3F5EF', fg: '#1D2A20', panel: '#FFFFFF', line: '#DDE3DA', muted: '#6B776D', accent: '#3E9A47',
    dot: 'rgba(29,42,32,.11)', iris: '#5DB6F2',
    cells: ['#3E9A47', '#D3A473', '#8B5631', '#232323', '#F49AC1', '#F0CF3A'], solo: '#3E9A47',
    age: ['#F0CF3A', '#5DB6F2', '#3E9A47', '#8B5631', '#232323'],
  },
  night: {
    name: 'Night', bg: '#101317', fg: '#E9EEF2', panel: '#1A1F25', line: '#2A3139', muted: '#8D98A4', accent: '#5FCB8A',
    dot: 'rgba(233,238,242,.09)', iris: '#FF7FA8',
    cells: ['#7BE0A0', '#FFB37A', '#B59CFF', '#F3EFE6', '#FF7FA8', '#6CC8FF'], solo: '#7BE0A0',
    age: ['#FFE066', '#FF7FA8', '#B59CFF', '#6CC8FF', '#7BE0A0'],
  },
  riso: {
    name: 'Riso', bg: '#FBFAFD', fg: '#1A1A2E', panel: '#FFFFFF', line: '#E4E1EC', muted: '#6E6A80', accent: '#FF48B0',
    dot: 'rgba(26,26,46,.10)', iris: '#00A95C',
    cells: ['#FF48B0', '#0078BF', '#FFE800', '#00A95C', '#FF6C2F', '#765BA7'], solo: '#0078BF',
    age: ['#FFE800', '#FF6C2F', '#FF48B0', '#765BA7', '#0078BF'],
  },
  candy: {
    name: 'Candy', bg: '#FBFAFD', fg: '#1A1A2E', panel: '#FFFFFF', line: '#E4E1EC', muted: '#6E6A80', accent: '#FB65B0',
    dot: 'rgba(26,26,46,.10)', iris: '#1EEB8F',
    cells: ['#FF68B3', '#D48BFF', '#FFE800', '#1EEB8F', '#A5FF2E', '#6FEEFF'], solo: '#FF68B3',
    age: ['#FFE800', '#A5FF2E', '#6FEEFF', '#D48BFF', '#FF68B3'],
  },
} satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;

export function isPaletteId(v: unknown): v is PaletteId {
  return typeof v === 'string' && Object.hasOwn(PALETTES, v);
}
