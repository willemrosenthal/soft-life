import { describe, expect, it } from 'vitest';
import { countList } from '../src/demos';

describe('countList', () => {
  it('reads neighbour counts the way a sentence would', () => {
    expect(countList(new Set([3]))).toBe('3');
    expect(countList(new Set([3, 2]))).toBe('2 or 3');
    expect(countList(new Set([7, 3, 6]))).toBe('3, 6 or 7');
    expect(countList(new Set())).toBe('nothing');
  });
});
