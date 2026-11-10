import { describe, expect, it } from 'vitest';
import { History } from 'maker-kit/core/history';
import type { IndexedMesh } from 'maker-kit/3d/mesh';
import type { Project } from './state';
import { defaultSettings, defaultSetup, ModelRef, resetSettings, sanitizeSettings, sanitizeSetup } from './state';

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

describe('the model in the project', () => {
  /** A mesh that fails the test the moment anything turns it into JSON. */
  const huge = (): IndexedMesh =>
    Object.assign(
      { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) },
      {
        toJSON() {
          throw new Error('a mesh was stringified');
        },
      },
    );
  const project = (model: ModelRef | null): Project => ({ settings: defaultSettings(), setup: defaultSetup(), model });

  it('is held by reference: its JSON is its id, never the mesh', () => {
    const ref = new ModelRef('m1', 'cup', huge());
    expect(JSON.stringify(project(ref))).toContain('"model":"m1"');
    expect(JSON.stringify(project(null))).toContain('"model":null');
  });

  it('opening a model and New are a step each; undo brings back the very same mesh', () => {
    const teapot = new ModelRef('m1', 'teapot', huge());
    const cup = new ModelRef('m2', 'cup', huge());
    const history = new History(project(teapot));
    history.commit(project(cup));
    history.commit(project(null));
    expect(history.undo()?.model).toBe(cup);
    expect(history.undo()?.model).toBe(teapot);
    expect(history.redo()?.model).toBe(cup);
  });

  it('the same model again is no step', () => {
    const ref = new ModelRef('m1', 'cup', huge());
    const history = new History(project(ref));
    history.commit(project(ref));
    expect(history.canUndo).toBe(false);
  });
});
