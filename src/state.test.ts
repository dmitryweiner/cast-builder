import { describe, expect, it } from 'vitest';
import { defaultSettings, resetSettings, sanitizeSettings } from './state';

describe('reset', () => {
  it('puts every setting back to the default, the language and the mode tab kept', () => {
    const tuned = sanitizeSettings({
      locale: 'ru',
      mode: 'slump',
      mold: { shrinkPct: 9, slabMm: 4, screws: true, threadFitMm: 0.65 },
      scheme: 'halves',
      resolution: 384,
      bed: { place: 'column', gapMm: 20, oneFile: true },
    });
    expect(resetSettings(tuned)).toEqual({ ...defaultSettings(), locale: 'ru', mode: 'slump' });
  });

  it('a browser-picked language stays browser-picked', () => {
    expect(resetSettings({ ...defaultSettings(), mode: 'master' })).toEqual({ ...defaultSettings(), mode: 'master' });
  });
});
