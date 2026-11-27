import { describe, expect, it } from 'vitest';
import { mixedLumpFor } from '../src/melt';

describe('mixedLumpFor', () => {
  it('fills at 0, leaves the field alone at 50, and opens gaps gently past that', () => {
    expect(mixedLumpFor(0)).toBe(1);
    expect(mixedLumpFor(50)).toBeCloseTo(0);
    expect(mixedLumpFor(75)).toBeLessThan(0);
    expect(mixedLumpFor(100)).toBeLessThan(mixedLumpFor(75));
    expect(mixedLumpFor(100)).toBeGreaterThan(-0.5);
  });

  it('never jumps as the slider moves', () => {
    for (let g = 0; g < 100; g++) expect(Math.abs(mixedLumpFor(g + 1) - mixedLumpFor(g))).toBeLessThan(0.025);
  });
});
