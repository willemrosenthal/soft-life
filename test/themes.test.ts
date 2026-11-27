import { describe, expect, it } from 'vitest';
import { contrast, difference, hexToLch } from '../src/oklab';
import { PALETTES } from '../src/palettes';
import { derivePalette, hardToSee, isDark, isThemeKey, nextThemeName, parseThemes, resolvePalette, standOut, surpriseTheme, type CustomTheme } from '../src/themes';
import { seededRandom } from '../src/rules';

const meadowLike: CustomTheme = { id: 'a', name: 'Mine', bg: PALETTES.meadow.bg, cells: [...PALETTES.meadow.cells] };
const nightLike: CustomTheme = { id: 'b', name: 'Dark', bg: PALETTES.night.bg, cells: [...PALETTES.night.cells] };

describe('derivePalette', () => {
  it('turns text and panels light on a dark background and dark on a light one', () => {
    expect(hexToLch(derivePalette(meadowLike).fg).l).toBeLessThan(0.4);
    expect(hexToLch(derivePalette(nightLike).fg).l).toBeGreaterThan(0.8);
  });

  it('runs the age ramp from brightest to deepest', () => {
    const ls = derivePalette(meadowLike).age.map((c) => hexToLch(c).l);
    expect(ls).toHaveLength(5);
    expect([...ls].sort((a, b) => b - a)).toEqual(ls);
  });

  it('keeps the accent readable, and every role a colour', () => {
    for (const t of [meadowLike, nightLike, { ...meadowLike, cells: ['#F4F6F0', ...meadowLike.cells.slice(1)] }]) {
      const p = derivePalette(t);
      expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(2.6);
      for (const c of [p.fg, p.panel, p.line, p.muted, p.accent, p.iris, p.solo, ...p.age]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
      expect(p.dot).toMatch(/^#[0-9A-F]{8}$/);
    }
  });
});

describe('hardToSee', () => {
  it("doesn't flag any built-in theme's own colours (a bright yellow on cream is easy to see)", () => {
    for (const p of Object.values(PALETTES)) for (const c of p.cells) expect(hardToSee(c, p.bg), `${p.name} ${c}`).toBe(false);
  });
  it('flags a colour close to the background, and standOut fixes it keeping the hue', () => {
    const bg = PALETTES.meadow.bg;
    expect(hardToSee('#EEF0EA', bg)).toBe(true);
    const fixed = standOut('#E6EEDF', bg);
    expect(hardToSee(fixed, bg)).toBe(false);
    expect(hexToLch(fixed).h).toBeCloseTo(hexToLch('#E6EEDF').h, -1);
  });
});

describe('theme keys', () => {
  it('names built-in themes and custom ones, and falls back to Meadow for a deleted one', () => {
    expect(isThemeKey('night')).toBe(true);
    expect(isThemeKey('custom:abc123')).toBe(true);
    expect(isThemeKey('custom:')).toBe(false);
    expect(isThemeKey('toString')).toBe(false);
    expect(resolvePalette('riso', [])).toBe(PALETTES.riso);
    expect(resolvePalette('custom:a', [meadowLike]).name).toBe('Mine');
    expect(resolvePalette('custom:gone', [meadowLike])).toBe(PALETTES.meadow);
  });
});

describe('parseThemes', () => {
  it('reads back saved themes', () => {
    expect(parseThemes(JSON.parse(JSON.stringify([meadowLike, nightLike])))).toEqual([meadowLike, nightLike]);
  });
  it('drops themes that make no sense and tidies the rest', () => {
    expect(parseThemes(null)).toEqual([]);
    const ok = { ...meadowLike, id: 'ok', name: '  Spaced  ', bg: '#f3f5ef' };
    expect(parseThemes([
      null,
      { ...meadowLike, id: 'bad id!' },
      { ...meadowLike, id: 'few', cells: meadowLike.cells.slice(1) },
      { ...meadowLike, id: 'nohex', bg: 'green' },
      { ...meadowLike, id: 'noname', name: ' ' },
      ok,
      { ...ok, name: 'Same id again' },
    ])).toEqual([{ ...ok, name: 'Spaced', bg: '#F3F5EF' }]);
  });
  it('finds a free "My theme" name', () => {
    expect(nextThemeName([])).toBe('My theme 1');
    expect(nextThemeName([{ ...meadowLike, name: 'My theme 2' }])).toBe('My theme 3');
  });
});

describe('surpriseTheme', () => {
  it('makes seven colours where every cell shows up on the background and differs from the others', () => {
    let dark = 0;
    for (let k = 0; k < 200; k++) {
      const t = surpriseTheme(seededRandom(`surprise ${k}`));
      expect(t.bg).toMatch(/^#[0-9A-F]{6}$/);
      expect(t.cells).toHaveLength(6);
      for (const c of t.cells) {
        expect(c).toMatch(/^#[0-9A-F]{6}$/);
        expect(hardToSee(c, t.bg), `${k}: ${c} on ${t.bg}`).toBe(false);
      }
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) expect(difference(t.cells[i]!, t.cells[j]!), `${k}`).toBeGreaterThan(0.05);
      if (isDark(t.bg)) dark++;
    }
    // Both light and dark backgrounds come up.
    expect(dark).toBeGreaterThan(40);
    expect(dark).toBeLessThan(160);
  });

  it('gives the same colours for the same random sequence', () => {
    expect(surpriseTheme(seededRandom('x'))).toEqual(surpriseTheme(seededRandom('x')));
  });
});
