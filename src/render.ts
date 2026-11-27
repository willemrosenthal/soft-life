import type { Life } from './life';
import type { Palette } from './palettes';

/**
 * Drawing. The simulation is plain Life; only the picture is soft. Each live cell is a circle,
 * same-coloured side-by-side cells get a curved neck between them, and full 2×2 blocks get their
 * middle filled, so neighbours read as one blob. Every colour goes into one Path2D and is filled
 * in a single call, which keeps it fast on phones.
 */

export type CellStyle = 'goo' | 'dots' | 'pixels';
export type ColourMode = 'colonies' | 'solo' | 'age';

const TAU = Math.PI * 2;
/** Circle radius and neck waist, as fractions of a cell. */
const RADIUS = 0.47;
const WAIST = 0.29;

/**
 * Add the neck joining the cell centred at (ax, ay) to its right-hand neighbour (or the one below,
 * when `vertical`). `k` scales it while cells grow in or melt away. The neck's sides are arcs that
 * meet both circles at a tangent, so the outline has no corners.
 */
function neck(p: Path2D, ax: number, ay: number, c: number, vertical: boolean, k: number): void {
  const R = RADIUS * c * k;
  const w = WAIST * c * k;
  const f = (c * c / 4 + w * w - R * R) / (2 * (R - w));
  const d = w + f;
  const q = R / (R + f);
  const h = c / 2;
  const aL = Math.atan2(d, -h);
  const aR = Math.atan2(d, h);
  const rot = vertical ? Math.PI / 2 : 0;
  const T = vertical ? (lx: number, ly: number) => [ax - ly, ay + lx] as const : (lx: number, ly: number) => [ax + lx, ay + ly] as const;
  let P = T(h * q, -d * q);
  p.moveTo(P[0], P[1]);
  P = T(h, -d);
  p.arc(P[0], P[1], f, aL + rot, aR + rot, true);
  P = T(c - h * q, d * q);
  p.lineTo(P[0], P[1]);
  P = T(h, d);
  p.arc(P[0], P[1], f, -aR + rot, -aL + rot, true);
  p.closePath();
}

export interface CellLayer {
  cols: number;
  rows: number;
  cell: number;
  /** Top-left of the grid, in canvas units. */
  ox: number;
  oy: number;
  /** Per cell: drawn size, 0 (hidden) to 1 (full); grows a little past 1 as a cell pops in. */
  size: ArrayLike<number>;
  /** Per cell: index into `colours`. */
  colour: ArrayLike<number>;
  colours: readonly string[];
  style: CellStyle;
}

/** Draw cells in the chosen style. Shared by the board, the library thumbnails and the logo. */
export function drawCells(ctx: CanvasRenderingContext2D, g: CellLayer): void {
  const { cols, rows, cell: c, ox, oy, size, colour, colours, style } = g;
  const paths = colours.map(() => new Path2D());
  const R = RADIUS * c;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const s = size[i]!;
      if (s <= 0) continue;
      const col = colour[i]!;
      const p = paths[col]!;
      const cx = ox + (x + 0.5) * c;
      const cy = oy + (y + 0.5) * c;
      if (style === 'pixels') {
        const half = c * 0.46 * Math.min(s, 1);
        p.rect(cx - half, cy - half, 2 * half, 2 * half);
        continue;
      }
      const r = R * s;
      p.moveTo(cx + r, cy);
      p.arc(cx, cy, r, 0, TAU);
      if (style !== 'goo') continue;
      const right = x + 1 < cols && size[i + 1]! > 0 && colour[i + 1] === col;
      const down = y + 1 < rows && size[i + cols]! > 0 && colour[i + cols] === col;
      if (right) neck(p, cx, cy, c, false, Math.min(s, size[i + 1]!, 1));
      if (down) neck(p, cx, cy, c, true, Math.min(s, size[i + cols]!, 1));
      const full = (j: number) => size[j]! > 0.98;
      if (right && down && full(i) && full(i + 1) && full(i + cols) && full(i + cols + 1) && colour[i + cols + 1] === col) p.rect(cx, cy, c, c);
    }
  }
  colours.forEach((fill, k) => {
    ctx.fillStyle = fill;
    ctx.fill(paths[k]!);
  });
}

/** Where the grid sits on the canvas, in CSS pixels. */
export interface View {
  width: number;
  height: number;
  cell: number;
  ox: number;
  oy: number;
}

export interface Look {
  style: CellStyle;
  mode: ColourMode;
  critters: boolean;
}

/** Age (generations alive) → index into a palette's `age` colours. */
const ageBucket = (a: number) => (a <= 1 ? 0 : a <= 3 ? 1 : a <= 9 ? 2 : a <= 29 ? 3 : 4);
/** Newborns overshoot a little and settle (ease-out-back); the dying shrink smoothly. */
const grow = (t: number) => { const u = t - 1; return 1 + 2.5 * u * u * u + 1.5 * u * u; };
const shrink = (t: number) => 1 - t * t * (3 - 2 * t);

/** Draws the live board. Holds per-cell scratch arrays so nothing is allocated per frame. */
export class BoardRenderer {
  private size = new Float32Array(0);
  private colour = new Int8Array(0);

  /** `t` runs 0 → 1 between generations: how far cells have grown in or melted away. */
  draw(ctx: CanvasRenderingContext2D, life: Life, view: View, pal: Palette, look: Look, t: number): void {
    const { cols, rows, cur, prev, ages, prevAges } = life;
    const n = cols * rows;
    if (this.size.length !== n) {
      this.size = new Float32Array(n);
      this.colour = new Int8Array(n);
    }
    const { size, colour } = this;
    for (let i = 0; i < n; i++) {
      const a = prev[i]!;
      const b = cur[i]!;
      let col: number;
      let age: number;
      if (a && b) { size[i] = 1; col = b; age = ages[i]!; }
      else if (b) { size[i] = grow(t); col = b; age = 1; }
      else if (a) { size[i] = shrink(t); col = a; age = prevAges[i]!; }
      else { size[i] = 0; continue; }
      colour[i] = look.mode === 'colonies' ? col - 1 : look.mode === 'solo' ? 0 : ageBucket(age);
    }

    const { width, height, cell: c, ox, oy } = view;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, width, height);

    const dots = new Path2D();
    const dr = Math.max(0.8, c * 0.06);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = ox + (x + 0.5) * c;
        const cy = oy + (y + 0.5) * c;
        dots.moveTo(cx + dr, cy);
        dots.arc(cx, cy, dr, 0, TAU);
      }
    }
    ctx.fillStyle = pal.dot;
    ctx.fill(dots);

    const colours = look.mode === 'colonies' ? pal.cells : look.mode === 'solo' ? [pal.solo] : pal.age;
    drawCells(ctx, { cols, rows, cell: c, ox, oy, size, colour, colours, style: look.style });

    if (look.critters) this.drawCritters(ctx, life, view, pal);
  }

  /** Some long-lived cells open an eye. Which ones is fixed by position, so eyes don't flicker. */
  private drawCritters(ctx: CanvasRenderingContext2D, life: Life, view: View, pal: Palette): void {
    const { cols, rows, cur, prev, ages } = life;
    const { cell: c, ox, oy } = view;
    const ring = new Path2D();
    const white = new Path2D();
    const pupil = new Path2D();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!(cur[i] && prev[i] && ages[i]! >= 18 && (x * 7 + y * 13) % 9 === 0)) continue;
        const cx = ox + (x + 0.5) * c;
        const cy = oy + (y + 0.5) * c;
        ring.moveTo(cx + c * 0.27, cy);
        ring.arc(cx, cy, c * 0.27, 0, TAU);
        white.moveTo(cx + c * 0.2, cy);
        white.arc(cx, cy, c * 0.2, 0, TAU);
        const px = cx + c * 0.04;
        const py = cy - c * 0.03;
        pupil.moveTo(px + c * 0.09, py);
        pupil.arc(px, py, c * 0.09, 0, TAU);
      }
    }
    ctx.fillStyle = pal.ring;
    ctx.fill(ring);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill(white);
    ctx.fillStyle = '#161616';
    ctx.fill(pupil);
  }
}
