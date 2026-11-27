import { describe, expect, it } from 'vitest';
import { CRITTER_AGE, creaseColour, findSpots, positionHash } from '../src/critters';
import { Life, parseRule } from '../src/life';

const CONWAY = parseRule('B3/S23')!;

/** A board full of still 2×2 blocks, three cells apart, aged `gens` generations. */
function blocks(gens: number): Life {
  const life = new Life(24, 24);
  for (let by = 1; by < 22; by += 4) {
    for (let bx = 1; bx < 22; bx += 4) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) life.setCell((by + dy) * 24 + bx + dx, 1);
    }
  }
  for (let g = 0; g < gens; g++) life.step(CONWAY, false);
  return life;
}

describe('positionHash', () => {
  it('is stable and in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const h = positionHash(i % 17, i * 3);
      expect(h).toBe(positionHash(i % 17, i * 3));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});

describe('findSpots', () => {
  it('ignores cells younger than the critter age', () => {
    expect(findSpots(blocks(CRITTER_AGE - 2), true)).toEqual([]);
  });

  it('puts critters only on old live cells, and some blocks get a pair of eyes', () => {
    const life = blocks(CRITTER_AGE + 2);
    const spots = findSpots(life, true);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.some((s) => s.kind === 'pair')).toBe(true);
    for (const s of spots) for (const i of s.cells) expect(life.ages[i]).toBeGreaterThanOrEqual(CRITTER_AGE);
    // No cell carries two critters.
    const cells = spots.flatMap((s) => s.cells);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('gives the same answer every time, and no pairs when pairs are off', () => {
    const life = blocks(CRITTER_AGE + 2);
    expect(findSpots(life, true)).toEqual(findSpots(life, true));
    expect(findSpots(life, false).every((s) => s.kind === 'single')).toBe(true);
  });
});

describe('creaseColour', () => {
  const lightness = (hsl: string) => Number(/ ([\d.]+)%\)$/.exec(hsl)![1]);
  it('deepens ordinary colours and lightens near-black ones', () => {
    expect(lightness(creaseColour('#3E9A47'))).toBeLessThan(42);
    expect(lightness(creaseColour('#232323'))).toBeGreaterThan(14);
  });
});
