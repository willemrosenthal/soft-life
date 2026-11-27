/**
 * The simulation: ordinary Life on a grid, plus two extras the drawing uses.
 *  - Colonies: every live cell belongs to one of COLONIES colonies (1..6). A newborn joins the
 *    colony most of its live neighbours belong to.
 *  - Ages: how many generations each cell has been alive, for the "age" colour mode and critters.
 * The previous generation is kept too, so the renderer can animate cells growing in and melting away.
 */

export const COLONIES = 6;

export interface Rule {
  /** Live-neighbour counts at which an empty cell comes alive. */
  readonly born: ReadonlySet<number>;
  /** Live-neighbour counts at which a live cell stays alive. */
  readonly survive: ReadonlySet<number>;
}

/**
 * "B3/S23" → Conway's rule. Null for anything that isn't B<digits>/S<digits> with digits 0–8.
 * "Born with 0" is refused too: every empty cell would come alive at once and the board would flash.
 */
export function parseRule(text: string): Rule | null {
  const m = /^B([1-8]*)\/S([0-8]*)$/i.exec(text.trim());
  if (!m) return null;
  return { born: new Set([...m[1]!].map(Number)), survive: new Set([...m[2]!].map(Number)) };
}

export class Life {
  cols: number;
  rows: number;
  /** 0 = dead, 1..COLONIES = alive in that colony. */
  cur: Uint8Array;
  prev: Uint8Array;
  ages: Uint16Array;
  prevAges: Uint16Array;
  gen = 0;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.cur = new Uint8Array(n);
    this.prev = new Uint8Array(n);
    this.ages = new Uint16Array(n);
    this.prevAges = new Uint16Array(n);
  }

  population(): number {
    let n = 0;
    for (const v of this.cur) if (v) n++;
    return n;
  }

  /**
   * Change the grid size, keeping the content centred: rows and columns are added or removed
   * evenly on both sides. Rounding toward zero means growing and then shrinking by the same
   * amount puts every cell back where it was.
   */
  resize(cols: number, rows: number): void {
    const { cols: oc, rows: or, cur: oldCur, ages: oldAges } = this;
    const dx = Math.trunc((cols - oc) / 2);
    const dy = Math.trunc((rows - or) / 2);
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.cur = new Uint8Array(n);
    this.ages = new Uint16Array(n);
    for (let y = 0; y < or; y++) {
      const ny = y + dy;
      if (ny < 0 || ny >= rows) continue;
      for (let x = 0; x < oc; x++) {
        const nx = x + dx;
        if (nx < 0 || nx >= cols) continue;
        this.cur[ny * cols + nx] = oldCur[y * oc + x]!;
        this.ages[ny * cols + nx] = oldAges[y * oc + x]!;
      }
    }
    this.prev = this.cur.slice();
    this.prevAges = this.ages.slice();
  }

  /** Advance one generation. With `wrap`, the grid is a torus; without it, cells past the edge count as dead. */
  step(rule: Rule, wrap: boolean): void {
    const { cols, rows } = this;
    this.prev.set(this.cur);
    this.prevAges.set(this.ages);
    const { prev, cur, ages } = this;
    const counts = new Uint8Array(COLONIES + 1);
    // Rotating which colony wins a tie keeps any one colony from always winning.
    const offset = this.gen % COLONIES;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let n = 0;
        counts.fill(0);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let xx = x + dx;
            let yy = y + dy;
            if (wrap) {
              xx = (xx + cols) % cols;
              yy = (yy + rows) % rows;
            } else if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) {
              continue;
            }
            const v = prev[yy * cols + xx]!;
            if (v) {
              n++;
              counts[v]!++;
            }
          }
        }
        const i = y * cols + x;
        const was = prev[i]!;
        if (was) {
          if (rule.survive.has(n)) {
            ages[i] = Math.min(65535, ages[i]! + 1);
          } else {
            cur[i] = 0;
            ages[i] = 0;
          }
        } else if (rule.born.has(n)) {
          let best = 1;
          let bestCount = -1;
          for (let j = 0; j < COLONIES; j++) {
            const colony = ((j + offset + x + y) % COLONIES) + 1;
            if (counts[colony]! > bestCount) {
              bestCount = counts[colony]!;
              best = colony;
            }
          }
          cur[i] = best;
          ages[i] = 1;
        }
      }
    }
    this.gen++;
  }

  /** Set one cell now, with no grow/melt animation (for drawing with a finger). */
  setCell(i: number, colony: number): void {
    if (i < 0 || i >= this.cur.length) return;
    this.cur[i] = this.prev[i] = colony;
    this.ages[i] = this.prevAges[i] = colony ? 1 : 0;
  }

  clear(): void {
    this.cur.fill(0);
    this.prev.fill(0);
    this.ages.fill(0);
    this.prevAges.fill(0);
    this.gen = 0;
  }

  /** A random start: patches of colour around a few seed points, about 40% alive. */
  soup(random: () => number = Math.random): void {
    const { cols, rows } = this;
    const seeds = Array.from({ length: 7 }, (_, k) => ({ x: random() * cols, y: random() * rows, colony: (k % COLONIES) + 1 }));
    this.clear();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let nearest = seeds[0]!;
        let best = Infinity;
        for (const s of seeds) {
          const d = (s.x - x) ** 2 + (s.y - y) ** 2;
          if (d < best) {
            best = d;
            nearest = s;
          }
        }
        if (random() < 0.4) this.setCell(y * cols + x, nearest.colony);
      }
    }
  }

  /**
   * Clear the board and put a pattern in the middle. `colonyOf` turns each character into a
   * colony (0 = empty). Anything that doesn't fit is cut off.
   */
  place(pattern: readonly string[], colonyOf: (ch: string) => number): void {
    this.clear();
    const h = pattern.length;
    const w = Math.max(0, ...pattern.map((r) => r.length));
    const x0 = Math.floor((this.cols - w) / 2);
    const y0 = Math.floor((this.rows - h) / 2);
    pattern.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const colony = colonyOf(row[x]!);
        const cx = x0 + x;
        const cy = y0 + y;
        if (colony && cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) this.setCell(cy * this.cols + cx, colony);
      }
    });
  }
}
