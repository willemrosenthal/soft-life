import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

describe('parseSettings', () => {
  it('reads back saved settings', () => {
    const saved = { ...DEFAULT_SETTINGS, palette: 'night', style: 'pixels', rule: 'B36/S23', speed: 20, density: 40, brushSize: 3, railHidden: true };
    expect(parseSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('falls back to defaults for anything missing, unknown or out of range', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ palette: 'toString', style: 'blobs', rule: 'B9/S1', speed: 99, wrap: 'yes', density: 8, brushSize: 2.5 })).toEqual(DEFAULT_SETTINGS);
  });
});
