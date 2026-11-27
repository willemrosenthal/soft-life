import { COLONIES, parseRule, type Life } from './life';

/**
 * Pattern links: the live cells, cropped to their bounding box, in the URL's #fragment.
 * Each row is run-length encoded ("3.2a" = three empty cells, then two cells of colony a), rows
 * joined by "!", colonies written a–f. The rule rides along: #p=…&r=B3/S23.
 */

const LETTERS = 'abcdef'.slice(0, COLONIES);
/** Limits on what a link may ask for, so a hand-made link can't freeze the page. */
const MAX_SIDE = 400;
const MAX_CELLS = 40_000;

export interface SharedPattern {
  /** Rows of '.' (empty) and 'a'–'f' (a live cell in that colony). */
  cells: string[];
  /** The rule, if the link names a valid one. */
  rule: string | null;
}

/** The #fragment (without "#") for the current board, or null when the board is empty. */
export function encodeBoard(life: Life, rule: string): string | null {
  const { cols, rows, cur } = life;
  let x0 = cols, y0 = rows, x1 = -1, y1 = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!cur[y * cols + x]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;

  const lines: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let line = '';
    let run = '';
    let count = 0;
    const flush = () => { if (count) line += (count > 1 ? count : '') + run; };
    for (let x = x0; x <= x1; x++) {
      const v = cur[y * cols + x]!;
      const ch = v ? LETTERS[v - 1]! : '.';
      if (ch === run) count++;
      else { flush(); run = ch; count = 1; }
    }
    if (run !== '.') flush(); // trailing empties add nothing
    lines.push(line);
  }
  return new URLSearchParams({ p: lines.join('!'), r: rule }).toString();
}

/** Read a #fragment back. Null when it has no pattern or the pattern is malformed or too big. */
export function decodeBoard(fragment: string): SharedPattern | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const p = params.get('p');
  if (!p) return null;

  const cells: string[] = [];
  let total = 0;
  for (const line of p.split('!')) {
    if (!/^(\d*[.a-f])*$/.test(line)) return null;
    let row = '';
    for (const [, n, ch] of line.matchAll(/(\d*)([.a-f])/g)) {
      const count = n ? Number(n) : 1;
      total += count;
      if (count < 1 || row.length + count > MAX_SIDE || total > MAX_CELLS) return null;
      row += ch!.repeat(count);
    }
    cells.push(row);
  }
  if (cells.length > MAX_SIDE) return null;
  const width = Math.max(...cells.map((r) => r.length));
  if (width === 0) return null;

  const r = params.get('r');
  return { cells: cells.map((row) => row.padEnd(width, '.')), rule: r && parseRule(r) ? r : null };
}

/** For Life.place: '.' → empty, 'a'–'f' → colonies 1–6. */
export function sharedColony(ch: string): number {
  return LETTERS.indexOf(ch) + 1;
}
