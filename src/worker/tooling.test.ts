import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from '../geo/csg';
import { initCSG } from '../geo/csg';
import { IDENTITY_TURN, defaultOrientation, flip, placeModel } from '../geo/model';
import { fixture } from '../geo/testing';
import { defaultSettings, defaultSetup } from '../state';
import type { Mode } from '../state';
import type { JobProgress, ToolingJob } from './protocol';
import { runJob, sanitizeJob } from './tooling';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

const jobFor = (name: string, over: Partial<ToolingJob> = {}): ToolingJob => {
  const settings = defaultSettings();
  const setup = defaultSetup();
  return {
    kind: 'preview',
    model: placeModel(fixture(name), defaultOrientation()),
    mode: settings.mode,
    mold: settings.mold,
    scheme: settings.scheme,
    resolution: settings.resolution,
    mouth: setup.mouth,
    plug: setup.plug,
    ...over,
  };
};

describe('runJob', () => {
  it('builds every mode for a pot', () => {
    const expected: Record<Mode, string[]> = {
      master: ['master'],
      bath: ['bath-half-A', 'bath-half-B', 'bath-bottom'],
      slump: ['slump'],
    };
    for (const mode of ['master', 'bath', 'slump'] satisfies Mode[]) {
      const { parts, info } = runJob(csg, jobFor('pot', { mode }));
      expect(
        parts.map((part) => part.id),
        mode,
      ).toEqual(expected[mode]);
      expect(info.blocking, mode).toEqual([]);
    }
  });

  it('reports the parting, the state of the model and the mouth, a little inside the rim', () => {
    const { info } = runJob(csg, jobFor('pot', { mode: 'master' }));
    expect(info.scheme).toBe('halves-bottom');
    expect(info.status).toBe('solid');
    expect(info.mouth?.radiusMm).toBeLessThan(info.rimMm ?? 0);
    expect(info.mouth?.radiusMm).toBeGreaterThan((info.rimMm ?? 0) - 2);
  });

  it('fills a hollow cup and says so', () => {
    const { parts, info } = runJob(csg, jobFor('cup-hollow', { mode: 'master' }));
    expect(info.status).toBe('filled');
    expect(info.warnings.map((m) => m.code)).toContain('model.filled');
    expect(parts).toHaveLength(1);
  });

  it('fills a hollow teapot and builds its master and pour boxes', () => {
    for (const mode of ['master', 'bath'] satisfies Mode[]) {
      const { parts, info } = runJob(csg, jobFor('teapot-hollow', { kind: 'export', mode }));
      expect(info.status, mode).toBe('filled');
      expect(info.mouth?.zMm, mode).toBeCloseTo(120, 1);
      expect(parts.length, mode).toBeGreaterThan(0);
      for (const part of parts) expect(part.blocking, `${mode}/${part.id}`).toEqual([]);
    }
  });

  it('fills a printed lid turned over and builds its tooling', () => {
    const model = placeModel(fixture('lid-printed'), { turn: flip(IDENTITY_TURN), spinDeg: 0 });
    for (const mode of ['master', 'bath'] satisfies Mode[]) {
      const { parts, info } = runJob(csg, jobFor('lid-printed', { kind: 'export', mode, model }));
      expect(info.status, mode).toBe('filled');
      expect(parts.length, mode).toBeGreaterThan(0);
      for (const part of parts) expect(part.blocking, `${mode}/${part.id}`).toEqual([]);
    }
  });

  it('asks to turn over a lid as printed', () => {
    const { info } = runJob(csg, jobFor('lid-printed', { mode: 'master' }));
    expect(info.status).toBe('openBottom');
    expect(info.warnings.map((m) => m.code)).toContain('model.openBottom');
  });

  it('refuses a model that is not a solid without throwing', () => {
    const pot = placeModel(fixture('pot'), defaultOrientation());
    const open = { positions: pot.positions, indices: pot.indices.slice(3) };
    const { parts, info } = runJob(csg, jobFor('pot', { model: open, mode: 'bath' }));
    expect(parts).toEqual([]);
    expect(info.blocking.map((m) => m.code)).toEqual(['model.notSolid']);
  });

  it('refuses two pieces in one file in every mode', () => {
    for (const mode of ['master', 'bath', 'slump'] satisfies Mode[]) {
      const { parts, info } = runJob(csg, jobFor('teapot-lid-beside', { mode }));
      expect(parts, mode).toEqual([]);
      expect(info.blocking, mode).toEqual([{ code: 'model.pieces', params: { n: 2 } }]);
    }
  });

  it('takes the parting picked by hand and a mouth set by hand', () => {
    const { parts, info } = runJob(
      csg,
      jobFor('vase', { mode: 'bath', scheme: 'halves-bottom', mouth: { auto: false, zMm: 150, radiusMm: 20 } }),
    );
    expect(info.scheme).toBe('halves-bottom');
    expect(info.reason.map((m) => m.code)).toEqual(['mold.manual']);
    expect(parts).toHaveLength(3);
  });

  it('warns when the plug does not fit', () => {
    const { info } = runJob(csg, jobFor('pot', { mode: 'master', plug: { on: true, recessMm: 6, galleryMm: 1 } }));
    expect(info.warnings.map((m) => m.code)).toContain('mold.noPlug');
  });

  it('checks the meshes on export and reports progress in order', () => {
    const steps: JobProgress[] = [];
    const { parts } = runJob(csg, jobFor('bowl', { kind: 'export', mode: 'bath' }), (step) => steps.push(step));
    expect(parts).toHaveLength(1);
    expect(parts[0].blocking).toEqual([]);
    expect(steps.map((step) => step.step)).toEqual(steps.map((_, i) => i));
    expect(steps.at(-1)?.label.code).toBe('progress.checkMeshes');
    expect(steps.at(-1)?.step).toBe((steps.at(-1)?.total ?? 0) - 1);
  });

  it('warns that a piece with a handle is not round for a slump mold', () => {
    const { info } = runJob(csg, jobFor('pot-handle', { mode: 'slump' }));
    expect(info.warnings.map((m) => m.code)).toContain('press.notRound');
  });
});

describe('sanitizeJob', () => {
  it('rejects a broken model and repairs the rest', () => {
    expect(sanitizeJob(null)).toBeNull();
    expect(sanitizeJob({ model: { positions: [0, 0, 0], indices: [0, 0, 0] } })).toBeNull();
    expect(sanitizeJob({ model: { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 5]) } })).toBeNull();
    const job = sanitizeJob({ ...jobFor('bowl'), mode: 'vessel', mold: { shrinkPct: 99 }, resolution: 5 });
    expect(job?.mode).toBe(defaultSettings().mode);
    expect(job?.mold.shrinkPct).toBe(30);
    expect(job?.resolution).toBe(defaultSettings().resolution);
  });
});
