import { describe, expect, it } from 'vitest';
import { RADIUS, blockLump, diagonalLump, diagonalStrand, strandLevel, traceSlime, type PathSink } from '../src/slime';

const CELL = 24;

/** Records each closed loop as its list of curve endpoints. */
class Recorder implements PathSink {
  loops: [number, number][][] = [];
  moveTo(x: number, y: number) { this.loops.push([[x, y]]); }
  quadraticCurveTo(_cx: number, _cy: number, x: number, y: number) { this.loops.at(-1)!.push([x, y]); }
  closePath() {}
}

/** Trace a board given as rows of characters: '.' empty, digits are colours at full size. */
function trace(rows: string[], opts: { stickiness?: number; diagonals?: number; wrap?: boolean; sizes?: Record<number, number>; colours?: number } = {}) {
  const cols = rows[0]!.length;
  const size = new Float32Array(cols * rows.length);
  const colour = new Int8Array(cols * rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    size[y * cols + x] = 1;
    colour[y * cols + x] = Number(ch);
  }));
  for (const [i, s] of Object.entries(opts.sizes ?? {})) size[Number(i)] = s;
  const n = opts.colours ?? 1;
  const sinks = Array.from({ length: n }, () => new Recorder());
  traceSlime({ cols, rows: rows.length, cell: CELL, ox: 0, oy: 0, size, colour, wrap: opts.wrap ?? false }, n, opts.stickiness ?? 50, (k) => sinks[k]!, opts.diagonals ?? 0);
  return sinks;
}

describe('traceSlime', () => {
  it('draws a lone cell as a circle of the usual radius', () => {
    const [s] = trace(['...', '.0.', '...']);
    expect(s!.loops).toHaveLength(1);
    for (const [x, y] of s!.loops[0]!) expect(Math.abs(Math.hypot(x - 1.5 * CELL, y - 1.5 * CELL) - RADIUS * CELL)).toBeLessThan(0.05 * CELL);
  });

  it('joins side-by-side cells into one blob, at any stickiness', () => {
    for (const stickiness of [0, 50, 100]) {
      expect(trace(['....', '.00.', '....'], { stickiness })[0]!.loops).toHaveLength(1);
      expect(trace(['...', '.0.', '.0.', '...'], { stickiness })[0]!.loops).toHaveLength(1);
    }
  });

  it('keeps diagonal neighbours apart, at any stickiness', () => {
    for (const stickiness of [0, 50, 100]) expect(trace(['....', '.0..', '..0.', '....'], { stickiness })[0]!.loops).toHaveLength(2);
  });

  it('fills a 2×2 block with no hole in the middle', () => {
    for (const stickiness of [0, 50, 100]) expect(trace(['....', '.00.', '.00.', '....'], { stickiness })[0]!.loops).toHaveLength(1);
  });

  it('leaves a hole inside a ring', () => {
    expect(trace(['.....', '.000.', '.0.0.', '.000.', '.....'])[0]!.loops).toHaveLength(2);
  });

  it('pinches off a neighbour that is nearly gone, and joins one that is nearly full', () => {
    const board = ['....', '.00.', '....'];
    expect(trace(board, { sizes: { 6: 0.15 } })[0]!.loops).toHaveLength(2);
    expect(trace(board, { sizes: { 6: 0.9 } })[0]!.loops).toHaveLength(1);
  });

  it('does not join diagonal cells while the other two of their block are tiny', () => {
    // Cells 5 and 10 full, 6 and 9 just appearing: four separate lumps.
    for (const stickiness of [0, 50, 100]) expect(trace(['....', '.00.', '.00.', '....'], { stickiness, sizes: { 6: 0.1, 9: 0.1 } })[0]!.loops).toHaveLength(4);
  });

  it('never joins different colours', () => {
    const [a, b] = trace(['....', '.01.', '....'], { colours: 2 });
    expect(a!.loops).toHaveLength(1);
    expect(b!.loops).toHaveLength(1);
  });

  it('reaches across the edges when wrapping', () => {
    const board = ['.....', '0...0', '.....'];
    const minX = (wrap: boolean) => Math.min(...trace(board, { wrap })[0]!.loops.flat().map(([x]) => x));
    expect(minX(false)).toBeGreaterThan(0);
    expect(minX(true)).toBeLessThan(-0.5 * CELL);
  });

  it('gives the same result when called again, even after a bigger board (scratch is cleaned up)', () => {
    const board = ['.....', '.00..', '.0.0.', '.....'];
    const first = trace(board)[0]!.loops;
    trace(Array.from({ length: 12 }, () => '0.00.0.00.00'), { wrap: true });
    expect(trace(board)[0]!.loops).toEqual(first);
  });

  it('keeps outlines closed whatever stickiness it is given', () => {
    for (const stickiness of [-50, 500]) {
      for (const loop of trace(['.....', '.00..', '..0..', '.....'], { stickiness })[0]!.loops) {
        loop.forEach(([x, y], k) => {
          const [px, py] = loop[k - 1] ?? loop.at(-1)!;
          expect(Math.hypot(x - px, y - py)).toBeLessThan(0.5 * CELL);
        });
      }
    }
  });

  it('wraps both ways on a board so small a cell is near both edges', () => {
    // One row: the cell is near the top and bottom edges at once, so it gets a copy above and
    // below, and the outline is symmetric about its row.
    const ys = trace(['0..'], { wrap: true })[0]!.loops.flat().map(([, y]) => y);
    expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(CELL, 0);
  });
});

describe('blockLump', () => {
  const layer = (size: number[], colour: number[], wrap = false) => ({ cols: 2, rows: 2, size, colour, wrap });

  it('is full for a grown block of one colour, and fades in as the block grows', () => {
    expect(blockLump(layer([1, 1, 1, 1], [0, 0, 0, 0]), 0, 0)).toBe(1);
    expect(blockLump(layer([1, 1, 1, 0.8], [0, 0, 0, 0]), 0, 0)).toBeCloseTo(0.5);
    expect(blockLump(layer([1, 1, 1, 0.5], [0, 0, 0, 0]), 0, 0)).toBe(0);
  });

  it('is 0 for mixed colours unless colour is ignored, and 0 past the edge unless wrapping', () => {
    expect(blockLump(layer([1, 1, 1, 1], [0, 0, 0, 1]), 0, 0)).toBe(0);
    expect(blockLump(layer([1, 1, 1, 1], [0, 0, 0, 1]), 0, 0, false)).toBe(1);
    expect(blockLump(layer([1, 1, 1, 1], [0, 0, 0, 0]), 1, 1)).toBe(0);
    expect(blockLump(layer([1, 1, 1, 1], [0, 0, 0, 0], true), 1, 1)).toBe(1);
  });
});

describe('diagonals', () => {
  const pair = ['....', '.0..', '..0.', '....'];
  const tub = ['.....', '..0..', '.0.0.', '..0..', '.....'];
  /** Width of the outline across the middle of the pair, in cells, along the line x + y = const. */
  const waist = (diagonals: number, stickiness = 50) => {
    const pts = trace(pair, { diagonals, stickiness })[0]!.loops.flat().map(([x, y]) => [x / CELL - 2, y / CELL - 2]);
    // Points near the perpendicular through the middle (2, 2): their spread along (1, -1).
    const across = pts.filter(([x, y]) => Math.abs(x! + y!) < 0.08).map(([x, y]) => (x! - y!) * Math.SQRT1_2);
    return across.length ? Math.max(...across) - Math.min(...across) : 0;
  };

  it('keeps diagonal neighbours apart at 0, and only leans them together at the very bottom', () => {
    expect(trace(pair, { diagonals: 0 })[0]!.loops).toHaveLength(2);
    expect(trace(pair, { diagonals: 3 })[0]!.loops).toHaveLength(2);
  });

  it('joins diagonal neighbours from low on the slider up, at any stickiness', () => {
    for (const stickiness of [0, 50, 100]) {
      for (const diagonals of [20, 50, 100]) expect(trace(pair, { diagonals, stickiness })[0]!.loops, `${stickiness} ${diagonals}`).toHaveLength(1);
    }
  });

  it('turns a tub into a ring', () => {
    expect(trace(tub)[0]!.loops).toHaveLength(4);
    expect(trace(tub, { diagonals: 50 })[0]!.loops).toHaveLength(2);
  });

  it('thickens the strand steadily, from a thread to about half a cell', () => {
    const w = [20, 50, 75, 100].map((d) => waist(d));
    for (let k = 1; k < w.length; k++) expect(w[k]!).toBeGreaterThan(w[k - 1]!);
    expect(w[0]!).toBeLessThan(0.22);
    expect(w[1]!).toBeGreaterThan(0.18);
    expect(w[1]!).toBeLessThan(0.34);
    expect(w[3]!).toBeGreaterThan(0.42);
    expect(w[3]!).toBeLessThan(0.58);
  });

  it('never joins different colours', () => {
    const [a, b] = trace(['....', '.0..', '..1.', '....'], { colours: 2, diagonals: 100 });
    expect(a!.loops).toHaveLength(1);
    expect(b!.loops).toHaveLength(1);
  });

  it('joins across the edges when wrapping', () => {
    const board = ['0...', '...0', '....'];
    expect(trace(board, { diagonals: 60 })[0]!.loops).toHaveLength(2);
    expect(trace(board, { diagonals: 60, wrap: true })[0]!.loops.length).toBeLessThan(trace(board, { wrap: true })[0]!.loops.length);
  });

  it('keeps outlines closed with the thickest strands at any stickiness', () => {
    for (const stickiness of [0, 100]) {
      for (const loop of trace(tub, { stickiness, diagonals: 100 })[0]!.loops) {
        loop.forEach(([x, y], k) => {
          const [px, py] = loop[k - 1] ?? loop.at(-1)!;
          expect(Math.hypot(x - px, y - py)).toBeLessThan(0.5 * CELL);
        });
      }
    }
  });
});

describe('diagonalStrand', () => {
  it('is off at 0 and never jumps as the slider moves', () => {
    expect(diagonalStrand(0)).toBeNull();
    for (let d = 1; d < 100; d++) {
      const a = diagonalStrand(d)!;
      const b = diagonalStrand(d + 1)!;
      expect(Math.abs(b.weight - a.weight)).toBeLessThan(0.04);
      expect(Math.abs(b.reach - a.reach)).toBeLessThan(0.004);
    }
  });
});

describe('strandLevel', () => {
  it('matches the same lump repeated closely along the line between the two cells', () => {
    const { reach, weight } = diagonalStrand(70)!;
    const n = 400;
    for (const dir of [1, -1] as const) {
      for (const [px, py] of [[0.5 * dir, 0.5], [0.3 * dir, 0.6], [0.7 * dir, 0.2], [0, 0], [1.2 * dir, 1.1], [0.5 * dir, 0.9]] as const) {
        let sum = 0;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const d2 = (px - dir * t) ** 2 + (py - t) ** 2;
          const q = 1 - d2 / (reach * reach);
          if (q > 0) sum += (weight / n) * q * q * q * ((k === 0 || k === n) ? 0.5 : 1);
        }
        expect(strandLevel(px, py, dir, reach, weight)).toBeCloseTo(sum, 4);
      }
    }
  });
});

describe('diagonalLump', () => {
  const layer = (size: number[], colour = [0, 0, 0, 0], wrap = false) => ({ cols: 2, rows: 2, size, colour, wrap });

  it('is full for two grown cells touching only at a corner, either way', () => {
    expect(diagonalLump(layer([1, 0, 0, 1]), 0, 0, 1)).toBe(1);
    expect(diagonalLump(layer([0, 1, 1, 0]), 1, 0, -1)).toBe(1);
  });

  it('fades in as a newborn grows, and out as a cell between them grows', () => {
    expect(diagonalLump(layer([1, 0, 0, 0.5]), 0, 0, 1)).toBe(0);
    expect(diagonalLump(layer([1, 0, 0, 0.8]), 0, 0, 1)).toBeGreaterThan(0);
    expect(diagonalLump(layer([1, 0.5, 0, 1]), 0, 0, 1)).toBeCloseTo(0.5);
    expect(diagonalLump(layer([1, 1, 0, 1]), 0, 0, 1)).toBe(0);
  });

  it('is 0 for different colours, and at the edge unless wrapping', () => {
    expect(diagonalLump(layer([1, 0, 0, 1], [0, 0, 0, 1]), 0, 0, 1)).toBe(0);
    expect(diagonalLump(layer([1, 0, 0, 1]), 1, 1, 1)).toBe(0);
    expect(diagonalLump(layer([1, 0, 0, 1], [0, 0, 0, 0], true), 1, 1, 1)).toBe(1);
  });
});
