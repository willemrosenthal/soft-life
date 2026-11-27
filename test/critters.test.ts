import { describe, expect, it } from 'vitest';
import { CRITTER_AGE, Critters, creaseColour, findSpots, positionHash } from '../src/critters';
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

describe('Critters', () => {
  /** A canvas context that accepts every call and draws nothing. */
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
  const place = { cell: 10, ox: 0, oy: 0 };

  /** Draw frames 16 ms apart for `seconds`, the way the board's loop would. */
  function run(critters: Critters, life: Life, seconds: number, start = { now: 0 }): void {
    for (let s = 0; s < seconds; s += 0.016) {
      start.now += 16;
      critters.draw(ctx, { life, place, now: start.now, iris: '#5DB6F2', ink: '#000', pairs: true, skinOf: () => '#3E9A47', sizeOf: () => 1 });
    }
  }

  it('keeps a critter while its cell melts, and drops it once the melt is over', () => {
    const life = blocks(CRITTER_AGE + 2);
    const critters = new Critters();
    run(critters, life, 0.1);
    const before = critters.eyes().length;
    expect(before).toBeGreaterThan(0);

    // A generation in which every cell dies: the critters stay to close their eyes...
    life.prev.set(life.cur);
    life.cur.fill(0);
    life.gen++;
    run(critters, life, 0.1);
    expect(critters.eyes().length).toBe(before);

    // ...and are gone by the next one.
    life.prev.fill(0);
    life.gen++;
    run(critters, life, 0.1);
    expect(critters.eyes()).toEqual([]);
    expect(critters.active).toBe(false); // so the board stops redrawing every frame
  });

  it('drops a critter at once when its cell is erased', () => {
    const life = blocks(CRITTER_AGE + 2);
    const critters = new Critters();
    run(critters, life, 0.1);
    life.clear();
    run(critters, life, 0.016);
    expect(critters.eyes()).toEqual([]);
  });

  it('old critters fall asleep, and a tap keeps them awake for a while', () => {
    const life = blocks(CRITTER_AGE + 2);
    life.ages.forEach((a, i) => { if (a) life.ages[i] = 1000; });
    const critters = new Critters();
    const clock = { now: 0 };
    run(critters, life, 1, clock);
    expect(critters.eyes().every((e) => e.asleep)).toBe(true);

    for (let y = 2; y < 24; y += 4) for (let x = 2; x < 24; x += 4) critters.poke(x, y);
    run(critters, life, 2, clock);
    expect(critters.eyes().some((e) => e.asleep)).toBe(false);
  });
});

describe('creaseColour', () => {
  const lightness = (hsl: string) => Number(/ ([\d.]+)%\)$/.exec(hsl)![1]);
  it('deepens ordinary colours and lightens near-black ones', () => {
    expect(lightness(creaseColour('#3E9A47'))).toBeLessThan(42);
    expect(lightness(creaseColour('#232323'))).toBeGreaterThan(14);
  });
});
