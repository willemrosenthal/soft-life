/**
 * The drawing brush: round, exactly `size` dots across. Odd sizes centre on a cell and even sizes on
 * a grid corner, so size 1 is one cell, size 2 a 2×2 block, size 3 a 3×3 square, and larger sizes
 * lose their corners. Points are in grid units: cell (0, 0) spans 0..1.
 */

export const BRUSH_MIN = 1;
export const BRUSH_MAX = 7;

export interface Point { x: number; y: number }

/** Where an n-wide brush at `p` is centred. */
export function brushCentre(p: Point, size: number): Point {
  return size % 2 ? { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 } : { x: Math.round(p.x), y: Math.round(p.y) };
}

/** Indices of the cells an n-wide brush at `p` covers. Off-board cells wrap around with `wrap`, else they're skipped. */
export function brushCells(p: Point, size: number, cols: number, rows: number, wrap: boolean): number[] {
  const c = brushCentre(p, size);
  const r = size / 2 + 0.01;
  const out: number[] = [];
  for (let gy = Math.floor(c.y - r); gy <= Math.ceil(c.y + r); gy++) {
    for (let gx = Math.floor(c.x - r); gx <= Math.ceil(c.x + r); gx++) {
      if (Math.hypot(gx + 0.5 - c.x, gy + 0.5 - c.y) > r) continue;
      let x = gx;
      let y = gy;
      if (wrap) {
        x = ((x % cols) + cols) % cols;
        y = ((y % rows) + rows) % rows;
      } else if (x < 0 || y < 0 || x >= cols || y >= rows) {
        continue;
      }
      out.push(y * cols + x);
    }
  }
  return out;
}

/** Points from `a` (excluded) to `b` (included), at most `step` apart, so a fast stroke leaves no gaps. */
export function strokePoints(a: Point, b: Point, step = 0.5): Point[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n }));
}
