// The casting tooling: the parting scheme, plaster blocks, the master
// positive and the pour boxes for silicone.
//
// We check not "does it look right" but that the mold physically works: the
// parts fold back into a whole block, the keys of one part match the dimples
// of the other exactly, the cavity is bigger than the piece by exactly the
// shrinkage, and a pour box holds the positive of its block — hollow from
// below, with a shell no thinner than its wall.

import type { Manifold } from 'manifold-3d';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from '../csg';
import { CsgScope, fromManifold, initCSG, toManifold } from '../csg';
import { defaultOrientation, placeModel } from '../model';
import { guessMouth } from '../mouth';
import { fixture, revolveMesh, withNormals } from '../testing';
import { validateMesh } from '../validate';
import { analyzeMold, pullUndercut, withScheme } from './analyze';
import { buildBaths, buildBlocks, buildMaster } from './index';
import type { Mouth } from './index';
import { defaultMold, sanitizeMold } from './state';
import { THREAD_FIT_MAX_MM, THREAD_FIT_MIN_MM, THREAD_FIT_MM } from '../thread';
import { undersideVoid } from './underside';

let csg: CsgApi;
const scope = new CsgScope();
beforeAll(async () => {
  csg = await initCSG();
});
afterAll(() => scope.dispose());

const meshOf = (name: string) => placeModel(fixture(name), defaultOrientation());
const solidOf = (name: string): Manifold => scope.keep(toManifold(csg, meshOf(name)));
const reportOf = (name: string) => analyzeMold(meshOf(name), { hasHandle: solidOf(name).genus() > 0 });
const mold = (over: Record<string, unknown> = {}) => sanitizeMold({ ...defaultMold(), ...over });
const sizeOf = (name: string) => validateMesh(withNormals(meshOf(name)));

describe('pullUndercut', () => {
  it('a cone widening upwards comes out upwards without catching', () => {
    const cone = revolveMesh((t) => 20 + 60 * t, { nu: 64, nv: 32, height: 80 });
    expect(pullUndercut(cone, 'up').fraction).toBeLessThan(1e-6);
  });

  it('a cone narrowing upwards does not come out upwards', () => {
    const cone = revolveMesh((t) => 80 - 60 * t, { nu: 64, nv: 32, height: 80 });
    expect(pullUndercut(cone, 'up').fraction).toBeGreaterThan(0.5);
  });

  it('a flat bottom is no undercut — it is the floor of the mold', () => {
    const cylinder = revolveMesh(() => 40, { nu: 64, nv: 16, height: 60 });
    expect(pullUndercut(cylinder, 'up').fraction).toBeLessThan(1e-6);
  });

  it('any body of revolution splits into two halves without catching', () => {
    for (const radius of [
      (t: number) => 20 + 60 * t,
      (t: number) => 80 - 60 * t,
      (t: number) => 40 + 30 * Math.sin(Math.PI * t),
      (t: number) => 60 - 40 * Math.sin(Math.PI * t),
    ]) {
      const mesh = revolveMesh(radius, { nu: 128, nv: 64, height: 120 });
      expect(pullUndercut(mesh, 'sides').fraction).toBeLessThan(1e-3);
    }
  });
});

describe('analyzeMold — the choice of scheme', () => {
  it('a bowl comes out upwards: a one-part mold', () => {
    const report = reportOf('bowl');
    expect(report.scheme).toBe('dropout');
    expect(report.parts).toHaveLength(1);
    expect(report.reason.map((m) => m.code)).toEqual(['mold.dropout']);
  });

  it('a pot with a neck narrower than its body needs halves, and its wide bottom a plate', () => {
    const report = reportOf('pot');
    expect(report.dropoutUndercut).toBeGreaterThan(0.01);
    expect(report.scheme).toBe('halves-bottom');
    expect(report.parts.map((p) => p.id)).toEqual(['half-A', 'half-B', 'bottom']);
  });

  it('a vase on a narrow foot does with two halves', () => {
    const report = reportOf('vase');
    expect(report.scheme).toBe('halves');
    expect(report.parts.map((p) => p.id)).toEqual(['half-A', 'half-B']);
  });

  it('a handle is a through hole: the genus says so and a one-part mold is out', () => {
    expect(solidOf('pot-handle').genus()).toBe(1);
    expect(solidOf('pot').genus()).toBe(0);
    const report = reportOf('pot-handle');
    expect(report.scheme).not.toBe('dropout');
    expect(report.reason[0].code).toBe('mold.whyHandle');
  });

  it('a scheme picked by hand replaces the parts and says it was picked', () => {
    const report = withScheme(reportOf('bowl'), 'halves-bottom');
    expect(report.parts.map((p) => p.id)).toEqual(['half-A', 'half-B', 'bottom']);
    expect(report.reason.map((m) => m.code)).toEqual(['mold.manual']);
    expect(withScheme(reportOf('vase'), 'halves')).toEqual(reportOf('vase'));
  });

  it('a plug adds a part', () => {
    expect(analyzeMold(meshOf('pot'), { hasHandle: false, hasPlug: true }).parts.at(-1)?.id).toBe('plug');
  });
});

describe('guessMouth', () => {
  it('a solid vessel: the flat top, its edge the rim', () => {
    const pot = meshOf('pot');
    const mouth = guessMouth(pot);
    const top = sizeOf('pot').bbox.max[2];
    expect(mouth.zMm).toBeCloseTo(top, 3);
    let rim = 0;
    for (let i = 0; i < pot.positions.length; i += 3) {
      if (pot.positions[i + 2] > top - 1e-3) rim = Math.max(rim, Math.hypot(pot.positions[i], pot.positions[i + 1]));
    }
    expect(mouth.radiusMm).toBeCloseTo(rim, 3);
  });

  it('a teapot: the rim, not the higher tip of the spout', () => {
    const teapot = meshOf('teapot');
    const mouth = guessMouth(teapot);
    expect(sizeOf('teapot').bbox.max[2]).toBeGreaterThan(mouth.zMm + 5);
    expect(mouth.zMm).toBeCloseTo(120, 1);
    expect(mouth.radiusMm).toBeGreaterThan(30);
  });
});

describe('plaster blocks', () => {
  it('the number of parts matches the scheme', () => {
    expect(buildBlocks(csg, solidOf('bowl'), reportOf('bowl'), mold())).toHaveLength(1);
    expect(buildBlocks(csg, solidOf('pot'), reportOf('pot'), mold())).toHaveLength(3);
    expect(buildBlocks(csg, solidOf('vase'), reportOf('vase'), mold())).toHaveLength(2);
  });

  it('every part is a closed solid with normals out', () => {
    for (const name of ['pot', 'bowl', 'cup', 'vase']) {
      for (const part of buildBlocks(csg, solidOf(name), reportOf(name), mold())) {
        const report = validateMesh(part.mesh);
        expect(report.watertight, `${name}/${part.id}`).toBe(true);
        expect(report.volume, `${name}/${part.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('the keys of one half exactly match the dimples of the other', () => {
    // a bump added to half B is taken from half A, so the sum of volumes does not depend on the keys
    const sum = (parts: { mesh: Parameters<typeof validateMesh>[0] }[]) =>
      parts.reduce((total, part) => total + validateMesh(part.mesh).volume, 0);
    const withKeys = buildBlocks(csg, solidOf('vase'), reportOf('vase'), mold({ keyMm: 8 }));
    const noKeys = buildBlocks(csg, solidOf('vase'), reportOf('vase'), mold({ keyMm: 0 }));
    expect(sum(withKeys)).toBeCloseTo(sum(noKeys), 0);
  });

  it('the shrinkage makes the cavity bigger than the piece by the percentage, with the plaster round it', () => {
    const widest = Math.max(...sizeOf('pot').extents.slice(0, 2));
    const plasterMm = 30;
    const shrinkPct = 12;
    const blocks = buildBlocks(csg, solidOf('pot'), reportOf('pot'), mold({ plasterMm, shrinkPct }));
    const outerWidth = Math.max(
      ...blocks.map((p) => {
        const { bbox } = validateMesh(p.mesh);
        return bbox.max[0] - bbox.min[0];
      }),
    );
    expect(outerWidth).toBeCloseTo(widest * (1 + shrinkPct / 100) + 2 * plasterMm, 0);
  });

  it('a one-part mold is open at the top — the slip is poured there', () => {
    const [single] = buildBlocks(csg, solidOf('bowl'), reportOf('bowl'), mold());
    expect(validateMesh(single.mesh).bbox.max[2]).toBeCloseTo(sizeOf('bowl').extents[2] * (1 + defaultMold().shrinkPct / 100), 0);
  });

  it('the plaster never gets into the body of the piece', () => {
    const state = mold();
    const piece = scope.keep(solidOf('pot').scale(1 + state.shrinkPct / 100));
    for (const part of buildBlocks(csg, solidOf('pot'), reportOf('pot'), state)) {
      const solid = scope.keep(toManifold(csg, part.mesh));
      expect(scope.keep(solid.intersect(piece)).volume(), part.id).toBeLessThan(piece.volume() * 1e-4);
    }
  });

  it('the halves folded back give a whole block', () => {
    const solids = buildBlocks(csg, solidOf('vase'), reportOf('vase'), mold()).map((part) => scope.keep(toManifold(csg, part.mesh)));
    const assembled = scope.keep(csg.Manifold.union(solids));
    const sum = solids.reduce((total, solid) => total + solid.volume(), 0);
    expect(assembled.volume()).toBeCloseTo(sum, 0);
    expect(scope.keep(solids[0].intersect(solids[1])).volume()).toBeLessThan(sum * 1e-6);
  });

  it('a piece with a handle gets a mold too', () => {
    const blocks = buildBlocks(csg, solidOf('pot-handle'), reportOf('pot-handle'), mold());
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const part of blocks) expect(validateMesh(part.mesh).watertight, part.id).toBe(true);
  });
});

describe('master positive', () => {
  it('is the piece with a pouring collar on top', () => {
    const master = buildMaster(csg, solidOf('pot'), reportOf('pot'), mold({ spareMm: 30, shrinkPct: 0 }))[0];
    const before = sizeOf('pot');
    const after = validateMesh(master.mesh);
    expect(after.watertight).toBe(true);
    expect(after.extents[2]).toBeCloseTo(before.extents[2] + 30, 0);
    expect(after.volume).toBeGreaterThan(before.volume);
  });

  it('the shrinkage grows the whole master', () => {
    const plain = validateMesh(buildMaster(csg, solidOf('cup'), reportOf('cup'), mold({ shrinkPct: 0, spareMm: 0 }))[0].mesh);
    const grown = validateMesh(buildMaster(csg, solidOf('cup'), reportOf('cup'), mold({ shrinkPct: 15, spareMm: 0 }))[0].mesh);
    expect(grown.extents[0]).toBeCloseTo(plain.extents[0] * 1.15, 0);
    expect(grown.extents[2]).toBeCloseTo(plain.extents[2] * 1.15, 0);
  });

  it('the collar stands on the rim, not on the highest point', () => {
    // The tip of a teapot's spout is the highest. A collar there would give
    // the master a mushroom hat as wide as the spout reaches.
    const mouth = guessMouth(meshOf('teapot'));
    const spareMm = 30;
    const master = buildMaster(csg, solidOf('teapot'), reportOf('teapot'), mold({ shrinkPct: 0, spareMm }), { mouth })[0];
    const grew = validateMesh(master.mesh).volume - sizeOf('teapot').volume;
    const collarHeight = validateMesh(master.mesh).bbox.max[2] - mouth.zMm + 1;
    expect(grew).toBeGreaterThan(0);
    expect(grew).toBeLessThan(Math.PI * mouth.radiusMm ** 2 * collarHeight * 1.05);
    // and the master stays one connected part
    expect(
      scope
        .keep(toManifold(csg, master.mesh))
        .decompose()
        .map((solid) => scope.keep(solid)),
    ).toHaveLength(1);
  });

  it('a bowl needs no collar — the slip is poured straight into the open mold', () => {
    const master = buildMaster(csg, solidOf('bowl'), reportOf('bowl'), mold({ spareMm: 40, shrinkPct: 0 }))[0];
    expect(validateMesh(master.mesh).extents[2]).toBeCloseTo(sizeOf('bowl').extents[2], 0);
  });
});

describe('tooling for a lid', () => {
  // A lid goes into the mold upside down: the skirt looks up and its end
  // becomes the mouth. The knob then points down, and its neck is an undercut.
  const lidMouth = (): Mouth => {
    const guess = guessMouth(meshOf('lid-upside-down'));
    // narrower than the skirt: a collar exactly on it would be a cylinder in a cylinder
    return { zMm: guess.zMm, radiusMm: guess.radiusMm - 1.5 };
  };

  it('needs a split along the axis: the knob does not let it out upwards', () => {
    expect(reportOf('lid-upside-down').scheme).not.toBe('dropout');
  });

  it('its master is one part with the collar over the skirt, without slivers', () => {
    const master = buildMaster(csg, solidOf('lid-upside-down'), reportOf('lid-upside-down'), mold({ spareMm: 25, shrinkPct: 0 }), {
      mouth: lidMouth(),
    })[0];
    const report = validateMesh(master.mesh);
    expect(report.watertight).toBe(true);
    expect(report.extents[2]).toBeCloseTo(sizeOf('lid-upside-down').extents[2] + 25, 0);
    expect(report.degenerateTriangles).toBe(0);
    expect(
      scope
        .keep(toManifold(csg, master.mesh))
        .decompose()
        .map((solid) => scope.keep(solid)),
    ).toHaveLength(1);
  });

  it('has its own pour boxes, and each prints', () => {
    const baths = buildBaths(csg, solidOf('lid-upside-down'), reportOf('lid-upside-down'), mold(), { mouth: lidMouth() });
    expect(baths).toHaveLength(reportOf('lid-upside-down').parts.length);
    for (const bath of baths) {
      const report = validateMesh(bath.mesh);
      expect(report.watertight, bath.id).toBe(true);
      expect(report.bbox.min[2], bath.id).toBeCloseTo(0, 3);
    }
  });
});

describe('pour boxes for silicone', () => {
  it('one box for each part of the mold', () => {
    expect(buildBaths(csg, solidOf('bowl'), reportOf('bowl'), mold())).toHaveLength(1);
    expect(buildBaths(csg, solidOf('pot'), reportOf('pot'), mold())).toHaveLength(3);
  });

  it('every box prints: closed and standing on the table', () => {
    for (const name of ['pot', 'bowl', 'vase']) {
      for (const bath of buildBaths(csg, solidOf(name), reportOf(name), mold())) {
        const report = validateMesh(bath.mesh);
        expect(report.watertight, `${name}/${bath.id}`).toBe(true);
        expect(report.volume, `${name}/${bath.id}`).toBeGreaterThan(0);
        expect(report.bbox.min[2], `${name}/${bath.id}`).toBeCloseTo(0, 3);
      }
    }
  });

  it('a box holds its block with room for silicone, working surface up', () => {
    const blocks = buildBlocks(csg, solidOf('vase'), reportOf('vase'), mold());
    const baths = buildBaths(csg, solidOf('vase'), reportOf('vase'), mold());
    const { bathClearMm: clear, bathWallMm: wall } = defaultMold();
    for (let i = 0; i < blocks.length; i++) {
      const block = validateMesh(blocks[i].mesh).extents;
      const bath = validateMesh(baths[i].mesh);
      const widest = Math.max(block[0], block[1], block[2]);
      const bathWidest = Math.max(bath.extents[0], bath.extents[1]);
      expect(bathWidest).toBeGreaterThan(widest);
      expect(bathWidest).toBeLessThan(widest + 4 * (clear + wall));
      // a half lies parting plane up: lower than it is wide
      expect(bath.extents[2]).toBeLessThan(bath.extents[0]);
    }
  });

  it('the positive in a box is hollow from below — plastic only in the shell', () => {
    const blocks = buildBlocks(csg, solidOf('vase'), reportOf('vase'), mold());
    const baths = buildBaths(csg, solidOf('vase'), reportOf('vase'), mold());
    for (let i = 0; i < blocks.length; i++) {
      const block = scope.keep(toManifold(csg, blocks[i].mesh));
      const bath = scope.keep(toManifold(csg, baths[i].mesh));
      expect(bath.volume(), baths[i].id).toBeLessThan(block.volume() * 0.6);
    }
  });

  it('a teapot with an applied spout gets boxes too', () => {
    const report = reportOf('teapot');
    expect(report.scheme).not.toBe('dropout');
    const baths = buildBaths(csg, solidOf('teapot'), report, mold(), { mouth: guessMouth(meshOf('teapot')) });
    expect(baths.length).toBeGreaterThanOrEqual(2);
    for (const bath of baths) {
      const check = validateMesh(bath.mesh);
      expect(check.watertight, bath.id).toBe(true);
      expect(check.bbox.min[2], bath.id).toBeCloseTo(0, 3);
    }
  });
});

describe('the void under the positive of a box', () => {
  // A positive with a bowl-shaped dip and a vertical pocket: the pocket's
  // walls are like a half's cavity at the seam — where a vertical shift of
  // the surface would thin the shell to nothing.
  const shellMm = 3;
  const withPositive = (check: (positive: Manifold, hollow: Manifold) => void) => {
    const block = scope.keep(csg.Manifold.cube([80, 60, 40], true).translate([0, 0, 20]));
    const bowl = scope.keep(csg.Manifold.sphere(22, 64).translate([-12, 0, 40]));
    const pocket = scope.keep(csg.Manifold.cylinder(30, 8, 8, 48).translate([24, 0, 15]));
    const positive = scope.keep(scope.keep(block.subtract(bowl)).subtract(pocket));
    const hollow = undersideVoid(csg, scope, positive, shellMm, 3);
    expect(hollow).not.toBeNull();
    if (hollow) check(positive, hollow);
  };

  it('keeps a shell from the air above and round the positive everywhere', () => {
    withPositive((positive, hollow) => {
      const room = scope.keep(csg.Manifold.cube([200, 200, 100], true).translate([0, 0, 50]));
      const air = scope.keep(room.subtract(positive));
      // a tenth of a mm is the sampling: the ceiling between grid nodes is flat
      expect(hollow.minGap(air, 10)).toBeGreaterThan(shellMm - 0.1);
    });
  });

  it('is open to the table and takes most of the positive', () => {
    withPositive((positive, hollow) => {
      expect(hollow.boundingBox().min[2]).toBeLessThan(-3);
      const inside = scope.keep(hollow.trimByPlane([0, 0, 1], 0));
      expect(inside.volume()).toBeGreaterThan(positive.volume() * 0.5);
    });
  });

  it('a positive thinner than the shell has no void', () => {
    const thin = scope.keep(csg.Manifold.cube([80, 60, 4], true).translate([0, 0, 2]));
    expect(undersideVoid(csg, scope, thin, shellMm, 3)).toBeNull();
  });
});

describe('sanitizeMold', () => {
  it('never throws on junk and clamps to sane limits', () => {
    for (const raw of [null, 'plaster', 42, { plasterMm: NaN, shrinkPct: 1e6 }]) {
      const state = sanitizeMold(raw);
      expect(Number.isFinite(state.plasterMm)).toBe(true);
      expect(state.shrinkPct).toBeLessThanOrEqual(30);
      expect(state.plasterMm).toBeGreaterThan(0);
    }
  });

  it('a key is never more than a third of the plaster — it would press through', () => {
    expect(sanitizeMold({ plasterMm: 15, keyMm: 40 }).keyMm).toBeLessThanOrEqual(5);
  });

  it('is idempotent', () => {
    const once = sanitizeMold({ shrinkPct: 9.5, plasterMm: 22, slabMm: 100, screws: true, printScrews: 'yes' });
    expect(sanitizeMold(once)).toEqual(once);
  });

  it('the screw clamps are off by default and take only booleans', () => {
    expect(defaultMold()).toMatchObject({ screws: false, printScrews: false });
    expect(sanitizeMold({ screws: true, printScrews: true })).toMatchObject({ screws: true, printScrews: true });
    expect(sanitizeMold({ screws: 1, printScrews: 'true' })).toMatchObject({ screws: false, printScrews: false });
  });

  it('the lugs are threaded by default; the choice takes only a boolean', () => {
    expect(defaultMold().threadedLugs).toBe(true);
    expect(sanitizeMold({ threadedLugs: false }).threadedLugs).toBe(false);
    expect(sanitizeMold({ threadedLugs: 'no' }).threadedLugs).toBe(true);
    const once = sanitizeMold({ threadedLugs: false });
    expect(sanitizeMold(once)).toEqual(once);
  });

  it('the thread fit is 0.5 mm by default, clamped to 0.2–0.7', () => {
    expect(defaultMold().threadFitMm).toBe(THREAD_FIT_MM);
    expect(THREAD_FIT_MM).toBe(0.5);
    expect(sanitizeMold({ threadFitMm: 0.6 }).threadFitMm).toBe(0.6);
    expect(sanitizeMold({ threadFitMm: 0 }).threadFitMm).toBe(THREAD_FIT_MIN_MM);
    expect(sanitizeMold({ threadFitMm: 5 }).threadFitMm).toBe(THREAD_FIT_MAX_MM);
    expect(sanitizeMold({ threadFitMm: '0.6' }).threadFitMm).toBe(THREAD_FIT_MM);
    const once = sanitizeMold({ threadFitMm: 9 });
    expect(sanitizeMold(once)).toEqual(once);
  });
});

describe('the mouth plug for a recessed lid', () => {
  // The ledge of a recessed lid lies below the rim, where the plaster of the
  // halves cannot reach. A plug casts it — a separate part entering the mouth from above.
  const rim = () => guessMouth(meshOf('pot'));
  const mouthFor = (recessMm: number): Mouth => {
    const { zMm, radiusMm } = rim();
    return { zMm, radiusMm: radiusMm - 6, ...(recessMm > 0 ? { plug: { recessMm, galleryMm: radiusMm - 3, rimMm: radiusMm } } : {}) };
  };
  const reportFor = (hasPlug: boolean) => analyzeMold(meshOf('pot'), { hasHandle: false, hasPlug });

  it('without a recess nothing changes', () => {
    const plain = buildBlocks(csg, solidOf('pot'), reportFor(false), mold(), { mouth: mouthFor(0) });
    expect(plain.map((part) => part.id)).toEqual(reportFor(false).parts.map((part) => part.id));
  });

  it('with a recess one part more, as the analyzer says', () => {
    const blocks = buildBlocks(csg, solidOf('pot'), reportFor(true), mold(), { mouth: mouthFor(6) });
    expect(blocks.map((part) => part.id)).toEqual(reportFor(true).parts.map((part) => part.id));
  });

  it('the plug is closed, its ring reaches the ledge, its hole is the gate', () => {
    const blocks = buildBlocks(csg, solidOf('pot'), reportFor(true), mold({ shrinkPct: 10, keyMm: 0 }), { mouth: mouthFor(6) });
    const plug = blocks.find((part) => part.id === 'plug');
    if (!plug) throw new Error('no plug');
    const report = validateMesh(plug.mesh);
    expect(report.watertight).toBe(true);
    expect(report.bbox.min[2]).toBeCloseTo((rim().zMm - 6) * 1.1, 3);
    let hole = Infinity;
    const { positions } = plug.mesh;
    for (let i = 0; i < positions.length; i += 3) hole = Math.min(hole, Math.hypot(positions[i], positions[i + 1]));
    expect(hole).toBeCloseTo(mouthFor(6).radiusMm * 1.1, 2);
  });

  it('the socket is wider than the flange: no coincident cylinders, no slivers', () => {
    for (const part of buildBlocks(csg, solidOf('pot'), reportFor(true), mold(), { mouth: mouthFor(6) })) {
      expect(validateMesh(part.mesh).degenerateTriangles, part.id).toBe(0);
    }
  });

  it('the master gives the plug as a second part', () => {
    const master = buildMaster(csg, solidOf('pot'), reportFor(true), mold(), { mouth: mouthFor(6) });
    expect(master.map((part) => part.id)).toEqual(['master', 'plug']);
    expect(validateMesh(master[0].mesh).watertight).toBe(true);
  });
});

describe('fromManifold', () => {
  it('round-trips a fixture', () => {
    expect(validateMesh(fromManifold(solidOf('vase'))).watertight).toBe(true);
  });
});
