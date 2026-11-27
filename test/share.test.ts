import { describe, expect, it } from 'vitest';
import { Life } from '../src/life';
import { decodeBoard, encodeBoard, sharedColony } from '../src/share';

describe('pattern links', () => {
  it('round-trips a board, cropped to its live cells, colonies and rule included', () => {
    const life = new Life(10, 10);
    life.setCell(2 * 10 + 3, 1);
    life.setCell(2 * 10 + 4, 1);
    life.setCell(4 * 10 + 6, 3);
    const fragment = encodeBoard(life, 'B36/S23')!;
    expect(decodeBoard(`#${fragment}`)).toEqual({ cells: ['aa..', '....', '...c'], rule: 'B36/S23' });
  });

  it('places a decoded pattern with the right colonies', () => {
    const life = new Life(4, 3);
    life.place(decodeBoard('p=a.f')!.cells, sharedColony);
    // 3 wide on a 4×3 board: centred in the middle row, starting at the left.
    expect([...life.cur.slice(4, 8)]).toEqual([1, 0, 6, 0]);
  });

  it('has nothing to share for an empty board', () => {
    expect(encodeBoard(new Life(5, 5), 'B3/S23')).toBeNull();
  });

  it('rejects malformed, oversized or missing patterns, and ignores a bad rule', () => {
    expect(decodeBoard('')).toBeNull();
    expect(decodeBoard('#p=3x')).toBeNull();
    expect(decodeBoard('#p=0a')).toBeNull();
    expect(decodeBoard('#p=99999a')).toBeNull();
    expect(decodeBoard('#p=2a&r=nonsense')).toEqual({ cells: ['aa'], rule: null });
  });
});
