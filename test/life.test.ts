import { describe, expect, it } from 'vitest';
import { Life, parseRule } from '../src/life';

const CONWAY = parseRule('B3/S23')!;

/** Board as text: '.' dead, digit = colony. */
function show(life: Life): string[] {
  const rows: string[] = [];
  for (let y = 0; y < life.rows; y++) {
    let r = '';
    for (let x = 0; x < life.cols; x++) r += life.cur[y * life.cols + x] || '.';
    rows.push(r);
  }
  return rows;
}
function board(rows: string[]): Life {
  const life = new Life(rows[0]!.length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') life.setCell(y * life.cols + x, Number(ch)); }));
  return life;
}

describe('parseRule', () => {
  it('reads B/S notation', () => {
    expect(parseRule('B36/S23')).toEqual({ born: new Set([3, 6]), survive: new Set([2, 3]) });
    expect(parseRule('b2/s')).toEqual({ born: new Set([2]), survive: new Set() });
  });
  it('rejects anything else', () => {
    expect(parseRule('B9/S23')).toBeNull();
    expect(parseRule('B03/S23')).toBeNull(); // born with 0 makes the whole board flash
    expect(parseRule('23/3')).toBeNull();
    expect(parseRule('')).toBeNull();
  });
});

describe('Life.step', () => {
  it('flips a blinker back and forth', () => {
    const life = board(['.....', '..1..', '..1..', '..1..', '.....']);
    life.step(CONWAY, false);
    expect(show(life)).toEqual(['.....', '.....', '.111.', '.....', '.....']);
    life.step(CONWAY, false);
    expect(show(life)).toEqual(['.....', '..1..', '..1..', '..1..', '.....']);
    expect(life.gen).toBe(2);
  });

  it('wraps around the edges only when asked', () => {
    const edge = () => board(['1....', '1....', '1....', '.....', '.....']);
    const wrapped = edge();
    wrapped.step(CONWAY, true);
    expect(show(wrapped)[1]).toBe('11..1');
    const walled = edge();
    walled.step(CONWAY, false);
    expect(show(walled)[1]).toBe('11...');
  });

  it('gives a newborn the colony most of its neighbours belong to', () => {
    const life = board(['.....', '.2.2.', '.....', '..1..', '.....']);
    life.step(CONWAY, false);
    expect(life.cur[2 * 5 + 2]).toBe(2);
  });

  it('counts how long cells have lived and keeps the previous generation', () => {
    const life = board(['....', '.11.', '.11.', '....']);
    life.step(CONWAY, false);
    life.step(CONWAY, false);
    expect(life.ages[5]).toBe(3);
    expect([...life.prev]).toEqual([...life.cur]);
  });
});

describe('Life.resize', () => {
  it('keeps the pattern centred when rows are added or removed', () => {
    const life = board(['...', '.1.', '...']);
    life.resize(3, 7);
    expect(show(life)).toEqual(['...', '...', '...', '.1.', '...', '...', '...']);
  });

  it('puts every cell back after growing and shrinking by an odd amount', () => {
    const life = board(['1..', '.2.', '..3', '...']);
    const before = show(life);
    life.resize(3, 7);
    life.resize(3, 4);
    expect(show(life)).toEqual(before);
  });
});

describe('Life.place', () => {
  it('clears the board and centres the pattern', () => {
    const life = board(['1....', '.....', '.....', '.....', '....1']);
    life.gen = 9;
    life.place(['OO', 'O.'], (ch) => (ch === 'O' ? 4 : 0));
    expect(show(life)).toEqual(['.....', '.44..', '.4...', '.....', '.....']);
    expect(life.gen).toBe(0);
  });

  it('cuts off what does not fit', () => {
    const life = new Life(2, 2);
    life.place(['OOOO'], () => 1);
    expect(life.population()).toBe(2);
  });
});

describe('Life.soup', () => {
  it('fills about 40% of the board', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const life = new Life(40, 40);
    life.soup(random);
    expect(life.population() / 1600).toBeGreaterThan(0.3);
    expect(life.population() / 1600).toBeLessThan(0.5);
  });
});
