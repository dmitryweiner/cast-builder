import { describe, expect, it } from 'vitest';
import { defaultSettings, defaultSetup, resetSettings, sanitizeSettings, sanitizeSetup } from './state';

describe('reset', () => {
  it('puts every setting back to the default, the mode tab kept', () => {
    const tuned = sanitizeSettings({
      mode: 'slump',
      mold: { shrinkPct: 9, slabMm: 4, screws: true, threadFitMm: 0.65 },
      scheme: 'halves',
      resolution: 384,
      bed: { place: 'column', gapMm: 20, oneFile: true },
    });
    expect(resetSettings(tuned)).toEqual({ ...defaultSettings(), mode: 'slump' });
  });

  it('the language is not a setting: undo and Reset never change it', () => {
    expect(defaultSettings()).not.toHaveProperty('locale');
    expect(sanitizeSettings({ locale: 'ru' })).not.toHaveProperty('locale');
  });
});

describe('press kinds', () => {
  it('the slump tab remembers its kind: the bowl with a punch, the tile or the two halves', () => {
    expect(defaultSettings().press).toBe('slump');
    for (const mode of ['slump', 'tile', 'split'] as const) expect(sanitizeSettings({ mode }).press).toBe(mode);
    // another tab keeps the kind last picked
    expect(sanitizeSettings({ mode: 'bath', press: 'split' })).toMatchObject({ mode: 'bath', press: 'split' });
    expect(sanitizeSettings({ mode: 'bath', press: 'master' }).press).toBe('slump');
    const once = sanitizeSettings({ mode: 'tile', press: 'split' });
    expect(once.press).toBe('tile');
    expect(sanitizeSettings(once)).toEqual(once);
  });
});

describe('the split setup', () => {
  it('a vertical plane square to x through the middle by default; the axis one of x, y, z; the position 5–95 %', () => {
    expect(defaultSetup().split).toEqual({ axis: 'x', pct: 50 });
    expect(sanitizeSetup({ split: { axis: 'x', pct: 30 } }).split).toEqual({ axis: 'x', pct: 30 });
    expect(sanitizeSetup({ split: { axis: 'w', pct: 300 } }).split).toEqual({ axis: 'x', pct: 95 });
    expect(sanitizeSetup({ split: 'x' }).split).toEqual(defaultSetup().split);
    // a record from before the split had a setup of its own
    expect(sanitizeSetup({ orientation: { spinDeg: 90 } }).split).toEqual(defaultSetup().split);
    const once = sanitizeSetup({ split: { axis: 'y', pct: 2 } });
    expect(sanitizeSetup(once)).toEqual(once);
  });
});
