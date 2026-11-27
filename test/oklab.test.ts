import { describe, expect, it } from 'vitest';
import { contrast, difference, hexToLch, hexToOklab, lchToHex } from '../src/oklab';

describe('hexToOklab', () => {
  it('matches reference values', () => {
    const near = (hex: string, want: number[]) => hexToOklab(hex).forEach((v, k) => expect(v).toBeCloseTo(want[k]!, 3));
    near('#FFFFFF', [1, 0, 0]);
    near('#000000', [0, 0, 0]);
    near('#FF0000', [0.628, 0.2249, 0.1258]);
    near('#0000FF', [0.452, -0.0325, -0.3115]);
  });
});

describe('colour maths', () => {
  it('goes to OKLCH and back without drifting', () => {
    for (const hex of ['#3E9A47', '#F0CF3A', '#101317', '#FFFFFF', '#765BA7']) expect(lchToHex(hexToLch(hex))).toBe(hex);
  });
  it('pulls colours a screen cannot show back into range, keeping lightness', () => {
    const out = lchToHex({ l: 0.7, c: 0.4, h: 140 });
    expect(out).toMatch(/^#[0-9A-F]{6}$/);
    expect(hexToLch(out).l).toBeCloseTo(0.7, 2);
  });
  it('measures difference and contrast', () => {
    expect(difference('#3E9A47', '#3E9A47')).toBe(0);
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21);
  });
});
