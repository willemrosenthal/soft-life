import { describe, expect, it } from 'vitest';
import { countList, generation } from '../src/demos';
import { Life, parseRule } from '../src/life';
import { seededRandom } from '../src/rules';

describe('countList', () => {
  it('reads neighbour counts the way a sentence would', () => {
    expect(countList(new Set([3]))).toBe('3');
    expect(countList(new Set([3, 2]))).toBe('2 or 3');
    expect(countList(new Set([7, 3, 6]))).toBe('3, 6 or 7');
    expect(countList(new Set())).toBe('nothing');
  });
});

describe('generation', () => {
  it('counts neighbours, with spots past the edge counting as empty', () => {
    // A blinker lying flat in a 5 × 3 box.
    const cells = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0];
    const { counts, next } = generation(cells, 5, 3, parseRule('B3/S23')!);
    expect([...counts]).toEqual([1, 2, 3, 2, 1, 1, 1, 2, 1, 1, 1, 2, 3, 2, 1]);
    expect([...next]).toEqual([0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
  });

  it('agrees with the simulation, so the player shows what the board would do', () => {
    for (const code of ['B3/S23', 'B36/S23', 'B2/S', 'B3678/S34678']) {
      const rule = parseRule(code)!;
      const life = new Life(9, 7);
      life.soup(seededRandom(code));
      for (let k = 0; k < 5; k++) {
        const { next } = generation(life.cur, life.cols, life.rows, rule);
        life.step(rule, false);
        expect([...life.cur].map((v) => (v ? 1 : 0)), code).toEqual([...next]);
      }
    }
  });
});
