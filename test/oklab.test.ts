import { describe, expect, it } from 'vitest';
import { hexToOklab } from '../src/oklab';

describe('hexToOklab', () => {
  it('matches reference values', () => {
    const near = (hex: string, want: number[]) => hexToOklab(hex).forEach((v, k) => expect(v).toBeCloseTo(want[k]!, 3));
    near('#FFFFFF', [1, 0, 0]);
    near('#000000', [0, 0, 0]);
    near('#FF0000', [0.628, 0.2249, 0.1258]);
    near('#0000FF', [0.452, -0.0325, -0.3115]);
  });
});
