import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from '../geo/csg';
import { CsgScope, fromManifold, initCSG, toManifold } from '../geo/csg';
import { IDENTITY_TURN, defaultOrientation, flip, placeModel } from '../geo/model';
import { fixture, wavyVase } from '../geo/testing';
import type { IndexedMesh } from '../geo/stl';
import { validateMesh } from '../geo/validate';
import { defaultSettings, defaultSetup } from '../state';
import type { Mode } from '../state';
import type { JobProgress, ToolingJob } from './protocol';
import { pressOptions, runJob, sanitizeJob, slumpTooling } from './tooling';
import { BOSS_R_MM, EAR_MAX_MM, EAR_MIN_MM, EAR_SEAT_MM, buildSlumpShell, punchLayout } from '../geo/press';
import { lugSolids, screwSolid } from '../geo/screwSolids';
import { meshSource } from '../geo/revolve';
import type { SurfaceMesh } from '../geo/surface';
import { bodies } from '../geo/pieces';
import {
  CLEAR_HOLE_MM,
  LUG_THREAD_MM,
  NUT_ROOM,
  PAD,
  PAD_GAP_MM,
  SCREW,
  THREAD,
  THREAD_FIT_MAX_MM,
  THREAD_FIT_MM,
  minorRadius,
} from '../geo/thread';
import { defaultMold } from '../geo/mold/state';
import { castRays } from '../geo/release';
import { TILE_LAND_MM, TILE_PROUD_MM } from '../geo/tile';

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
    split: setup.split,
    ...over,
  };
};

describe('runJob', () => {
  it('builds every mode for a pot', () => {
    const expected: Partial<Record<Mode, string[]>> = {
      master: ['master'],
      bath: ['bath-half-A', 'bath-half-B', 'bath-bottom'],
      slump: ['slump', 'punch'],
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

  it('a hollow piece from clayform gets no slump warnings from its inside', () => {
    // the inside of a cup looks up, its rim is rounded off: neither holds the slab
    for (const name of ['cup-hollow', 'bowl']) expect(runJob(csg, jobFor(name, { mode: 'slump' })).info.warnings).toEqual([]);
  });

  it('warns that a pot narrowing to its rim will not come out of a slump mold', () => {
    const { info } = runJob(csg, jobFor('pot', { mode: 'slump' }));
    expect(info.warnings.map((m) => m.code)).toContain('press.undercut');
  });

  it('warns that a piece with a handle is not round for a slump mold', () => {
    const { info } = runJob(csg, jobFor('pot-handle', { mode: 'slump' }));
    expect(info.warnings.map((m) => m.code)).toContain('press.notRound');
  });
});

describe('slumpTooling', () => {
  it('the pressed punch never touches the mold: its legs land on the ears and graze nothing', () => {
    // the punch as printed, turned over into its pressed place: half a turn about x
    const cases: [string, number, number, number][] = [
      ['bowl', 96, 6, EAR_SEAT_MM],
      ['bowl', 96, 0.8, EAR_MIN_MM],
      ['bowl', 128, 3, EAR_MAX_MM],
      ['bowl', 384, 6, EAR_SEAT_MM],
      ['cup', 96, 2, EAR_SEAT_MM],
      ['cup', 192, 12, EAR_MAX_MM],
      ['vase', 96, 10, EAR_MIN_MM],
      ['pot', 128, 6, EAR_SEAT_MM],
    ];
    for (const [name, grid, slabMm, earMm] of cases) {
      const source = meshSource(placeModel(fixture(name), defaultOrientation()), grid, grid);
      const options = { ...pressOptions({ ...defaultMold(), slabMm, earMm }), screws: false };
      const built = slumpTooling(csg, source, options, { exporting: true, printScrews: false, printStops: false });
      const layout = punchLayout(source, options, buildSlumpShell(source, options).fit);
      const top = (layout.flangeZ + layout.flangeT) * (1 + options.shrinkPct / 100);
      const scope = new CsgScope();
      const mold = scope.keep(toManifold(csg, built.mold));
      const pressed = scope.keep(scope.keep(toManifold(csg, built.punch)).rotate([180, 0, 0]).translate([0, 0, top]));
      expect(scope.keep(mold.intersect(pressed)).volume(), `${name} grid ${grid} slab ${slabMm} ear ${earMm}`).toBeLessThan(1e-2);
      scope.dispose();
    }
  });
});

describe('slumpTooling with screws', () => {
  const N = 96;
  const build = (name: string, shrinkPct: number, exporting: boolean, print = true, threadFitMm = THREAD_FIT_MM) => {
    const source = meshSource(placeModel(fixture(name), defaultOrientation()), N, N);
    const options = { ...pressOptions({ ...defaultMold(), shrinkPct, threadFitMm }), screws: true };
    return slumpTooling(csg, source, options, { exporting, printScrews: print, printStops: print });
  };
  const solidOf = (scope: CsgScope, mesh: SurfaceMesh) => scope.keep(toManifold(csg, mesh));
  /** The punch as printed, turned over into its pressed place as a hand turns it: half a turn about x, never a mirror. */
  const pressedOf = (scope: CsgScope, mesh: SurfaceMesh, top: number) =>
    scope.keep(solidOf(scope, mesh).rotate([180, 0, 0]).translate([0, 0, top]));
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
        { exporting: true, printScrews: false, printStops: false },
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

  it.each([THREAD_FIT_MM, THREAD_FIT_MAX_MM])(
    'the threaded hole in a lug (fit %s mm) and the plain one in the tab are on one axis; the thread bites',
    (fitMm) => {
      const built = build('cup', 12, true, true, fitMm);
      const layout = built.layout;
      expect(layout).not.toBeNull();
      if (!layout) return;
      const scope = new CsgScope();
      const mold = solidOf(scope, built.mold);
      const punch = pressedOf(scope, built.punch, layout.tabTopZ);
      for (const angle of layout.angles) {
        const x = layout.axisMm * Math.cos(angle);
        const y = layout.axisMm * Math.sin(angle);
        // between the slices of the thread its faces cut the helix by a chord: under 0.1 mm at 16 per turn
        const core = minorRadius(THREAD) + fitMm - 0.1;
        expect(scope.keep(mold.intersect(column(scope, x, y, core))).volume()).toBeLessThan(1e-3);
        // the hole is not wider than the fit asks: plastic just outside its root
        const root = minorRadius(THREAD) + fitMm + 0.15;
        expect(scope.keep(mold.intersect(column(scope, x, y, root))).volume()).toBeGreaterThan(1);
        // the teeth inside the screw's crest: 50+ mm³ at a 0.35 fit, ~38 at the loosest
        expect(scope.keep(mold.intersect(column(scope, x, y, THREAD.d / 2))).volume()).toBeGreaterThan(30);
        expect(scope.keep(punch.intersect(column(scope, x, y, CLEAR_HOLE_MM / 2 - 0.05))).volume()).toBeLessThan(1e-3);
        expect(scope.keep(punch.intersect(column(scope, x, y, CLEAR_HOLE_MM / 2 + 1))).volume()).toBeGreaterThan(1);
      }
      scope.dispose();
    },
  );

  it('without the thread a lug has a plain hole: a steel M10 bolt passes the lug and the tab; the fit changes nothing', () => {
    const source = meshSource(placeModel(fixture('cup'), defaultOrientation()), N, N);
    const plainHole = (threadFitMm: number) =>
      slumpTooling(
        csg,
        source,
        { ...pressOptions({ ...defaultMold(), threadFitMm, threadedLugs: false }), screws: true },
        { exporting: true, printScrews: false, printStops: false },
      );
    const built = plainHole(THREAD_FIT_MM);
    const layout = built.layout;
    if (!layout) throw new Error('no layout');
    const loose = plainHole(THREAD_FIT_MAX_MM).mold.positions;
    // (toEqual on a hundred thousand numbers takes the better part of a minute)
    expect(loose.length === built.mold.positions.length && loose.every((v, i) => v === built.mold.positions[i])).toBe(true);
    const scope = new CsgScope();
    const mold = solidOf(scope, built.mold);
    const punch = pressedOf(scope, built.punch, layout.tabTopZ);
    for (const angle of layout.angles) {
      const x = layout.axisMm * Math.cos(angle);
      const y = layout.axisMm * Math.sin(angle);
      const bolt = column(scope, x, y, THREAD.d / 2 + 0.2);
      expect(scope.keep(mold.intersect(bolt)).volume()).toBeLessThan(1e-3);
      expect(scope.keep(punch.intersect(bolt)).volume()).toBeLessThan(1e-3);
      // a plain hole, no wider than the tab's: plastic just outside it
      expect(scope.keep(mold.intersect(column(scope, x, y, CLEAR_HOLE_MM / 2 + 0.15))).volume()).toBeGreaterThan(1);
    }
    scope.dispose();
  });

  it('a screw through the tab of the pressed punch: its neck and the cone under its head clear the hole', () => {
    const built = build('bowl', 12, true);
    const layout = built.layout;
    if (!layout) throw new Error('no layout');
    const scope = new CsgScope();
    const punch = pressedOf(scope, built.punch, layout.tabTopZ);
    // the screw head up, the head's underside on the tab's top
    const screw = scope.keep(screwSolid(csg, scope, 48).rotate([180, 0, 0]));
    for (const angle of layout.angles) {
      const placed = scope.keep(screw.translate([layout.axisMm * Math.cos(angle), layout.axisMm * Math.sin(angle), layout.tabTopZ + 0.01]));
      expect(scope.keep(placed.intersect(punch)).volume()).toBeLessThan(1e-3);
    }
    scope.dispose();
  });

  it('a stop on a seat slides under the tab of the pressed punch; lifted, its boss enters the hole', () => {
    const built = build('bowl', 12, true);
    const layout = built.layout;
    if (!layout) throw new Error('no layout');
    const scope = new CsgScope();
    const mold = solidOf(scope, built.mold);
    const pressed = pressedOf(scope, built.punch, layout.tabTopZ);
    const pad = solidOf(scope, built.pads[0]);
    const { min } = pad.boundingBox();
    for (const angle of layout.angles) {
      const x = layout.axisMm * Math.cos(angle);
      const y = layout.axisMm * Math.sin(angle);
      const placed = scope.keep(pad.translate([x - (min[0] + PAD.d / 2), y - (min[1] + PAD.d / 2), layout.seatZ + 0.01 - min[2]]));
      expect(scope.keep(placed.intersect(mold)).volume()).toBeLessThan(1e-3);
      expect(scope.keep(placed.intersect(pressed)).volume()).toBeLessThan(1e-3);
      // slid in from outside along the radius at the seat's height, it meets nothing on its way
      const out = scope.keep(placed.translate([x * 0.5, y * 0.5, 0]));
      expect(scope.keep(csg.Manifold.hull([placed, out]).intersect(pressed)).volume()).toBeLessThan(1e-3);
      // lifted by a screw from below, the boss goes into the tab's hole and the disc stops on the tab
      const lift = PAD_GAP_MM - PAD.h - 0.01;
      expect(scope.keep(scope.keep(placed.translate([0, 0, lift - 0.05])).intersect(pressed)).volume()).toBeLessThan(1e-3);
      expect(scope.keep(scope.keep(placed.translate([0, 0, lift + 0.5])).intersect(pressed)).volume()).toBeGreaterThan(1);
    }
    scope.dispose();
  });

  it('a screw turned in from below passes the mold: its shank under the lug, its head lower', () => {
    for (const [name, slabMm] of [
      ['bowl', 6],
      ['cup', 2],
      ['vase', 10],
      ['pot', 6],
    ] as const) {
      const source = meshSource(placeModel(fixture(name), defaultOrientation()), N, N);
      const options = { ...pressOptions({ ...defaultMold(), slabMm }), screws: true };
      const built = slumpTooling(csg, source, options, { exporting: true, printScrews: false, printStops: false });
      const layout = built.layout;
      if (!layout) throw new Error('no layout');
      const scope = new CsgScope();
      const mold = solidOf(scope, built.mold);
      for (const angle of layout.angles) {
        const x = layout.axisMm * Math.cos(angle);
        const y = layout.axisMm * Math.sin(angle);
        // the tip goes from the lug's bottom to 2 mm over the seat, pushing the stop
        const shank = scope.keep(
          csg.Manifold.cylinder(SCREW.shank, THREAD.d / 2 + 0.2, THREAD.d / 2 + 0.2, 32).translate([x, y, layout.landingZ - SCREW.shank]),
        );
        // the head down to the table at most: a low mold stands on blocks
        const low = Math.max(0, layout.landingZ - SCREW.shank - SCREW.headH);
        const high = Math.max(low + 0.01, layout.seatZ + 2 - SCREW.shank);
        const head = scope.keep(csg.Manifold.cylinder(high - low, SCREW.headD / 2, SCREW.headD / 2, 48).translate([x, y, low]));
        expect(scope.keep(mold.intersect(shank)).volume(), `${name} shank`).toBeLessThan(1e-2);
        expect(scope.keep(mold.intersect(head)).volume(), `${name} head`).toBeLessThan(1e-2);
      }
      scope.dispose();
    }
  });

  it('the lugs print without supports but for the landing: nothing else round them overhangs more than 45° or than the wall', () => {
    // (not on a pot or a vase: they widen below the rim, no slump mold takes them out, and the hole's wall overhangs there)
    for (const [name, slabMm, earMm] of [
      ['bowl', 6, 8],
      ['bowl', 0.8, 8],
      ['cup', 3, 4],
      ['cup', 6, 12],
    ] as const) {
      const source = meshSource(placeModel(fixture(name), defaultOrientation()), N, N);
      const options = { ...pressOptions({ ...defaultMold(), slabMm, earMm }), screws: true };
      const built = slumpTooling(csg, source, options, { exporting: true, printScrews: false, printStops: false });
      const plain = slumpTooling(csg, source, { ...options, screws: false }, { exporting: true, printScrews: false, printStops: false });
      const layout = built.layout;
      if (!layout) throw new Error('no layout');
      const step = (2 * Math.PI) / N;
      const bore = THREAD.d / 2 + layout.fitMm + 1;
      const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
      /** the steepest overhang (1 — straight down) among the faces round the lugs, outside the ears and the holes */
      const worst = (mesh: SurfaceMesh): number => {
        const { positions: P, indices: I } = mesh;
        let most = 0;
        for (let t = 0; t < I.length; t += 3) {
          const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
          const cx = (P[a] + P[b] + P[c]) / 3;
          const cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3;
          const cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
          if (cz < layout.footZ - 1 || cz > layout.seatZ) continue;
          // the landing round each hole faces down on purpose: it prints on supports
          const onLanding =
            Math.abs(cz - layout.landingZ) < 0.05 &&
            layout.angles.some(
              (angle) => Math.hypot(cx - layout.axisMm * Math.cos(angle), cy - layout.axisMm * Math.sin(angle)) < NUT_ROOM.d / 2 + 0.5,
            );
          if (onLanding) continue;
          const near = layout.angles.some((angle, i) => {
            const rel = wrap(Math.atan2(cy, cx) - layout.ears[i]);
            const far = angle - layout.ears[i] + Math.asin((BOSS_R_MM + 1.5) / layout.axisMm);
            const off = Math.hypot(cx - layout.axisMm * Math.cos(angle), cy - layout.axisMm * Math.sin(angle));
            return rel > layout.earSide + 1.5 * step && rel < far && off > bore;
          });
          if (!near) continue;
          const ab = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
          const ac = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
          const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
          const len = Math.hypot(n[0], n[1], n[2]);
          if (len > 1e-9) most = Math.max(most, -n[2] / len);
        }
        return most;
      };
      expect(worst(built.mold), name).toBeLessThan(Math.max(worst(plain.mold), Math.SQRT1_2) + 0.02);
    }
  });

  it('a flat landing round the exit of each hole, 12 mm under the seat, and room under it for a washer and a nut', () => {
    for (const [name, slabMm] of [
      ['bowl', 6],
      ['cup', 3],
      ['cup', 6],
      ['vase', 10],
    ] as const) {
      const source = meshSource(placeModel(fixture(name), defaultOrientation()), N, N);
      const options = { ...pressOptions({ ...defaultMold(), slabMm }), screws: true };
      const built = slumpTooling(csg, source, options, { exporting: true, printScrews: false, printStops: false });
      const layout = built.layout;
      if (!layout) throw new Error('no layout');
      expect(layout.seatZ - layout.landingZ).toBeCloseTo(LUG_THREAD_MM, 9);
      const scope = new CsgScope();
      const mold = solidOf(scope, built.mold);
      const inner = THREAD.d / 2 + layout.fitMm + 0.2;
      const outer = BOSS_R_MM - 0.2;
      const ring = scope.keep(
        scope.keep(csg.Manifold.cylinder(0.5, outer, outer, 96)).subtract(scope.keep(csg.Manifold.cylinder(0.5, inner, inner, 96))),
      );
      const room = scope.keep(csg.Manifold.cylinder(NUT_ROOM.h, NUT_ROOM.d / 2, NUT_ROOM.d / 2, 96));
      for (const angle of layout.angles) {
        const x = layout.axisMm * Math.cos(angle);
        const y = layout.axisMm * Math.sin(angle);
        // just over the landing the ring is plastic all round; under it nothing, the ear included
        const over = scope.keep(ring.translate([x, y, layout.landingZ + 0.01]));
        expect(scope.keep(mold.intersect(over)).volume(), `${name} slab ${slabMm}`).toBeGreaterThan(over.volume() * 0.99);
        const under = scope.keep(room.translate([x, y, layout.landingZ - NUT_ROOM.h - 0.01]));
        expect(scope.keep(mold.intersect(under)).volume(), `${name} slab ${slabMm}`).toBeLessThan(1e-2);
      }
      scope.dispose();
    }
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

  it('runJob: the mold and the punch, the screws and the stops when they are printed — the app lays them out in one STL', () => {
    const settings = defaultSettings();
    const job = (screws: boolean, printScrews: boolean, printStops = printScrews, threadedLugs = true): ToolingJob =>
      jobFor('cup', {
        mode: 'slump',
        kind: 'export',
        resolution: 128,
        mold: { ...settings.mold, screws, printScrews, printStops, threadedLugs },
      });
    const ids = (built: ToolingJob) => runJob(csg, built).parts.map((part) => part.id);
    const labels: string[] = [];
    const printed = runJob(csg, job(true, true), (progress) => labels.push(progress.label.code));
    expect(labels).toEqual(['progress.slump', 'progress.screws', 'progress.punch', 'progress.checkMeshes']);
    expect(printed.parts.map((part) => part.id)).toEqual(['slump', 'punch', 'screws', 'stops']);
    expect(printed.parts.flatMap((part) => part.blocking)).toEqual([]);
    expect(printed.parts.map((part) => bodies(part))).toEqual([1, 1, 3, 3]);
    expect(ids(job(true, false))).toEqual(['slump', 'punch']);
    // the screws and the stops each on their own
    expect(ids(job(true, true, false))).toEqual(['slump', 'punch', 'screws']);
    expect(ids(job(true, false, true))).toEqual(['slump', 'punch', 'stops']);
    // printed screws need the thread: without it the stops only
    expect(ids(job(true, true, true, false))).toEqual(['slump', 'punch', 'stops']);
    // nothing is printed without the clamps
    expect(ids(job(false, true))).toEqual(['slump', 'punch']);
  });

  it('a preview: the lugs and the tabs are laid over the mold and the punch unfused', () => {
    const built = build('cup', 0, false);
    const plain = slumpTooling(
      csg,
      meshSource(placeModel(fixture('cup'), defaultOrientation()), N, N),
      { ...pressOptions(defaultMold()), screws: false },
      { exporting: false, printScrews: false, printStops: false },
    );
    expect(bodies(built.mold)).toBe(4);
    expect(bodies(built.punch)).toBe(4);
    expect(built.mold.indices.length).toBeGreaterThan(plain.mold.indices.length);
  });

  it('the pressed punch with its tabs never touches the mold with its lugs; the lugs keep out of the cavity and the clay', () => {
    for (const [name, slabMm] of [
      ['bowl', 6],
      ['cup', 2],
      ['vase', 10],
    ] as const) {
      const source = meshSource(placeModel(fixture(name), defaultOrientation()), N, N);
      const options = { ...pressOptions({ ...defaultMold(), slabMm }), screws: true };
      const built = slumpTooling(csg, source, options, { exporting: true, printScrews: false, printStops: false });
      const layout = built.layout;
      if (!layout) throw new Error('no layout');
      const scope = new CsgScope();
      const press = (mesh: SurfaceMesh) => pressedOf(scope, mesh, layout.tabTopZ);
      expect(scope.keep(solidOf(scope, built.mold).intersect(press(built.punch))).volume(), name).toBeLessThan(1e-2);
      const lugs = lugSolids(csg, scope, layout, 16);
      // the relief itself, without the half shell the lugs are cut back by
      const k = 1 + options.shrinkPct / 100;
      const relief: [number, number][] = [[0, -1]];
      for (let i = 0; i <= 200; i++) {
        const v = i / 200;
        relief.push([(source.radiusAt(v) + source.outwardMm) * k, (v * source.heightMm + options.shellMm) * k]);
      }
      relief.push([relief[relief.length - 1][0], 1000], [0, 1000]);
      relief.splice(1, 0, [relief[1][0], -1]);
      const cavity = scope.keep(scope.keep(new csg.CrossSection([relief], 'Positive')).revolve(192));
      expect(scope.keep(lugs.intersect(cavity)).volume(), name).toBeLessThan(1e-3);
      const clay = scope.keep(
        csg.Manifold.cylinder(1000, layout.seatInMm - 0.01, layout.seatInMm - 0.01, 192).translate([0, 0, layout.shelfZ + 0.01]),
      );
      expect(scope.keep(lugs.intersect(clay)).volume(), name).toBeLessThan(1e-3);
      scope.dispose();
    }
  });
});

describe('tile mold', () => {
  const tileJob = (over: Partial<ToolingJob> = {}, name = 'keychain'): ToolingJob => jobFor(name, { mode: 'tile', ...over });

  it('the keychain: one closed mold, the tile sunk face down, the back 0.2 mm proud of the rim, no catch', () => {
    const { parts, info } = runJob(csg, tileJob({ kind: 'export' }));
    expect(parts.map((part) => part.id)).toEqual(['tile']);
    expect(info.blocking).toEqual([]);
    expect(info.catches).toEqual([{ id: 'tile', depthMm: 0, at: null }]);
    const mold = parts[0];
    expect(mold.blocking).toEqual([]);
    expect(validateMesh(mold).watertight).toBe(true);
    const shrink = 1 + defaultMold().shrinkPct / 100;
    const [w, d, h] = mold.note.split('×').map(Number);
    // the plate 55 × 33 grown by the shrinkage and by the land round it
    expect(w).toBeCloseTo(55 * shrink + 2 * TILE_LAND_MM, -0.5);
    expect(d).toBeCloseTo(33 * shrink + 2 * TILE_LAND_MM, -0.5);
    // the floor under the face, the tile's thickness less the proud back
    expect(h).toBeCloseTo(defaultMold().bathWallMm + 4.5 * shrink - TILE_PROUD_MM, 0);
  });

  it('the ring hole is a post up to the rim; a letter is a dimple in the floor', () => {
    const { parts } = runJob(csg, tileJob());
    const mold = parts[0];
    const shrink = 1 + defaultMold().shrinkPct / 100;
    const rays = castRays(mold, 2, 0.25);
    const top = (x: number, y: number): number => {
      const node = rays.nodeAt(x, y);
      return rays.values[rays.start[node + 1] - 1];
    };
    const rim = defaultMold().bathWallMm + 4.5 * shrink - TILE_PROUD_MM;
    // the mold in its own frame: centre it on the plate as the bed lays it out
    const box = validateMesh(mold).bbox;
    const cx = (box.min[0] + box.max[0]) / 2;
    const cy = (box.min[1] + box.max[1]) / 2;
    // turned over about x: x stays, y changes sign — the hole (x = −22.4) stays at the left
    expect(top(cx - 22.35 * shrink, cy)).toBeCloseTo(rim, 1);
    // the field of the plate below the letters (y = −12, turned to +12): the floor of the cavity, 3 mm under the back
    expect(top(cx + 10 * shrink, cy + 12 * shrink)).toBeCloseTo(rim - 3 * shrink + TILE_PROUD_MM, 1);
  });

  it('the keychain face down: its back is not flat — refused, the back named', () => {
    const { parts, info } = runJob(csg, tileJob({ model: placeModel(fixture('keychain'), { turn: flip(IDENTITY_TURN), spinDeg: 0 }) }));
    expect(parts.map((part) => part.id)).toEqual(['tile']);
    expect(info.blocking.map((m) => m.code)).toEqual(['tile.back']);
    expect(info.catches[0].depthMm).toBeGreaterThan(1);
  });

  it('a bowl is no tile: the mold catches under its flaring wall, refused however much is allowed', () => {
    const { info } = runJob(csg, tileJob({ mold: { ...defaultMold(), allowedCatchMm: 6 } }, 'bowl'));
    expect(info.blocking.map((m) => m.code)).toEqual(['tile.back']);
    expect(info.catches[0].depthMm).toBeGreaterThan(6);
  });

  it('a relief overhanging the face catches under the overhang', () => {
    const scope = new CsgScope();
    try {
      // a plate with a mushroom on it: the cap overhangs its stem by 4 mm, 2 mm over the plate
      const plate = scope.keep(csg.Manifold.cube([40, 40, 3], true).translate([0, 0, 1.5]));
      const stem = scope.keep(csg.Manifold.cylinder(2.5, 2, 2, 48).translate([0, 0, 3]));
      const cap = scope.keep(csg.Manifold.cylinder(1, 6, 6, 48).translate([0, 0, 5]));
      const mushroom = fromManifold(scope.keep(csg.Manifold.union([plate, stem, cap])));
      const { info } = runJob(csg, tileJob({ model: placeModel(mushroom, defaultOrientation()) }));
      expect(info.blocking.map((m) => m.code)).toEqual(['tile.catch']);
      expect(info.catches[0].depthMm).toBeGreaterThan(1);
      expect(info.catches[0].at?.[2]).toBeGreaterThan(3);
    } finally {
      scope.dispose();
    }
  });

  it('a catch within the allowed one passes', () => {
    const face = { model: placeModel(fixture('keychain'), { turn: flip(IDENTITY_TURN), spinDeg: 0 }) };
    expect(runJob(csg, tileJob({ ...face, mold: { ...defaultMold(), allowedCatchMm: 3 } })).info.blocking).toEqual([]);
  });

  it('refuses a model that is not a solid', () => {
    const open = jobFor('keychain', { mode: 'tile' });
    const broken = { positions: open.model.positions, indices: open.model.indices.slice(3) };
    const { parts, info } = runJob(csg, { ...open, model: broken });
    expect(parts).toEqual([]);
    expect(info.blocking.map((m) => m.code)).toEqual(['model.notSolid']);
  });
});

describe('split mold', () => {
  const splitJob = (model: IndexedMesh, over: Partial<ToolingJob> = {}): ToolingJob => ({
    ...jobFor('cup', { mode: 'split' }),
    model: placeModel(model, defaultOrientation()),
    ...over,
  });

  it('a wavy vase: two closed shells, nothing catches, printed parting face up', () => {
    const { parts, info } = runJob(csg, splitJob(wavyVase(csg), { kind: 'export' }));
    expect(info.status).toBe('filled');
    expect(parts.map((part) => part.id)).toEqual(['split-A', 'split-B']);
    expect(info.blocking).toEqual([]);
    expect(info.catches.map((c) => [c.id, c.depthMm])).toEqual([
      ['split-A', 0],
      ['split-B', 0],
    ]);
    const shrink = 1 + defaultMold().shrinkPct / 100;
    for (const part of parts) {
      const report = validateMesh(part);
      expect(report.watertight, part.id).toBe(true);
      expect(bodies(part), part.id).toBe(1);
      expect(part.blocking, part.id).toEqual([]);
      expect(report.bbox.min[2]).toBeCloseTo(0, 3);
      // the half's depth from the plane: the vase's radius and the wall behind it
      expect(report.extents[2]).toBeGreaterThan(30 * shrink + defaultMold().bathWallMm - 0.5);
      expect(report.extents[2]).toBeLessThan(30 * shrink + defaultMold().bathWallMm + 2);
      // the parting face is the top: a ray down the middle of the cavity meets the mold only under the piece
      const rays = castRays(part, 2, 1);
      const centre = rays.nodeAt((report.bbox.min[0] + report.bbox.max[0]) / 2, (report.bbox.min[1] + report.bbox.max[1]) / 2);
      const hits = rays.values.subarray(rays.start[centre], rays.start[centre + 1]);
      expect(hits[hits.length - 1]).toBeLessThan(report.extents[2] - 20);
    }
  });

  it('a ball split under its equator: the upper half catches on the bulge — refused, the half named; allowed deeper, it builds', () => {
    const scope = new CsgScope();
    try {
      const ball = fromManifold(scope.keep(csg.Manifold.sphere(30, 128)));
      const job = splitJob(ball, { split: { axis: 'z', pct: 30 } });
      const { parts, info } = runJob(csg, job);
      expect(parts).toHaveLength(2);
      expect(info.status).toBe('solid');
      const shrink = 1 + defaultMold().shrinkPct / 100;
      const [a, b] = info.catches;
      expect(a.depthMm).toBe(0);
      expect(b.depthMm).toBeCloseTo(30 * shrink * (Math.hypot(0.4, 1) - 1), 0);
      expect(info.blocking).toEqual([{ code: 'split.catch', params: expect.objectContaining({ half: 'B', limit: '1.0' }) }]);
      expect(runJob(csg, { ...job, mold: { ...defaultMold(), allowedCatchMm: 3 } }).info.blocking).toEqual([]);
    } finally {
      scope.dispose();
    }
  });

  it('a body of revolution splits through its axis clean, by x and by y', () => {
    for (const axis of ['x', 'y'] as const) {
      const { info } = runJob(csg, { ...jobFor('cup-hollow', { mode: 'split' }), split: { axis, pct: 50 } });
      expect(info.blocking, axis).toEqual([]);
      expect(info.catches.map((c) => c.depthMm)).toEqual([0, 0]);
    }
  });

  it('Find: the plane and the spin with the shallowest catch, no parts built', () => {
    const scope = new CsgScope();
    try {
      // a block with a blind hole into its +y face: across x it catches, a quarter turn opens it
      const block = scope.keep(csg.Manifold.cube([40, 40, 40], true).translate([0, 0, 20]));
      const drill = scope.keep(scope.keep(scope.keep(csg.Manifold.cylinder(15, 4, 4, 48)).rotate([-90, 0, 0])).translate([10, 6, 20]));
      const job = splitJob(fromManifold(scope.keep(block.subtract(drill))), { split: { axis: 'x', pct: 50 } });
      expect(runJob(csg, job).info.blocking.map((m) => m.code)).toEqual(['split.catch']);
      const steps: JobProgress[] = [];
      const { parts, found } = runJob(csg, { ...job, kind: 'find' }, (step) => steps.push(step));
      expect(parts).toEqual([]);
      expect(found).toMatchObject({ spinDeg: 90, depthMm: 0 });
      expect(steps.length).toBeGreaterThan(2);
      expect(steps.every((step, i) => step.step === i && step.step < step.total)).toBe(true);
    } finally {
      scope.dispose();
    }
  });

  it('a lid as printed is refused: it has to be turned over first', () => {
    const { parts, info } = runJob(csg, jobFor('lid-printed', { mode: 'split' }));
    expect(parts).toEqual([]);
    expect(info.blocking.map((m) => m.code)).toEqual(['model.openBottom']);
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
