import { Critters } from './critters';
import type { Life } from './life';
import type { Palette } from './palettes';
import { MeltRenderer } from './melt';
import { RADIUS, traceSlime } from './slime';

/**
 * Drawing. The simulation is plain Life; only the picture is soft. In the goo style, same-coloured
 * neighbours melt into one blob (see slime.ts); the other styles draw each cell alone. Every colour
 * goes into one Path2D and is filled in a single call, which keeps it fast on phones.
 */

export type CellStyle = 'goo' | 'dots' | 'pixels';
export type ColourMode = 'colonies' | 'solo' | 'age';

const TAU = Math.PI * 2;

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
  /** Goo only: 0 (tight) to 100 (gloopy). Default 50. */
  stickiness?: number;
  /** Goo only: how strongly diagonal neighbours join, 0 (apart) to 100. Default 0. */
  diagonals?: number;
  /** Goo only: blobs reach across the edges. */
  wrap?: boolean;
}

/** Draw cells in the chosen style. Shared by the board, the library thumbnails and the logo. */
export function drawCells(ctx: CanvasRenderingContext2D, g: CellLayer): void {
  fillCells(ctx, cellPaths(g), g);
}

/** One path per colour. Goo outlines can contain holes, filled by the even-odd rule. */
function cellPaths(g: CellLayer): Path2D[] {
  const { cols, rows, cell: c, ox, oy, size, colour, colours, style } = g;
  const paths = colours.map(() => new Path2D());
  if (style === 'goo') {
    traceSlime({ cols, rows, cell: c, ox, oy, size, colour, wrap: g.wrap ?? false }, colours.length, g.stickiness ?? 50, (k) => paths[k]!, g.diagonals ?? 0);
    return paths;
  }
  const R = RADIUS * c;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const s = size[i]!;
      if (s <= 0) continue;
      const p = paths[colour[i]!]!;
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
    }
  }
  return paths;
}

function fillCells(ctx: CanvasRenderingContext2D, paths: readonly Path2D[], g: CellLayer): void {
  const rule = g.style === 'goo' ? 'evenodd' : 'nonzero';
  g.colours.forEach((fill, k) => {
    ctx.fillStyle = fill;
    ctx.fill(paths[k]!, rule);
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
  /** How readily critters appear, 0–100. Defaults to the critters' own default. */
  critterAbundance?: number;
  stickiness: number;
  /** Goo only: how strongly diagonal neighbours of one colour join, 0 (apart) to 100. */
  diagonals: number;
  /** Goo only: how readily different colours join, 0 (never) to 100. */
  melt: number;
  /** Goo with melt: the holes where mixed colours meet, 0 (closed) to 100 (wide). */
  gaps: number;
  wrap: boolean;
}

/** Age (generations alive) → index into a palette's `age` colours. */
const ageBucket = (a: number) => (a <= 1 ? 0 : a <= 3 ? 1 : a <= 9 ? 2 : a <= 29 ? 3 : 4);
/** Newborns overshoot a little and settle (ease-out-back); the dying shrink smoothly. */
const grow = (t: number) => { const u = t - 1; return 1 + 2.5 * u * u * u + 1.5 * u * u; };
const shrink = (t: number) => 1 - t * t * (3 - 2 * t);

const sameCells = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** Draws the live board. Holds per-cell scratch arrays so the cells allocate nothing per frame. */
export class BoardRenderer {
  private size = new Float32Array(0);
  private colour = new Int8Array(0);
  /** Eyes on long-lived cells. Set its `pointer` and `calm`, and `poke` it on taps. */
  readonly critters = new Critters();
  /** Where the brush would draw, shown as a dashed ring; null hides it. */
  brushRing: BrushRing | null = null;
  /** Made on first use; null if WebGL 2 isn't available. */
  private meltRenderer: MeltRenderer | null | undefined;
  private paths: Path2D[] | null = null;
  private pathsKey = '';
  private lastSize = new Float32Array(0);
  private lastColour = new Int8Array(0);

  /**
   * `t` runs 0 → 1 between generations: how far cells have grown in or melted away. `now` is the
   * frame's wall-clock time in ms, which drives the critters' eyes.
   */
  draw(ctx: CanvasRenderingContext2D, life: Life, view: View, pal: Palette, look: Look, t: number, now: number): void {
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
    const layer: CellLayer = { cols, rows, cell: c, ox, oy, size, colour, colours, style: look.style, stickiness: look.stickiness, diagonals: look.diagonals, wrap: look.wrap };
    if (!this.drawMelt(ctx, layer, look, width, height)) this.drawFlat(ctx, layer);

    if (look.critters) {
      this.critters.draw(ctx, {
        life, place: view, now, iris: pal.iris, ink: pal.fg, pairs: look.style === 'goo', abundance: look.critterAbundance,
        skinOf: (i) => colours[colour[i]!]!,
        sizeOf: (i) => size[i]!,
      });
    } else if (this.critters.active) {
      // Turned off: forget them, so they open their eyes afresh when turned back on.
      this.critters.reset();
    }
    if (this.brushRing) drawRing(ctx, this.brushRing, view, pal);
  }

  /** Goo with colour melt, on the GPU. False when it doesn't apply or isn't available. */
  private drawMelt(ctx: CanvasRenderingContext2D, g: CellLayer, look: Look, width: number, height: number): boolean {
    // With melt off, or one colour, there's nothing to melt: plain goo looks exactly the same.
    if (g.style !== 'goo' || look.melt <= 0 || g.colours.length < 2) return false;
    if (this.meltRenderer === undefined) this.meltRenderer = MeltRenderer.create();
    if (!this.meltRenderer) return false;
    return this.meltRenderer.draw(ctx, { ...g, wrap: look.wrap, stickiness: look.stickiness, diagonals: look.diagonals, melt: look.melt, gaps: look.gaps }, width, height);
  }

  /**
   * One flat fill per colour. Critters redraw the board every frame even when nothing moves:
   * reuse the outline then, since tracing goo is the costly part.
   */
  private drawFlat(ctx: CanvasRenderingContext2D, g: CellLayer): void {
    const n = g.size.length;
    const key = `${g.style} ${g.stickiness} ${g.diagonals} ${g.wrap} ${g.colours.length} ${g.cell} ${g.ox} ${g.oy}`;
    if (!this.paths || key !== this.pathsKey || !sameCells(g.size, this.lastSize) || !sameCells(g.colour, this.lastColour)) {
      this.paths = cellPaths(g);
      this.pathsKey = key;
      if (this.lastSize.length !== n) {
        this.lastSize = new Float32Array(n);
        this.lastColour = new Int8Array(n);
      }
      this.lastSize.set(g.size);
      this.lastColour.set(g.colour);
    }
    fillCells(ctx, this.paths, g);
  }
}

/** A brush's outline: centre in grid units, `size` dots across, filled faintly in its colour (null = eraser). */
export interface BrushRing { x: number; y: number; size: number; colour: string | null }

function drawRing(ctx: CanvasRenderingContext2D, ring: BrushRing, view: View, pal: Palette): void {
  const { cell: c, ox, oy } = view;
  const r = Math.max(0.55, ring.size / 2) * c;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ox + ring.x * c, oy + ring.y * c, r, 0, TAU);
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = ring.colour ?? pal.fg;
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.restore();
}
