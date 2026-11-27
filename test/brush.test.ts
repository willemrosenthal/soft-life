import { describe, expect, it } from 'vitest';
import { brushCells, strokePoints } from '../src/brush';

/** The brush's footprint as text ('#' = covered) on a cols×rows board. */
function footprint(x: number, y: number, size: number, cols = 7, rows = 7, wrap = false): string[] {
  const hit = new Set(brushCells({ x, y }, size, cols, rows, wrap));
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (hit.has(r * cols + c) ? '#' : '.')).join(''));
}

describe('brushCells', () => {
  it('size 1 is the cell under the pointer', () => {
    expect(footprint(3.4, 3.7, 1)).toEqual(['.......', '.......', '.......', '...#...', '.......', '.......', '.......']);
  });

  it('size 2 is a 2×2 block on the nearest grid corner', () => {
    expect(footprint(3.2, 2.9, 2)).toEqual(['.......', '.......', '..##...', '..##...', '.......', '.......', '.......']);
  });

  it('size 3 is a full 3×3; size 4 is round, losing its corners', () => {
    expect(footprint(3.5, 3.5, 3)).toEqual(['.......', '.......', '..###..', '..###..', '..###..', '.......', '.......']);
    expect(footprint(3.6, 3.4, 4)).toEqual(['.......', '...##..', '..####.', '..####.', '...##..', '.......', '.......']);
  });

  it('is never wider than its size', () => {
    for (let size = 1; size <= 7; size++) {
      const rows = footprint(5.5, 5.5, size, 11, 11);
      expect(Math.max(...rows.map((r) => r.split('#').length - 1))).toBe(size);
      expect(rows.filter((r) => r.includes('#')).length).toBe(size);
    }
  });

  it('wraps past the edge only when wrapping is on', () => {
    expect(brushCells({ x: 0.5, y: 0.5 }, 3, 5, 5, false)).toHaveLength(4);
    expect(brushCells({ x: 0.5, y: 0.5 }, 3, 5, 5, true)).toContain(24);
  });
});

describe('strokePoints', () => {
  it('fills the gap between pointer events, ending exactly at the new point', () => {
    const pts = strokePoints({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(pts).toEqual([{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1.5, y: 0 }, { x: 2, y: 0 }]);
    expect(strokePoints({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});
