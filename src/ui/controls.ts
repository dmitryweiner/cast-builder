// Declarative controls over any state: describe how to read and write a
// value, and the rows, formatting and syncing come from here.
//
// Labels, hints and options are dictionary keys, not text: translation
// happens when drawn, and a change of language is just drawing again.

import { make } from './dom';
import type { Key } from '../i18n';
import { t } from '../i18n';

/**
 * When a control is shown. A slider that does nothing in the current mode is
 * worse than none.
 */
type Visibility<T> = (state: T) => boolean;

export interface RangeControl<T> {
  kind: 'range';
  key: string;
  label: Key;
  /** limits may depend on the state: the mouth's height on the model's */
  min: number | ((state: T) => number);
  max: number | ((state: T) => number);
  step: number;
  /** values a button away, under the slider: the spin's quarter turns */
  presets?: readonly number[];
  hint?: Key;
  when?: Visibility<T>;
  get(state: T): number;
  set(state: T, value: number): T;
}

export interface SelectControl<T> {
  kind: 'select';
  key: string;
  label: Key;
  options: readonly { value: string; label: Key }[];
  hint?: Key;
  when?: Visibility<T>;
  get(state: T): string;
  set(state: T, value: string): T;
}

export interface CheckControl<T> {
  kind: 'check';
  key: string;
  label: Key;
  hint?: Key;
  when?: Visibility<T>;
  get(state: T): boolean;
  set(state: T, value: boolean): T;
}

export type Control<T> = RangeControl<T> | SelectControl<T> | CheckControl<T>;

export interface ControlsHandle<T> {
  /** updates the shown values without making the DOM again */
  sync(state: T): void;
}

function decimals(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

const limit = <T>(value: number | ((state: T) => number), state: T): number => (typeof value === 'function' ? value(state) : value);

export function renderControls<T>(
  container: HTMLElement,
  controls: readonly Control<T>[],
  read: () => T,
  onChange: (next: T) => void,
  idPrefix: string,
): ControlsHandle<T> {
  container.textContent = '';
  const syncers: ((state: T) => void)[] = [];

  for (const control of controls) {
    const row = make('label', 'row');
    /** what `when` hides along with the row */
    const nodes: HTMLElement[] = [row];
    const name = make('span', 'row-name', t(control.label));
    if (control.hint) name.title = t(control.hint);
    row.append(name);

    if (control.kind === 'check') {
      const box = make('input');
      box.type = 'checkbox';
      box.id = `${idPrefix}_${control.key}`;
      box.checked = control.get(read());
      box.addEventListener('change', () => onChange(control.set(read(), box.checked)));
      row.classList.add('check-row');
      row.prepend(box);
      syncers.push((state) => {
        box.checked = control.get(state);
      });
    } else if (control.kind === 'select') {
      const select = make('select');
      select.id = `${idPrefix}_${control.key}`;
      for (const option of control.options) {
        const node = make('option', undefined, t(option.label));
        node.value = option.value;
        select.append(node);
      }
      select.value = control.get(read());
      select.addEventListener('change', () => onChange(control.set(read(), select.value)));
      row.append(select);
      syncers.push((state) => {
        select.value = control.get(state);
      });
    } else {
      const slider = make('input');
      slider.type = 'range';
      slider.id = `${idPrefix}_${control.key}`;
      slider.step = String(control.step);
      const readout = make('output');
      const minus = make('button', 'adj-btn', '−');
      const plus = make('button', 'adj-btn', '+');
      for (const [button, dir] of [
        [minus, -1],
        [plus, 1],
      ] satisfies [HTMLButtonElement, number][]) {
        button.type = 'button';
        button.dataset.slider = slider.id;
        button.dataset.dir = String(dir);
        button.tabIndex = -1;
        button.setAttribute('aria-hidden', 'true');
      }
      const show = (state: T): void => {
        slider.min = String(limit(control.min, state));
        slider.max = String(limit(control.max, state));
        const value = control.get(state);
        slider.value = String(value);
        readout.textContent = value.toFixed(decimals(control.step));
      };
      slider.addEventListener('input', () => {
        const value = Number(slider.value);
        readout.textContent = value.toFixed(decimals(control.step));
        onChange(control.set(read(), value));
      });
      row.append(minus, slider, plus, readout);
      show(read());
      syncers.push(show);
      // a sibling of the row, not inside the label: a click on its gaps must not reach the slider's buttons
      if (control.presets) {
        const presetRow = make('div', 'presets');
        const buttons = control.presets.map((value) => {
          const button = make('button', 'preset-btn', `${value}°`);
          button.type = 'button';
          button.addEventListener('click', () => onChange(control.set(read(), value)));
          presetRow.append(button);
          return { button, value };
        });
        const press = (state: T): void => {
          const current = control.get(state);
          for (const { button, value } of buttons) button.setAttribute('aria-pressed', String(value === current));
        };
        press(read());
        syncers.push(press);
        nodes.push(presetRow);
      }
    }

    const when = control.when;
    if (when) {
      const show = (state: T): void => {
        for (const node of nodes) node.hidden = !when(state);
      };
      show(read());
      syncers.push(show);
    }
    container.append(...nodes);
  }

  return {
    sync(state: T): void {
      for (const syncer of syncers) syncer(state);
    },
  };
}

/**
 * The +/− buttons next to sliders, repeating while held. One listener on the
 * container: rows are drawn again on every change of language.
 */
function adjust(button: HTMLElement): void {
  const slider = button.dataset.slider ? document.getElementById(button.dataset.slider) : null;
  if (!(slider instanceof HTMLInputElement)) return;
  const step = Number(slider.step) || 1;
  const value = Math.max(Number(slider.min), Math.min(Number(slider.max), Number(slider.value) + Number(button.dataset.dir) * step));
  slider.value = String(value);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

export function setupAdjustmentButtons(container: HTMLElement, repeatDelay = 150): void {
  let interval: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (interval) clearInterval(interval);
    interval = null;
  }

  container.addEventListener('pointerdown', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.adj-btn');
    if (!(button instanceof HTMLElement)) return;
    event.preventDefault();
    stop();
    adjust(button);
    interval = setInterval(() => adjust(button), repeatDelay);
  });
  container.addEventListener('pointerup', stop);
  container.addEventListener('pointerleave', stop);
  container.addEventListener('pointercancel', stop);
  document.addEventListener('pointerup', stop);
}
