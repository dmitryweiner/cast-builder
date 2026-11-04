// @vitest-environment jsdom
// The two checkboxes of the slump mold's screw clamps.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderControls } from './controls';
import { screwControls } from './screws';
import { defaultSettings } from '../state';
import type { Settings } from '../state';

describe('screw clamp checkboxes', () => {
  let host: HTMLElement;
  let state: Settings;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    host = document.getElementById('host') ?? document.body;
    state = { ...defaultSettings(), mode: 'slump' };
  });

  const render = () =>
    renderControls(
      host,
      screwControls,
      () => state,
      (next) => {
        state = next;
        handle.sync(state);
      },
      'tool',
    );
  let handle: ReturnType<typeof render>;
  const box = (key: string): HTMLInputElement => {
    const node = document.getElementById(`tool_${key}`);
    if (!(node instanceof HTMLInputElement)) throw new Error(`no ${key}`);
    return node;
  };
  const shown = (key: string): boolean => !(box(key).closest('label')?.hidden ?? true);

  it('only in the slump mode; the print box only with the clamps on', () => {
    handle = render();
    expect(shown('screws')).toBe(true);
    expect(shown('printScrews')).toBe(false);
    box('screws').click();
    expect(state.mold.screws).toBe(true);
    expect(shown('printScrews')).toBe(true);
    box('printScrews').click();
    expect(state.mold.printScrews).toBe(true);
    state = { ...state, mode: 'bath' };
    handle.sync(state);
    expect(shown('screws')).toBe(false);
    expect(shown('printScrews')).toBe(false);
  });

  it('both are off by default and keep the other settings', () => {
    handle = render();
    expect(box('screws').checked).toBe(false);
    expect(box('printScrews').checked).toBe(false);
    const before = state.mold.slabMm;
    box('screws').click();
    expect(state.mold.slabMm).toBe(before);
  });

  it('the thread fit: a slider with the clamps on, 0.5 mm at first, in the mold only', () => {
    handle = render();
    expect(shown('threadFit')).toBe(false);
    box('screws').click();
    expect(shown('threadFit')).toBe(true);
    const slider = box('threadFit');
    expect(Number(slider.value)).toBe(0.5);
    expect([Number(slider.min), Number(slider.max), Number(slider.step)]).toEqual([0.2, 0.7, 0.05]);
    slider.value = '0.6';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state.mold.threadFitMm).toBe(0.6);
    expect(state.mold.screws).toBe(true);
  });
});
