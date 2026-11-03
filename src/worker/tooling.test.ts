import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from '../geo/csg';
import { CsgScope, initCSG, toManifold } from '../geo/csg';
import { IDENTITY_TURN, defaultOrientation, flip, placeModel } from '../geo/model';
import { fixture } from '../geo/testing';
import { validateMesh } from '../geo/validate';
import { defaultSettings, defaultSetup } from '../state';
import type { Mode } from '../state';
import type { JobProgress, ToolingJob } from './protocol';
import { pressOptions, runJob, sanitizeJob, slumpTooling } from './tooling';
import { meshSource } from '../geo/revolve';
import type { SurfaceMesh } from '../geo/surface';
import { bodies } from '../geo/pieces';
import { CLEAR_HOLE_MM, PAD, SCREW, THREAD, THREAD_FIT_MM, minorRadius } from '../geo/thread';
import { defaultMold } from '../geo/mold/state';

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

  it('stands the collar on a rounded rim: one closed part, slivers only as noise', () => {
    // the rim of the printable cup is rounded to half its wall
    const mold = { ...defaultSettings().mold, shrinkPct: 0, spareMm: 30 };
    const { parts, info } = runJob(csg, jobFor('cup-hollow', { kind: 'export', mode: 'master', mold }));
    expect(info.mouth?.radiusMm).toBeLessThan(info.rimMm ?? 0);
    const [master] = parts;
    expect(master.blocking).toEqual([]);
    const mesh = { ...master, normals: master.normals };
    const report = validateMesh(mesh);
    expect(report.watertight).toBe(true);
    // the collar cuts the curved strip of the rounding and leaves a few
    // slivers on the joint: the noise of a boolean operation, far under the
    // export gate's 1 %
    expect(report.degenerateTriangles / report.triangleCount).toBeLessThan(0.005);
    // the collar goes up from the rim by the spare height
    const height = validateMesh({ ...placeModel(fixture('cup-hollow'), defaultOrientation()), normals: new Float32Array(0) }).extents[2];
    expect(report.extents[2]).toBeCloseTo(height + mold.spareMm, 0);
    const scope = new CsgScope();
    try {
      expect(
        scope
          .keep(toManifold(csg, mesh))
          .decompose()
          .map((shell) => scope.keep(shell)),
      ).toHaveLength(1);
    } finally {
      scope.dispose();
    }
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

describe('slumpTooling with screws', () => {
  const N = 96;
  const build = (name: string, shrinkPct: number, exporting: boolean, print = true) => {
    const source = meshSource(placeModel(fixture(name), defaultOrientation()), N, N);
    const options = { ...pressOptions({ ...defaultMold(), shrinkPct }), screws: true };
    return slumpTooling(csg, source, options, { exporting, print });
  };
  const solidOf = (scope: CsgScope, mesh: SurfaceMesh) => scope.keep(toManifold(csg, mesh));
  /** A vertical cylinder round a screw's axis, the whole height of the part. */
  const column = (scope: CsgScope, x: number, y: number, radius: number) =>
    scope.keep(csg.Manifold.cylinder(1000, radius, radius, 48).translate([x, y, -500]));

  it('an export: the mold and the punch closed, three through holes in each, none into the cavity', () => {
    for (const [name, shrinkPct] of [
      ['bowl', 12],
      ['cup', 0],
    ] as const) {
      const built = build(name, shrinkPct, true);
      const scope = new CsgScope();
      const plain = slumpTooling(
        csg,
        meshSource(placeModel(fixture(name), defaultOrientation()), N, N),
        { ...pressOptions({ ...defaultMold(), shrinkPct }), screws: false },
        { exporting: true, print: false },
      );
      expect(validateMesh(built.mold).watertight, name).toBe(true);
      expect(validateMesh(built.punch).watertight, name).toBe(true);
      // the vent along the axis is a hole already
      expect(solidOf(scope, built.mold).genus(), name).toBe(solidOf(scope, plain.mold).genus() + 3);
      expect(solidOf(scope, built.punch).genus(), name).toBe(solidOf(scope, plain.punch).genus() + 3);
      expect(bodies(built.mold), name).toBe(1);
      scope.dispose();
    }
  });

  it('the threaded hole in a lug and the plain one in the petal are on one axis; the thread bites', () => {
    const built = build('cup', 12, true);
    const layout = built.layout;
    expect(layout).not.toBeNull();
    if (!layout) return;
    const scope = new CsgScope();
    const mold = solidOf(scope, built.mold);
    const punch = solidOf(scope, built.punch);
    for (const angle of layout.angles) {
      const x = layout.axisMm * Math.cos(angle);
      const y = layout.axisMm * Math.sin(angle);
      // between the slices of the thread its faces cut the helix by a chord: under 0.1 mm at 16 per turn
      const core = minorRadius(THREAD) + THREAD_FIT_MM - 0.1;
      expect(scope.keep(mold.intersect(column(scope, x, y, core))).volume()).toBeLessThan(1e-3);
      expect(scope.keep(mold.intersect(column(scope, x, y, THREAD.d / 2))).volume()).toBeGreaterThan(50);
      expect(scope.keep(punch.intersect(column(scope, x, y, CLEAR_HOLE_MM / 2 - 0.05))).volume()).toBeLessThan(1e-3);
      expect(scope.keep(punch.intersect(column(scope, x, y, CLEAR_HOLE_MM / 2 + 1))).volume()).toBeGreaterThan(1);
    }
    scope.dispose();
  });

  it('a stop on a seat fits under the petal of the pressed punch: it touches neither part', () => {
    const built = build('bowl', 12, true);
    const layout = built.layout;
    if (!layout) throw new Error('no layout');
    const scope = new CsgScope();
    const mold = solidOf(scope, built.mold);
    // the punch as it is printed, turned back into its pressed place: z → top − z
    const top = layout.petalZ + 8;
    const pressed = scope.keep(solidOf(scope, built.punch).mirror([0, 0, 1]).translate([0, 0, top]));
    const pad = solidOf(scope, built.pads[0]);
    const { min } = pad.boundingBox();
    for (const angle of layout.angles) {
      const x = layout.axisMm * Math.cos(angle);
      const y = layout.axisMm * Math.sin(angle);
      const placed = scope.keep(pad.translate([x - (min[0] + PAD.d / 2), y - (min[1] + PAD.d / 2), layout.seatZ + 0.01 - min[2]]));
      expect(scope.keep(placed.intersect(mold)).volume()).toBeLessThan(1e-3);
      expect(scope.keep(placed.intersect(pressed)).volume()).toBeLessThan(1e-3);
      // and it fills the gap: lifted by half a millimetre it would hit the petal
      expect(scope.keep(scope.keep(placed.translate([0, 0, 0.5])).intersect(pressed)).volume()).toBeGreaterThan(1);
    }
    scope.dispose();
  });

  it('three screws on their heads and three stops; the same for any model and shrinkage', () => {
    const a = build('bowl', 12, true);
    const b = build('cup', 0, true);
    expect(a.screws).toHaveLength(3);
    expect(a.pads).toHaveLength(3);
    for (const screw of a.screws) {
      expect(validateMesh(screw).watertight).toBe(true);
      expect(validateMesh(screw).bbox.min[2]).toBeCloseTo(0, 4);
      expect(validateMesh(screw).extents[2]).toBeCloseTo(SCREW.headH + SCREW.shank, 3);
    }
    for (const pad of a.pads) expect(validateMesh(pad).bbox.min[2]).toBeCloseTo(0, 4);
    expect([...a.screws[1].positions]).toEqual([...b.screws[1].positions]);
    expect([...a.pads[2].positions]).toEqual([...b.pads[2].positions]);
    expect(build('cup', 0, true, false).screws).toEqual([]);
  });

  it('runJob: one STL — mold and punch, with the screws and stops when they are printed', () => {
    const settings = defaultSettings();
    const job = (screws: boolean, printScrews: boolean): ToolingJob =>
      jobFor('cup', { mode: 'slump', kind: 'export', resolution: 128, mold: { ...settings.mold, screws, printScrews } });
    const labels: string[] = [];
    const printed = runJob(csg, job(true, true), (progress) => labels.push(progress.label.code));
    expect(labels).toEqual(['progress.slump', 'progress.screws', 'progress.punch', 'progress.checkMeshes']);
    expect(printed.parts[0].blocking).toEqual([]);
    expect(bodies(printed.parts[0])).toBe(8);
    expect(bodies(runJob(csg, job(true, false)).parts[0])).toBe(2);
    // the screws are printed only with the clamps
    expect(bodies(runJob(csg, job(false, true)).parts[0])).toBe(2);
  });

  it('a preview: the lugs are merged next to the shell, the punch is holed', () => {
    const built = build('cup', 0, false);
    expect(bodies(built.mold)).toBeGreaterThanOrEqual(1);
    const scope = new CsgScope();
    const plain = slumpTooling(
      csg,
      meshSource(placeModel(fixture('cup'), defaultOrientation()), N, N),
      { ...pressOptions(defaultMold()), screws: false },
      { exporting: false, print: false },
    );
    expect(built.mold.indices.length).toBeGreaterThan(plain.mold.indices.length);
    expect(solidOf(scope, built.punch).genus()).toBe(solidOf(scope, plain.punch).genus() + 3);
    scope.dispose();
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
