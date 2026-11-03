// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Control } from './controls';
import { renderControls } from './controls';

interface State {
  spin: number;
}

const spin: Control<State> = {
  kind: 'range',
  key: 'spin',
  label: 'ctl.spin',
  min: 0,
  max: 355,
  step: 5,
  presets: [0, 90, 180, 270],
  get: (s) => s.spin,
  set: (s, value) => ({ ...s, spin: value }),
};

describe('renderControls: range presets', () => {
  let host: HTMLElement;
  let state: State;
  let changes: State[];

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    host = document.getElementById('host') ?? document.body;
    state = { spin: 90 };
    changes = [];
  });

  const render = () =>
    renderControls(
      host,
      [spin],
      () => state,
      (next) => {
        changes.push(next);
        state = next;
      },
      'model',
    );
  const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.preset-btn')];
  const pressed = () => buttons().map((button) => button.getAttribute('aria-pressed'));

  it('draws a button per preset under the slider, the current one pressed', () => {
    render();
    expect(buttons().map((button) => button.textContent)).toEqual(['0°', '90°', '180°', '270°']);
    expect(pressed()).toEqual(['false', 'true', 'false', 'false']);
  });

  it('sets the value by a click, as the slider does', () => {
    const rows = render();
    buttons()[2]?.click();
    expect(changes).toEqual([{ spin: 180 }]);
    rows.sync(state);
    expect(pressed()).toEqual(['false', 'false', 'true', 'false']);
    expect(host.querySelector<HTMLInputElement>('#model_spin')?.value).toBe('180');
  });

  it('presses none when the value is between the presets', () => {
    state = { spin: 45 };
    render();
    expect(pressed()).toEqual(['false', 'false', 'false', 'false']);
  });

  it('draws no preset row for a plain slider', () => {
    const { presets: _, ...plain } = spin;
    renderControls(
      host,
      [plain],
      () => state,
      () => {},
      'model',
    );
    expect(buttons()).toEqual([]);
  });
});
