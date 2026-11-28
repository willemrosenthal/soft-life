import { describe, expect, it } from 'vitest';
import { parseRule, type Rule } from '../src/life';
import { DAY_AND_NIGHT, HIGHLIFE, LIFE, PATTERNS } from '../src/patterns';

type Cells = Set<string>;

const toCells = (rows: readonly string[]): Cells => {
  const s: Cells = new Set();
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'O') s.add(`${x},${y}`); }));
  return s;
};

/** One step on an unbounded plane, Conway's rule unless told otherwise. */
function step(s: Cells, rule: Rule = parseRule(LIFE)!): Cells {
  const counts = new Map<string, number>();
  for (const k of s) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) { const n = `${x + dx},${y + dy}`; counts.set(n, (counts.get(n) ?? 0) + 1); }
    }
  }
  const next: Cells = new Set();
  for (const [k, c] of counts) if (s.has(k) ? rule.survive.has(c) : rule.born.has(c)) next.add(k);
  return next;
}

const run = (s: Cells, gens: number, rule: Rule = parseRule(LIFE)!) => { for (let i = 0; i < gens; i++) s = step(s, rule); return s; };

const shift = (s: Cells, dx: number, dy: number): Cells =>
  new Set([...s].map((k) => { const [x, y] = k.split(',').map(Number) as [number, number]; return `${x + dx},${y + dy}`; }));

/** The shape with its top-left corner moved to 0,0, so moving ships compare equal. */
function shape(s: Cells): string {
  const pts = [...s].map((k) => k.split(',').map(Number) as [number, number]);
  const mx = Math.min(...pts.map((p) => p[0]));
  const my = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]) => `${x - mx},${y - my}`).sort().join(' ');
}

const byName = (name: string) => PATTERNS.find((p) => p.name === name)!;

/** Every pattern paired with each rule it says it works under. */
const underRules = (keep: (category: string) => boolean) =>
  PATTERNS.filter((p) => keep(p.category)).flatMap((p) => p.rules.map((r) => [p.name, r, p.note] as const));

describe('pattern library', () => {
  it('has rectangular rows and unique names', () => {
    for (const p of PATTERNS) expect(new Set(p.cells.map((r) => r.length)).size, p.name).toBe(1);
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(PATTERNS.length);
  });

  it('lists only known rules, written the standard way', () => {
    for (const p of PATTERNS) {
      expect(p.rules.length, p.name).toBeGreaterThan(0);
      for (const r of p.rules) expect([LIFE, HIGHLIFE, DAY_AND_NIGHT], p.name).toContain(r);
    }
  });

  it.each(underRules((c) => c === 'Still life'))('%s does not change under %s', (name, rule) => {
    const s = toCells(byName(name).cells);
    expect(shape(step(s, parseRule(rule)!))).toBe(shape(s));
  });

  it.each(underRules((c) => c === 'Oscillator' || c === 'Spaceship'))(
    '%s repeats under %s (%s)',
    (name, rule, note) => {
      const r = parseRule(rule)!;
      const s = toCells(byName(name).cells);
      const period = { Glider: 4, LWSS: 4, MWSS: 4, HWSS: 4, Loafer: 7 }[name] ?? Number(/period (\d+)/.exec(note)![1]);
      for (let g = 1; g < period; g++) expect(shape(run(s, g, r)), `gen ${g}`).not.toBe(shape(s));
      expect(shape(run(s, period, r))).toBe(shape(s));
    },
  );

  it('the HighLife replicator splits into two copies of itself every 12 generations', () => {
    const s = toCells(byName('Replicator').cells);
    const after = run(s, 12, parseRule(HIGHLIFE)!);
    expect([...after].sort()).toEqual([...new Set([...shift(s, -2, -2), ...shift(s, 2, 2)])].sort());
  });

  it('Eater 1 eats a glider under Life and HighLife', () => {
    const eater = toCells(byName('Eater 1').cells);
    const glider = shift(toCells(['.O.', '..O', 'OOO']), -5, -5); // heading down and right, into the eater
    for (const rule of byName('Eater 1').rules) {
      expect([...run(new Set([...eater, ...glider]), 60, parseRule(rule)!)].sort(), rule).toEqual([...eater].sort());
    }
  });

  it.each([['Gosper glider gun', 30], ['Simkin glider gun', 120]] as const)('%s fires a glider every %i', (name, period) => {
    const s = toCells(byName(name).cells);
    expect(run(s, period).size).toBe(s.size + 5);
    expect(run(s, period * 2).size).toBe(s.size + 10);
  });
});
