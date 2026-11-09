// @vitest-environment jsdom
// The controls of the slump mold's screw clamps and the sizes they show.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderControls } from 'maker-kit/ui/controls';
import { screwControls } from './screws';
import { defaultSettings } from '../state';
import type { Settings } from '../state';
import { t } from '../i18n';
import { PAD, PAD_GAP_MM, SCREW, STEEL_BOLT_MM, THREAD } from '../geo/thread';

describe('screw clamp checkboxes', () => {
  let host: HTMLElement;
  let state: Settings;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    host = document.getElementById('host') ?? document.body;
    state = { ...defaultSettings(), mode: 'slump' };
  });

  const render = () =>
    renderControls(host, screwControls, {
      read: () => state,
      change: (next) => {
        state = next;
        handle.sync(state);
      },
      idPrefix: 'tool',
      t,
    });
  let handle: ReturnType<typeof render>;
  const box = (key: string): HTMLInputElement => {
    const node = document.getElementById(`tool_${key}`);
    if (!(node instanceof HTMLInputElement)) throw new Error(`no ${key}`);
    return node;
  };
  const shown = (key: string): boolean => !(box(key).closest<HTMLElement>('.row')?.hidden ?? true);

  const note = (key: string): HTMLElement => {
    const node = document.getElementById(`tool_${key}_note`);
    if (!node) throw new Error(`no note of ${key}`);
    return node;
  };
  const all = ['screws', 'threadedLugs', 'threadFit', 'printScrews', 'printStops'];
  const visible = () => all.filter(shown);

  it('only in the slump mode; the thread, its fit and the print boxes with the clamps on', () => {
    handle = render();
    expect(visible()).toEqual(['screws']);
    box('screws').click();
    expect(state.mold.screws).toBe(true);
    expect(visible()).toEqual(all);
    box('printScrews').click();
    expect(state.mold.printScrews).toBe(true);
    box('printStops').click();
    expect(state.mold.printStops).toBe(true);
    state = { ...state, mode: 'bath' };
    handle.sync(state);
    expect(visible()).toEqual([]);
  });

  it('without the thread no fit and no printed screws: the stops stay', () => {
    handle = render();
    box('screws').click();
    expect(box('threadedLugs').checked).toBe(true);
    box('threadedLugs').click();
    expect(state.mold.threadedLugs).toBe(false);
    expect(visible()).toEqual(['screws', 'threadedLugs', 'printStops']);
  });

  it('off by default but the thread, and keep the other settings', () => {
    handle = render();
    expect(['screws', 'printScrews', 'printStops', 'threadedLugs'].map((key) => box(key).checked)).toEqual([false, false, false, true]);
    const before = state.mold.slabMm;
    box('screws').click();
    expect(state.mold.slabMm).toBe(before);
  });

  it('say what is printed and what steel to buy, in numbers from geo/thread', () => {
    handle = render();
    box('screws').click();
    expect(note('printScrews').textContent).toBe(
      `M${THREAD.d} × ${THREAD.pitch} (pitch ${THREAD.pitch} mm, not the ISO 1.5), ${SCREW.shank} mm under the head, head Ø${SCREW.headD}`,
    );
    expect(note('printScrews').textContent).toContain('M10 × 2');
    expect(note('printScrews').textContent).toContain('38 mm');
    expect(note('printStops').textContent).toBe(`Ø${PAD.d} × ${PAD.h + PAD.bossH} mm, for the ${PAD_GAP_MM} mm gap`);
    // the steel only without the thread
    expect(note('threadedLugs').hidden).toBe(true);
    box('threadedLugs').click();
    expect(note('threadedLugs').hidden).toBe(false);
    expect(note('threadedLugs').textContent).toBe(`Steel, per lug: a bolt M10 × ${STEEL_BOLT_MM} (ISO, pitch 1.5), a washer and a nut M10`);
    expect(note('printScrews').hidden).toBe(true);
    // a note goes with its control
    state = { ...state, mode: 'master' };
    handle.sync(state);
    expect(['threadedLugs', 'printScrews', 'printStops'].map((key) => note(key).hidden)).toEqual([true, true, true]);
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
