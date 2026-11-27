import { describe, expect, it } from 'vitest';
import { PATTERNS } from '../src/patterns';

type Cells = Set<string>;

const toCells = (rows: readonly string[]): Cells => {
  const s: Cells = new Set();
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'O') s.add(`${x},${y}`); }));
  return s;
};

/** One B3/S23 step on an unbounded plane. */
function step(s: Cells): Cells {
  const counts = new Map<string, number>();
  for (const k of s) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) { const n = `${x + dx},${y + dy}`; counts.set(n, (counts.get(n) ?? 0) + 1); }
    }
  }
  const next: Cells = new Set();
  for (const [k, c] of counts) if (c === 3 || (c === 2 && s.has(k))) next.add(k);
  return next;
}

const run = (s: Cells, gens: number) => { for (let i = 0; i < gens; i++) s = step(s); return s; };

/** The shape with its top-left corner moved to 0,0, so moving ships compare equal. */
function shape(s: Cells): string {
  const pts = [...s].map((k) => k.split(',').map(Number) as [number, number]);
  const mx = Math.min(...pts.map((p) => p[0]));
  const my = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]) => `${x - mx},${y - my}`).sort().join(' ');
}

const byName = (name: string) => PATTERNS.find((p) => p.name === name)!;

describe('pattern library', () => {
  it('has rectangular rows and unique names', () => {
    for (const p of PATTERNS) expect(new Set(p.cells.map((r) => r.length)).size, p.name).toBe(1);
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(PATTERNS.length);
  });

  it.each(PATTERNS.filter((p) => p.category === 'Still life').map((p) => [p.name]))('%s does not change', (name) => {
    const s = toCells(byName(name).cells);
    expect(shape(step(s))).toBe(shape(s));
  });

  it.each(PATTERNS.filter((p) => p.category === 'Oscillator' || p.category === 'Spaceship').map((p) => [p.name, p.note]))(
    '%s repeats (%s)',
    (name, note) => {
      const s = toCells(byName(name).cells);
      const period = { Glider: 4, LWSS: 4, MWSS: 4, HWSS: 4, Loafer: 7 }[name] ?? Number(/period (\d+)/.exec(note)![1]);
      for (let g = 1; g < period; g++) expect(shape(run(s, g)), `gen ${g}`).not.toBe(shape(s));
      expect(shape(run(s, period))).toBe(shape(s));
    },
  );

  it.each([['Gosper glider gun', 30], ['Simkin glider gun', 120]] as const)('%s fires a glider every %i', (name, period) => {
    const s = toCells(byName(name).cells);
    expect(run(s, period).size).toBe(s.size + 5);
    expect(run(s, period * 2).size).toBe(s.size + 10);
  });
});
