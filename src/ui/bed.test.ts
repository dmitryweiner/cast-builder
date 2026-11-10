// @vitest-environment jsdom
// The bed card: how the parts go on the bed and into the STL.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderControls } from 'maker-kit/ui/controls';
import { bedControls, inOneFile } from './bed';
import { defaultSettings } from '../state';
import type { Settings } from '../state';
import { t } from '../i18n';

describe('bed controls', () => {
  let host: HTMLElement;
  let state: Settings;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    host = document.getElementById('host') ?? document.body;
    state = { ...defaultSettings(), mode: 'slump' };
  });

  const render = () =>
    renderControls(host, bedControls, {
      read: () => state,
      change: (next) => {
        state = next;
        handle.sync(state);
      },
      idPrefix: 'bed',
      t,
    });
  let handle: ReturnType<typeof render>;
  const node = <T extends HTMLElement>(key: string, type: new () => T): T => {
    const found = document.getElementById(`bed_${key}`);
    if (!(found instanceof type)) throw new Error(`no ${key}`);
    return found;
  };
  const shown = (key: string): boolean => !(document.getElementById(`bed_${key}`)?.closest<HTMLElement>('.row')?.hidden ?? true);

  it('the slump mold is one file: the layout and the gap, no file choice', () => {
    handle = render();
    expect([shown('place'), shown('gap'), shown('oneFile')]).toEqual([true, true, false]);
  });

  it('pour boxes: the layout and the gap only when they go into one file', () => {
    state = { ...state, mode: 'bath' };
    handle = render();
    expect([shown('place'), shown('gap'), shown('oneFile')]).toEqual([false, false, true]);
    node('oneFile', HTMLInputElement).click();
    expect(state.bed.oneFile).toBe(true);
    expect([shown('place'), shown('gap')]).toEqual([true, true]);
  });

  it('a tile mold: whole, nothing to lay out; cut in two, a file each unless asked into one', () => {
    state = { ...state, mode: 'tile' };
    handle = render();
    expect([shown('place'), shown('gap'), shown('oneFile')]).toEqual([false, false, false]);
    expect(inOneFile(state)).toBe(false);
    state = { ...state, mold: { ...state.mold, tileCut: true } };
    handle = render();
    expect([shown('place'), shown('gap'), shown('oneFile')]).toEqual([false, false, true]);
    node('oneFile', HTMLInputElement).click();
    expect(inOneFile(state)).toBe(true);
    expect([shown('place'), shown('gap')]).toEqual([true, true]);
  });

  it('a master is one part: nothing to lay out', () => {
    state = { ...state, mode: 'master' };
    handle = render();
    expect([shown('place'), shown('gap'), shown('oneFile')]).toEqual([false, false, false]);
  });

  it('sets the layout and the gap and keeps the rest', () => {
    handle = render();
    const select = node('place', HTMLSelectElement);
    expect([...select.options].map((option) => option.value)).toEqual(['auto', 'row', 'column']);
    select.value = 'column';
    select.dispatchEvent(new Event('change'));
    expect(state.bed.place).toBe('column');
    const gap = node('gap', HTMLInputElement);
    gap.value = '8';
    gap.dispatchEvent(new Event('input'));
    expect(state.bed.gapMm).toBe(8);
    expect(state.mold).toEqual(defaultSettings().mold);
  });
});

describe('inOneFile', () => {
  it('the slump mold always, pour boxes and split halves when asked, a master or a tile never needs it', () => {
    const settings = defaultSettings();
    expect(inOneFile({ ...settings, mode: 'split' })).toBe(false);
    expect(inOneFile({ ...settings, mode: 'split', bed: { ...settings.bed, oneFile: true } })).toBe(true);
    expect(inOneFile({ ...settings, mode: 'tile', bed: { ...settings.bed, oneFile: true } })).toBe(false);
    expect(inOneFile({ ...settings, mode: 'slump' })).toBe(true);
    expect(inOneFile({ ...settings, mode: 'bath' })).toBe(false);
    expect(inOneFile({ ...settings, mode: 'bath', bed: { ...settings.bed, oneFile: true } })).toBe(true);
    expect(inOneFile({ ...settings, mode: 'master', bed: { ...settings.bed, oneFile: true } })).toBe(false);
  });
});
