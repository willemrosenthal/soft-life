import { describe, expect, it } from 'vitest';
import { parseRule } from '../src/life';
import { QuietWatcher, SURPRISES, TrendWatcher, formatRule, mutateRule, nextRuleName, parseSavedRules, pickSurprise, ruleName, seededRandom } from '../src/rules';

/** Plays back the given numbers, then repeats the last one. */
const sequence = (...xs: number[]) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]!; };

describe('formatRule', () => {
  it('writes digits in order, the same way every time', () => {
    expect(formatRule(parseRule('b63/s32')!)).toBe('B36/S23');
    expect(formatRule(parseRule('B2/S')!)).toBe('B2/S');
  });
});

describe('mutateRule', () => {
  it('flips one switch, leaving the original alone', () => {
    const conway = parseRule('B3/S23')!;
    // 0.9: one flip. 0: the first switch, born with 1.
    expect(formatRule(mutateRule(conway, sequence(0.9, 0)))).toBe('B13/S23');
    // 0.9: one flip. 0.99: the last switch, survive with 8.
    expect(formatRule(mutateRule(conway, sequence(0.9, 0.99)))).toBe('B3/S238');
    expect(formatRule(conway)).toBe('B3/S23');
  });

  it('can flip two, and never switches on born with 0', () => {
    expect(formatRule(mutateRule(parseRule('B3/S23')!, sequence(0.1, 2 / 17, 10 / 17)))).toBe('B/S3');
    const random = seededRandom('test');
    let rule = parseRule('B3/S23')!;
    for (let k = 0; k < 500; k++) {
      rule = mutateRule(rule, random);
      expect(rule.born.has(0)).toBe(false);
      expect(parseRule(formatRule(rule))).not.toBeNull();
    }
  });
});

describe('pickSurprise', () => {
  it('never offers the rule already in use', () => {
    for (const r of SURPRISES) {
      for (const x of [0, 0.5, 0.999]) expect(pickSurprise(r.rule, () => x).rule).not.toBe(r.rule);
    }
  });
});

describe('seededRandom', () => {
  it('repeats for the same text and differs for different text', () => {
    const a = seededRandom('B3/S23');
    const b = seededRandom('B3/S23');
    const c = seededRandom('B36/S23');
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect([c(), c(), c()]).not.toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

describe('TrendWatcher', () => {
  it('reads a board as lively, settled, filling up or dead', () => {
    const w = new TrendWatcher();
    expect(w.update([1, 0, 0, 0])).toBe('lively');
    expect(w.update([0, 1, 0, 0])).toBe('lively');
    expect(w.update([1, 0, 0, 0])).toBe('settled'); // back to a board seen two generations ago
    expect(w.update([1, 1, 1, 0])).toBe('full');
    expect(w.update([0, 0, 0, 0])).toBe('dead');
    w.reset();
    expect(w.update([1, 0, 0, 0])).toBe('lively');
  });
});

describe('parseSavedRules', () => {
  it('reads back saved rules', () => {
    const saved = [{ id: 'a', name: 'Coral reef', rule: 'B3/S45678' }, { id: 'b', name: 'Mine', rule: 'B36/S23' }];
    expect(parseSavedRules(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('drops entries that make no sense and tidies the rest', () => {
    expect(parseSavedRules(null)).toEqual([]);
    expect(parseSavedRules({ id: 'a' })).toEqual([]);
    expect(parseSavedRules([
      null,
      { id: 'a', name: 'Bad rule', rule: 'B9/S1' },
      { id: 'b', name: 'Flashing', rule: 'B0/S1' },
      { id: 'c', name: '   ', rule: 'B3/S23' },
      { id: 'd', name: '  Spaced  ', rule: 'b63/s32' },
      { id: 'd', name: 'Same id again', rule: 'B3/S23' },
      { id: 'e', name: 'x'.repeat(50), rule: 'B2/S' },
    ])).toEqual([
      { id: 'd', name: 'Spaced', rule: 'B36/S23' },
      { id: 'e', name: 'x'.repeat(32), rule: 'B2/S' },
    ]);
  });
});

describe('naming', () => {
  it('finds a free "My rule" name', () => {
    expect(nextRuleName([])).toBe('My rule 1');
    expect(nextRuleName([{ id: 'a', name: 'My rule 2', rule: 'B3/S23' }])).toBe('My rule 3');
  });

  it("prefers the player's own name, then a known one", () => {
    const saved = [{ id: 'a', name: 'Classic', rule: 'B3/S23' }];
    expect(ruleName('B3/S23', saved)).toBe('Classic');
    expect(ruleName('B3/S23', [])).toBe("Conway's Life");
    expect(ruleName('B3/S45678', [])).toBe('Coral');
    expect(ruleName('B1/S1', [])).toBeNull();
  });
});

describe('QuietWatcher', () => {
  const blinker = (phase: number) => { const b = new Array(100).fill(1, 0, 40); b[50 + phase] = 1; return b; };

  it('calls for new soup once a board has settled for long enough', () => {
    const w = new QuietWatcher(3);
    const calls = [0, 1, 0, 1, 0, 1].map((k) => w.update(blinker(k)));
    // Phases repeat from the third generation; three quiet ones in a row makes the fifth call true.
    expect(calls).toEqual([false, false, false, false, true, true]);
    w.reset();
    expect(w.update(blinker(0))).toBe(false);
  });

  it('counts a nearly empty or dead board as quiet, and any lively generation starts the count again', () => {
    const w = new QuietWatcher(2, 0.1);
    const sparse = new Array(100).fill(0); sparse[7] = 1;
    expect(w.update(sparse)).toBe(false);
    expect(w.update(new Array(100).fill(0))).toBe(true);
    const lively = (k: number) => Array.from({ length: 100 }, (_, i) => ((i * 7 + k) % 5 === 0 ? 1 : 0));
    w.reset();
    expect([w.update(sparse), w.update(lively(1)), w.update(sparse)]).toEqual([false, false, false]);
  });
});
