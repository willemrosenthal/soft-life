/**
 * The goo style's outline. Every live cell adds a soft lump to a field, one field per colour, and
 * the outline is wherever the field crosses a threshold. Neighbours therefore join by themselves:
 * a newborn's neighbour bulges toward it and a thread snaps across, and a dying cell's neck thins
 * and pinches off. The field is sampled on a fine grid, traced with marching squares and drawn as
 * quadratic curves through the edge midpoints, so the outline has no corners.
 *
 * Only the parts of the grid near live cells are touched, so the cost follows the population,
 * not the board size.
 */

/** Anything that can take an outline: Path2D does; the tests use a recorder. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
}

export interface SlimeLayer {
  cols: number;
  rows: number;
  cell: number;
  ox: number;
  oy: number;
  /** Per cell: 0 (none) to 1 (full); a little over 1 while popping in. */
  size: ArrayLike<number>;
  /** Per cell: which field (colour) it belongs to. */
  colour: ArrayLike<number>;
  /** Lumps near an edge reach across to the other side. */
  wrap: boolean;
}

/** A full cell's radius, as a fraction of a cell. Shared with the other styles in render.ts. */
export const RADIUS = 0.47;

export const STICKINESS_MIN = 0;
export const STICKINESS_MAX = 100;

/**
 * How far a full cell's lump reaches, in cells, for a stickiness of 0 to 100. At 50 (1.0) adjacent
 * cells join with a waist of about 0.36 cells; at 0 it is about 0.2. At 100 diagonal neighbours
 * reach toward each other but stay apart, so Life patterns stay readable.
 */
export const reachFor = (stickiness: number) => 0.75 + 0.005 * stickiness;

/** A lone lump's edge is at RADIUS × size, the same circles the other styles draw, when the field's level is this. */
export const thresholdFor = (reach: number) => (1 - (RADIUS / reach) ** 2) ** 3;

/** How far the lump in the middle of a full 2×2 block reaches, in cells. */
export const BLOCK_LUMP_REACH = 0.6;

/**
 * Strength (0 to 1) of the small lump in the middle of the 2×2 block whose top-left cell is (x, y).
 * Without it, low stickiness leaves a pinhole there. It fades in only once all four cells are
 * mostly grown: earlier, with two diagonal cells full and the others tiny, it would join the
 * diagonal in a thin stick. With `sameColour` (the default) it is 0 unless all four share a colour.
 */
export function blockLump(g: Pick<SlimeLayer, 'cols' | 'rows' | 'size' | 'colour' | 'wrap'>, x: number, y: number, sameColour = true): number {
  const { cols, rows, size, colour, wrap } = g;
  let x1 = x + 1;
  let y1 = y + 1;
  if (x1 >= cols || y1 >= rows) {
    if (!wrap) return 0;
    x1 %= cols;
    y1 %= rows;
  }
  const i = y * cols + x;
  const r = y * cols + x1;
  const d = y1 * cols + x;
  const rd = y1 * cols + x1;
  const col = colour[i];
  if (sameColour && (colour[r] !== col || colour[d] !== col || colour[rd] !== col)) return 0;
  const t = (Math.min(size[i]!, size[r]!, size[d]!, size[rd]!, 1) - 0.6) / 0.4;
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** Blank rows of samples around the board, in cells. Wide enough for the biggest lump of a wrapped copy. */
const PAD = 2;
/** Lumps smaller than this are skipped. */
const MIN_SIZE = 0.02;

/** Samples per cell: about one every 3 px, within limits. The curves smooth what's between. */
const samplesPerCell = (cell: number) => Math.max(4, Math.min(8, Math.round(cell / 3)));

/** Reused between calls so a frame allocates nothing once the board's size settles. */
class Scratch {
  field = new Float32Array(0);
  /** Per block of sub×sub squares: touched by the current colour. */
  marked = new Uint8Array(0);
  blocks: number[] = [];
  /** Each edge point's two neighbours along the outline (-1 unset, -2 visited). */
  nbA = new Int32Array(0);
  nbB = new Int32Array(0);
  /** Edge-point positions, in samples. */
  px = new Float32Array(0);
  py = new Float32Array(0);
  keys: number[] = [];
  loop: number[] = [];

  fit(vertices: number, blocks: number): void {
    if (this.field.length < vertices) {
      this.field = new Float32Array(vertices);
      this.nbA = new Int32Array(2 * vertices).fill(-1);
      this.nbB = new Int32Array(2 * vertices).fill(-1);
      this.px = new Float32Array(2 * vertices);
      this.py = new Float32Array(2 * vertices);
    }
    if (this.marked.length < blocks) this.marked = new Uint8Array(blocks);
  }
}
const scratch = new Scratch();

/**
 * Trace every colour's outline into `sinkFor(colour)`. Fill the results with the even-odd rule:
 * loops come out in either direction, and holes (inside a ring of cells) are separate loops.
 * `colours` is how many fields there are.
 */
export function traceSlime(g: SlimeLayer, colours: number, stickiness: number, sinkFor: (colour: number) => PathSink): void {
  const { cols, rows, cell, ox, oy, size, colour, wrap } = g;
  const sub = samplesPerCell(cell);
  const W = (cols + 2 * PAD) * sub + 1;
  const H = (rows + 2 * PAD) * sub + 1;
  const BW = cols + 2 * PAD;
  const BH = rows + 2 * PAD;
  const S = scratch;
  S.fit(W * H, BW * BH);
  const { field: F, marked, blocks, nbA, nbB, px, py, keys, loop } = S;
  // Clamped: past the range, lumps would outgrow PAD and outlines would no longer close.
  const reach = reachFor(Math.max(STICKINESS_MIN, Math.min(STICKINESS_MAX, stickiness)));
  const T = thresholdFor(reach);

  /** Add a lump centred at (x, y) cells, reaching r cells, at strength w, on the sample grid. */
  const splatOne = (x: number, y: number, r: number, w: number) => {
    const cx = (x + PAD) * sub;
    const cy = (y + PAD) * sub;
    const rs = r * sub;
    const x0 = Math.max(0, Math.ceil(cx - rs));
    const x1 = Math.min(W - 1, Math.floor(cx + rs));
    const y0 = Math.max(0, Math.ceil(cy - rs));
    const y1 = Math.min(H - 1, Math.floor(cy + rs));
    if (x0 > x1 || y0 > y1) return;
    // A sample is used by the squares on both sides of it, so mark one square further left and up.
    const bx1 = Math.min(BW - 1, Math.floor(x1 / sub));
    const by1 = Math.min(BH - 1, Math.floor(y1 / sub));
    for (let by = Math.max(0, Math.floor((y0 - 1) / sub)); by <= by1; by++) {
      for (let bx = Math.max(0, Math.floor((x0 - 1) / sub)); bx <= bx1; bx++) {
        const b = by * BW + bx;
        if (!marked[b]) { marked[b] = 1; blocks.push(b); }
      }
    }
    const inv = 1 / (rs * rs);
    for (let sy = y0; sy <= y1; sy++) {
      const dy = sy - cy;
      const row = sy * W;
      for (let sx = x0; sx <= x1; sx++) {
        const dx = sx - cx;
        const q = 1 - (dx * dx + dy * dy) * inv;
        if (q > 0) F[row + sx]! += w * q * q * q;
      }
    }
  };
  /** As splatOne, plus the copies across the edges when the board wraps. */
  const splat = (x: number, y: number, r: number, w = 1) => {
    splatOne(x, y, r, w);
    if (!wrap) return;
    // On a tiny board a lump can be near both edges at once, so check each side separately.
    const near = r + 0.5;
    const xs = [x];
    const ys = [y];
    if (x < near) xs.push(x + cols);
    if (x > cols - near) xs.push(x - cols);
    if (y < near) ys.push(y + rows);
    if (y > rows - near) ys.push(y - rows);
    for (const wy of ys) for (const wx of xs) if (wx !== x || wy !== y) splatOne(wx, wy, r, w);
  };

  /** A block's samples: columns i0..i1 and rows j0..j1, inclusive. */
  const range = (b: number) => {
    const bx = b % BW;
    const by = (b / BW) | 0;
    return { i0: bx * sub, i1: Math.min(W - 1, (bx + 1) * sub), j0: by * sub, j1: Math.min(H - 1, (by + 1) * sub) };
  };

  for (let col = 0; col < colours; col++) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const s = size[i]!;
        if (s <= MIN_SIZE || colour[i] !== col) continue;
        splat(x + 0.5, y + 0.5, reach * s);
        const lump = blockLump(g, x, y);
        if (lump > 0) splat(x + 1, y + 1, BLOCK_LUMP_REACH, lump);
      }
    }
    if (!blocks.length) continue;

    // Marching squares over the touched blocks. Edge keys: 2·v for the edge right of vertex v,
    // 2·v + 1 for the edge below it.
    const point = (k: number, a: number, b: number) => {
      if (nbA[k] !== -1) return k;
      const v = k >> 1;
      const t = (T - a) / (b - a);
      px[k] = (v % W) + (k & 1 ? 0 : t);
      py[k] = ((v / W) | 0) + (k & 1 ? t : 0);
      return k;
    };
    const link = (a: number, b: number) => {
      if (nbA[a] === -1) { nbA[a] = b; keys.push(a); } else nbB[a] = b;
      if (nbA[b] === -1) { nbA[b] = a; keys.push(b); } else nbB[b] = a;
    };
    for (const b of blocks) {
      const { i0, i1, j0, j1 } = range(b);
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const v = j * W + i;
          const tl = F[v]!, tr = F[v + 1]!, br = F[v + W + 1]!, bl = F[v + W]!;
          const cs = (tl >= T ? 8 : 0) | (tr >= T ? 4 : 0) | (br >= T ? 2 : 0) | (bl >= T ? 1 : 0);
          if (cs === 0 || cs === 15) continue;
          const top = () => point(2 * v, tl, tr);
          const bottom = () => point(2 * (v + W), bl, br);
          const left = () => point(2 * v + 1, tl, bl);
          const right = () => point(2 * (v + 1) + 1, tr, br);
          switch (cs) {
            case 1: case 14: link(left(), bottom()); break;
            case 2: case 13: link(bottom(), right()); break;
            case 3: case 12: link(left(), right()); break;
            case 4: case 11: link(top(), right()); break;
            case 6: case 9: link(top(), bottom()); break;
            case 7: case 8: link(left(), top()); break;
            // Saddles: the middle decides whether the two inside corners connect.
            case 5:
              if ((tl + tr + br + bl) / 4 >= T) { link(left(), top()); link(bottom(), right()); }
              else { link(top(), right()); link(left(), bottom()); }
              break;
            case 10:
              if ((tl + tr + br + bl) / 4 >= T) { link(top(), right()); link(left(), bottom()); }
              else { link(left(), top()); link(bottom(), right()); }
              break;
          }
        }
      }
    }

    // Walk each loop and draw it.
    const sink = sinkFor(col);
    const toX = (s: number) => ox + (s / sub - PAD) * cell;
    const toY = (s: number) => oy + (s / sub - PAD) * cell;
    for (const start of keys) {
      if (nbA[start] === -2) continue;
      loop.length = 0;
      let prev = -1;
      let cur = start;
      while (cur >= 0 && nbA[cur] !== -2) {
        loop.push(cur);
        const next = nbA[cur] !== prev ? nbA[cur]! : nbB[cur]!;
        nbA[cur] = -2;
        prev = cur;
        cur = next;
      }
      const n = loop.length;
      if (n < 3) continue;
      const P = (m: number) => loop[m % n]!;
      const mx = (m: number) => toX((px[P(m)]! + px[P(m + 1)]!) / 2);
      const my = (m: number) => toY((py[P(m)]! + py[P(m + 1)]!) / 2);
      sink.moveTo(mx(0), my(0));
      for (let m = 1; m <= n; m++) sink.quadraticCurveTo(toX(px[P(m)]!), toY(py[P(m)]!), mx(m), my(m));
      sink.closePath();
    }

    // Clean up only what this colour touched.
    for (const k of keys) { nbA[k] = -1; nbB[k] = -1; }
    keys.length = 0;
    for (const b of blocks) {
      marked[b] = 0;
      const { i0, i1, j0, j1 } = range(b);
      for (let j = j0; j <= j1; j++) F.fill(0, j * W + i0, j * W + i1 + 1);
    }
    blocks.length = 0;
  }
}
