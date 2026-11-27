import { describe, expect, it } from 'vitest';
import { BRUSHES, brushAt, brushCells, stepForWidth, strokePoints } from '../src/brush';

const named = (name: string) => BRUSHES.find((b) => b.name === name)!;

/** The brush's footprint as text ('#' = covered) on a cols×rows board. */
function footprint(x: number, y: number, name: string, cols = 7, rows = 7, wrap = false): string[] {
  const hit = new Set(brushCells({ x, y }, named(name), cols, rows, wrap));
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (hit.has(r * cols + c) ? '#' : '.')).join(''));
}

describe('brushCells', () => {
  it('1 dot is the cell under the pointer', () => {
    expect(footprint(3.4, 3.7, '1 dot')).toEqual(['.......', '.......', '.......', '...#...', '.......', '.......', '.......']);
  });

  it('the diagonal pair and 2 × 2 sit on the nearest grid corner', () => {
    expect(footprint(3.2, 2.9, '2, diagonal')).toEqual(['.......', '.......', '..#....', '...#...', '.......', '.......', '.......']);
    expect(footprint(3.2, 2.9, '2 × 2')).toEqual(['.......', '.......', '..##...', '..##...', '.......', '.......', '.......']);
  });

  it('the plus and diamond fill the gaps between the squares and round brushes', () => {
    expect(footprint(3.5, 3.5, '3, plus')).toEqual(['.......', '.......', '...#...', '..###..', '...#...', '.......', '.......']);
    expect(footprint(3.5, 3.5, '5, diamond')).toEqual(['.......', '...#...', '..###..', '.#####.', '..###..', '...#...', '.......']);
  });

  it('3 × 3 is full; 4 round loses its corners', () => {
    expect(footprint(3.5, 3.5, '3 × 3')).toEqual(['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......']);
    expect(footprint(3.6, 3.4, '4 round')).toEqual(['.......', '...##..', '..####.', '..####.', '...##..', '.......', '.......']);
  });

  it('is as wide and tall as it says, and never covers fewer cells than the step before', () => {
    let last = 0;
    for (const b of BRUSHES) {
      const rows = footprint(5.5, 5.5, b.name, 11, 11);
      const cols = rows.flatMap((r) => [...r].flatMap((ch, x) => (ch === '#' ? [x] : [])));
      expect(Math.max(...cols) - Math.min(...cols) + 1).toBe(b.width);
      expect(rows.filter((r) => r.includes('#')).length).toBe(b.width);
      expect(b.cells.length).toBeGreaterThanOrEqual(last);
      last = b.cells.length;
    }
  });

  it('wraps past the edge only when wrapping is on', () => {
    expect(brushCells({ x: 0.5, y: 0.5 }, named('3 × 3'), 5, 5, false)).toHaveLength(4);
    expect(brushCells({ x: 0.5, y: 0.5 }, named('3 × 3'), 5, 5, true)).toContain(24);
  });
});

describe('brush steps', () => {
  it('maps an old saved width to the round brush of that width', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((w) => BRUSHES[stepForWidth(w)]!.name)).toEqual(['1 dot', '2 × 2', '3 × 3', '4 round', '5 round', '6 round', '7 round']);
  });

  it('clamps an out-of-range step', () => {
    expect(brushAt(-3)).toBe(BRUSHES[0]);
    expect(brushAt(99)).toBe(BRUSHES[BRUSHES.length - 1]);
  });
});

describe('strokePoints', () => {
  it('fills the gap between pointer events, ending exactly at the new point', () => {
    const pts = strokePoints({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(pts).toEqual([{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1.5, y: 0 }, { x: 2, y: 0 }]);
    expect(strokePoints({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});
