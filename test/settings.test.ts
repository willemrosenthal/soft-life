import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, formatSpeed, parseSettings } from '../src/settings';

describe('parseSettings', () => {
  it('reads back saved settings', () => {
    const saved = { ...DEFAULT_SETTINGS, palette: 'night', style: 'pixels', rule: 'B36/S23', speed: 20, labSpeed: 1 / 2, density: 40, stickiness: 80, melt: 0, gaps: 90, brushSize: 3, railHidden: true, critterAbundance: 90 };
    expect(parseSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('keeps a custom theme, even one that has since been deleted (the app falls back to Meadow then)', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, palette: 'custom:abc' }).palette).toBe('custom:abc');
  });

  it('falls back to defaults for anything missing, unknown or out of range', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ palette: 'toString', style: 'blobs', rule: 'B9/S1', speed: 99, labSpeed: 0.25, wrap: 'yes', density: 8, stickiness: 101, melt: -1, gaps: 'wide', brushSize: 2.5, critterAbundance: 101 })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('formatSpeed', () => {
  it('reads as steps a second, or seconds a step when slow', () => {
    expect(formatSpeed(8)).toBe('8/s');
    expect(formatSpeed(1 / 2)).toBe('every 2s');
    expect(formatSpeed(2 / 3)).toBe('every 1.5s');
  });
});
