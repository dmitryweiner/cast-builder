// @vitest-environment jsdom
// The press molds' controls: the kind inside the slump tab, the plane of a
// split mold, the undercuts the build found.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderControls } from 'maker-kit/ui/controls';
import { catchNote, pressControls, splitControls } from './press';
import { defaultSettings, defaultSetup, sanitizeSettings } from '../state';
import type { Settings, Setup } from '../state';
import { setLocale, t } from '../i18n';

const shown = (id: string): boolean => !(document.getElementById(id)?.closest<HTMLElement>('.row')?.hidden ?? true);

function node<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`no ${id}`);
  return found;
}

describe('press controls', () => {
  let state: Settings;
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '<div id="host"></div>';
    state = { ...defaultSettings(), mode: 'slump' };
  });
  const render = (): void => {
    const host = node('host', HTMLDivElement);
    const handle = renderControls(host, pressControls, {
      read: () => state,
      change: (next) => {
        state = sanitizeSettings(next);
        handle.sync(state);
      },
      idPrefix: 'mold',
      t,
    });
  };

  it('the kind of press mold: shown in the slump tab only; picking one sets the mode and is remembered', () => {
    render();
    const kind = node('mold_press', HTMLSelectElement);
    expect([...kind.options].map((option) => option.value)).toEqual(['slump', 'tile', 'split']);
    expect(shown('mold_press')).toBe(true);
    kind.value = 'split';
    kind.dispatchEvent(new Event('change'));
    expect(state).toMatchObject({ mode: 'split', press: 'split' });
    state = { ...state, mode: 'bath' };
    render();
    expect(shown('mold_press')).toBe(false);
  });

  it('the allowed undercut: in the tile and the split modes, not in the slump mold', () => {
    render();
    expect(shown('mold_allowedCatch')).toBe(false);
    for (const mode of ['tile', 'split'] as const) {
      state = { ...state, mode };
      render();
      expect(shown('mold_allowedCatch'), mode).toBe(true);
    }
    const slider = node('mold_allowedCatch', HTMLInputElement);
    slider.value = '3.5';
    slider.dispatchEvent(new Event('input'));
    expect(state.mold.allowedCatchMm).toBe(3.5);
  });

  it('the land round the cavity: a slider of its own for the tile and for the halves, none in the slump mold', () => {
    render();
    expect([shown('mold_tileLand'), shown('mold_splitLand')]).toEqual([false, false]);
    state = { ...state, mode: 'tile' };
    render();
    expect([shown('mold_tileLand'), shown('mold_splitLand')]).toEqual([true, false]);
    const tile = node('mold_tileLand', HTMLInputElement);
    tile.value = '3';
    tile.dispatchEvent(new Event('input'));
    expect(state.mold).toMatchObject({ tileLandMm: 3, splitLandMm: 12 });
    state = { ...state, mode: 'split' };
    render();
    expect([shown('mold_tileLand'), shown('mold_splitLand')]).toEqual([false, true]);
    const split = node('mold_splitLand', HTMLInputElement);
    split.value = '20';
    split.dispatchEvent(new Event('input'));
    expect(state.mold).toMatchObject({ tileLandMm: 3, splitLandMm: 20 });
  });

  it('the tile cut in two: a box of the tile only, off by default; its height shown once it is on', () => {
    render();
    expect([shown('mold_tileCut'), shown('mold_tileCutPct')]).toEqual([false, false]);
    state = { ...state, mode: 'tile' };
    render();
    expect([shown('mold_tileCut'), shown('mold_tileCutPct'), shown('mold_tileFit'), shown('mold_tileKey')]).toEqual([
      true,
      false,
      false,
      false,
    ]);
    const box = node('mold_tileCut', HTMLInputElement);
    expect(box.checked).toBe(false);
    box.click();
    expect(state.mold.tileCut).toBe(true);
    expect(shown('mold_tileCutPct')).toBe(true);
    const slider = node('mold_tileCutPct', HTMLInputElement);
    expect(slider.value).toBe('50');
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));
    expect(state.mold).toMatchObject({ tileCut: true, tileCutPct: 30 });
    expect(shown('mold_tileFit')).toBe(true);
    const fit = node('mold_tileFit', HTMLInputElement);
    expect(fit.value).toBe('0.2');
    fit.value = '0.35';
    fit.dispatchEvent(new Event('input'));
    expect(state.mold.tileFitMm).toBe(0.35);
    expect(shown('mold_tileKey')).toBe(true);
    const key = node('mold_tileKey', HTMLInputElement);
    expect(key.checked).toBe(true);
    key.click();
    expect(state.mold.tileKey).toBe(false);
    state = { ...state, mode: 'split' };
    render();
    expect([shown('mold_tileCut'), shown('mold_tileCutPct'), shown('mold_tileFit'), shown('mold_tileKey')]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('split controls', () => {
  let setup: Setup;
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '<div id="host"></div>';
    setup = defaultSetup();
    renderControls(node('host', HTMLDivElement), splitControls, {
      read: () => setup,
      change: (next) => {
        setup = next;
      },
      idPrefix: 'split',
      t,
    });
  });

  it('the axis of the plane and its place along it', () => {
    const axis = node('split_axis', HTMLSelectElement);
    expect([...axis.options].map((option) => option.value)).toEqual(['x', 'y', 'z']);
    axis.value = 'z';
    axis.dispatchEvent(new Event('change'));
    expect(setup.split.axis).toBe('z');
    const pct = node('split_pct', HTMLInputElement);
    expect([pct.min, pct.max]).toEqual(['5', '95']);
    pct.value = '40';
    pct.dispatchEvent(new Event('input'));
    expect(setup.split).toEqual({ axis: 'z', pct: 40 });
  });
});

describe('catchNote', () => {
  it('names every part and its depth, and the limit', () => {
    setLocale('en');
    const catches = [
      { id: 'split-A', depthMm: 0, at: null },
      { id: 'split-B', depthMm: 3.84, at: null },
    ];
    expect(catchNote(catches, 1)).toBe('Undercuts — half A: 0.0 mm, half B: 3.8 mm; allowed 1.0 mm.');
    expect(catchNote([{ id: 'tile', depthMm: 0.6, at: null }], 1)).toBe('Undercuts — tile mold: 0.6 mm; allowed 1.0 mm.');
    expect(catchNote([], 1)).toBe('');
  });
});
