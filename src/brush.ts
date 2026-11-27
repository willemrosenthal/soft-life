/**
 * The drawing brushes, smallest to largest. Most are round: the cells within a radius of a centre that
 * sits on a cell (odd widths) or on a grid corner (even widths). A few in-between shapes (a diagonal
 * pair, a plus, a diamond) fill the gaps, so the draw size slider grows in small steps. Points are in
 * grid units: cell (0, 0) spans 0..1.
 */

export interface Point { x: number; y: number }

export interface Brush {
  /** Shown beside the slider. */
  readonly name: string;
  /** Dots across. */
  readonly width: number;
  /** Centred on a grid corner rather than a cell. */
  readonly corner: boolean;
  /** Offsets from the cell under the centre (for a corner brush, the cell below-right of the corner). */
  readonly cells: readonly (readonly [number, number])[];
}

/** Every cell whose centre is within √r2 of the brush's centre. */
function round(name: string, corner: boolean, r2: number): Brush {
  const cells: [number, number][] = [];
  const o = corner ? 0.5 : 0;
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if ((x + o) ** 2 + (y + o) ** 2 <= r2 + 1e-9) cells.push([x, y]);
  const xs = cells.map(([x]) => x);
  return { name, width: Math.max(...xs) - Math.min(...xs) + 1, corner, cells };
}

export const BRUSHES: readonly Brush[] = [
  round('1 dot', false, 0),
  { name: '2, diagonal', width: 2, corner: true, cells: [[-1, -1], [0, 0]] },
  round('2 × 2', true, 0.5),
  round('3, plus', false, 1),
  round('3 × 3', false, 2),
  round('4 round', true, 2.5),
  round('5, diamond', false, 4),
  round('5 round', false, 6),
  round('6 round', true, 8.5),
  round('7 round', false, 10),
];

export const BRUSH_MIN = 0;
export const BRUSH_MAX = BRUSHES.length - 1;

/** The brush at a slider step, clamped so a bad value still draws something. */
export const brushAt = (step: number): Brush => BRUSHES[Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, Math.round(step)))]!;

/** Draw sizes used to be saved as a width, 1–7 dots: the round brush of that width. */
const OLD_WIDTHS = [0, 2, 4, 5, 7, 8, 9];
export const stepForWidth = (width: number): number => OLD_WIDTHS[width - 1] ?? BRUSH_MIN;

/** Where a brush at `p` is centred. */
export function brushCentre(p: Point, brush: Brush): Point {
  return brush.corner ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
}

/** Indices of the cells a brush at `p` covers. Off-board cells wrap around with `wrap`, else they're skipped. */
export function brushCells(p: Point, brush: Brush, cols: number, rows: number, wrap: boolean): number[] {
  const ax = brush.corner ? Math.round(p.x) : Math.floor(p.x);
  const ay = brush.corner ? Math.round(p.y) : Math.floor(p.y);
  const out: number[] = [];
  for (const [dx, dy] of brush.cells) {
    let x = ax + dx;
    let y = ay + dy;
    if (wrap) {
      x = ((x % cols) + cols) % cols;
      y = ((y % rows) + rows) % rows;
    } else if (x < 0 || y < 0 || x >= cols || y >= rows) {
      continue;
    }
    out.push(y * cols + x);
  }
  return out;
}

/** Points from `a` (excluded) to `b` (included), at most `step` apart, so a fast stroke leaves no gaps. */
export function strokePoints(a: Point, b: Point, step = 0.5): Point[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n }));
}
