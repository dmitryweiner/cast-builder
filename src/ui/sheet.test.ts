// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { NarrowQuery } from './sheet';
import { setupSheet } from './sheet';

/** A media query the test switches by hand. */
function query(initial: boolean): NarrowQuery & { set(next: boolean): void } {
  const listeners: (() => void)[] = [];
  let matches = initial;
  return {
    get matches() {
      return matches;
    },
    addEventListener: (_type, listener) => listeners.push(listener),
    set(next) {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

/** jsdom has no PointerEvent: a mouse event with the pointer's id and a set time. */
function pointer(target: HTMLElement, type: string, x: number, y: number, pointerId: number, timeStamp: number): void {
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: pointerId }, timeStamp: { value: timeStamp } });
  target.dispatchEvent(event);
}
const press = (target: HTMLElement, x: number, y: number, timeStamp = 0, pointerId = 1): void =>
  pointer(target, 'pointerdown', x, y, pointerId, timeStamp);
const move = (target: HTMLElement, x: number, y: number, pointerId = 1): void => pointer(target, 'pointermove', x, y, pointerId, 10);
const release = (target: HTMLElement, x: number, y: number, timeStamp = 50, pointerId = 1): void =>
  pointer(target, 'pointerup', x, y, pointerId, timeStamp);

describe('setupSheet', () => {
  let panel: HTMLElement;
  let button: HTMLButtonElement;
  let view: HTMLElement;
  let insets: number[];

  beforeEach(() => {
    document.body.innerHTML = '<aside id="panel"></aside><button id="panelBtn"></button><canvas id="view"></canvas>';
    panel = document.getElementById('panel') ?? document.body;
    const node = document.getElementById('panelBtn');
    if (!(node instanceof HTMLButtonElement)) throw new Error('no button');
    button = node;
    view = document.getElementById('view') ?? document.body;
    insets = [];
  });

  const setup = (narrow: NarrowQuery) => setupSheet({ panel, button, view, narrow, onInset: (px) => insets.push(px) });

  it('starts open, the button hidden', () => {
    setup(query(true));
    expect(panel.classList.contains('open')).toBe(true);
    expect(button.hidden).toBe(true);
  });

  it('starts closed when asked: on a phone with no model the sheet would hide the invitation', () => {
    const sheet = setupSheet({ panel, button, view, narrow: query(true), onInset: () => {}, open: false });
    expect(sheet.isOpen()).toBe(false);
    expect(button.hidden).toBe(false);
  });

  it('closes on a tap on the view of a phone and opens by the button', () => {
    const sheet = setup(query(true));
    press(view, 100, 100);
    release(view, 102, 101);
    expect(sheet.isOpen()).toBe(false);
    expect(panel.classList.contains('open')).toBe(false);
    expect(button.hidden).toBe(false);
    button.click();
    expect(sheet.isOpen()).toBe(true);
    expect(button.hidden).toBe(true);
  });

  it('stays open after a drag, a long press or a pinch on the view', () => {
    const sheet = setup(query(true));
    press(view, 100, 100);
    move(view, 140, 100);
    release(view, 140, 100);
    expect(sheet.isOpen()).toBe(true);
    press(view, 100, 100, 0);
    release(view, 100, 100, 1000);
    expect(sheet.isOpen()).toBe(true);
    press(view, 100, 100, 0, 1);
    press(view, 200, 200, 0, 2);
    release(view, 100, 100, 50, 1);
    release(view, 200, 200, 50, 2);
    expect(sheet.isOpen()).toBe(true);
  });

  it('ignores taps on a wide screen, where the panel is beside the view', () => {
    const narrow = query(false);
    const sheet = setup(narrow);
    press(view, 100, 100);
    release(view, 100, 100);
    expect(sheet.isOpen()).toBe(true);
    expect(button.hidden).toBe(true);
    expect(insets.at(-1)).toBe(0);
  });

  it('reports the inset the open sheet takes from the view, only on a phone', () => {
    Object.defineProperty(panel, 'offsetHeight', { value: 300 });
    const narrow = query(true);
    const sheet = setup(narrow);
    expect(insets.at(-1)).toBe(300);
    sheet.close();
    expect(insets.at(-1)).toBe(0);
    sheet.open();
    narrow.set(false);
    expect(insets.at(-1)).toBe(0);
    expect(button.hidden).toBe(true);
  });

  it('a wide screen turned narrow keeps the sheet open', () => {
    const narrow = query(false);
    const sheet = setup(narrow);
    narrow.set(true);
    expect(sheet.isOpen()).toBe(true);
    expect(button.hidden).toBe(true);
  });
});
