import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from 'maker-kit/csg/manifold';
import { CsgScope, fromManifold, initCSG, toManifold } from 'maker-kit/csg/manifold';
import { placeModel, defaultOrientation } from '../model';
import { solidify } from '../solidify';
import { fixture, wavyVase } from '../testing';
import { RIM_BELOW_MM, rimCut } from './rim';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

/** The vase filled as a job fills it, with its rim. */
function filled(mesh: { positions: Float32Array; indices: Uint32Array }) {
  const scope = new CsgScope();
  try {
    const solid = solidify(csg, scope, scope.keep(toManifold(csg, mesh, { merge: true })));
    return { mesh: fromManifold(solid.solid), rim: solid.rim, status: solid.status };
  } finally {
    scope.dispose();
  }
}

describe('rimCut', () => {
  it('reads a wavy rim: the top of the wall at every angle, the inside of the mouth', () => {
    const vase = filled(wavyVase(csg));
    expect(vase.status).toBe('filled');
    // the lid stands at the troughs
    expect(vase.rim?.zMm).toBeCloseTo(55, 0);
    const cut = rimCut(vase.mesh, vase.rim?.zMm ?? 0, vase.rim?.radiusMm ?? 0);
    expect(cut).not.toBeNull();
    if (!cut) return;
    for (const deg of [0, 30, 45, 90, 150, 210, 270]) {
      const u = (deg * Math.PI) / 180;
      expect(cut.topAt(u), `${deg}°`).toBeCloseTo(60 + 5 * Math.sin(3 * u), 0);
      // the mouth is the inside of the wall, read over the lid where the wall is whole
      expect(cut.coreAt(u), `${deg}°`).toBeCloseTo(28, 0);
    }
  });

  it('takes the mold over the rim and inside the mouth, keeps it outside the wall', () => {
    const vase = filled(wavyVase(csg));
    const cut = rimCut(vase.mesh, vase.rim?.zMm ?? 0, vase.rim?.radiusMm ?? 0);
    if (!cut) throw new Error('no rim');
    // a crest at 30° stands to 65, a trough at 90° to 55
    const at = (deg: number, r: number, z: number): boolean =>
      cut.contains(r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180), z);
    expect(at(30, 31, 65 - RIM_BELOW_MM + 0.1)).toBe(true);
    expect(at(30, 31, 64)).toBe(false);
    expect(at(90, 31, 55)).toBe(true);
    expect(at(90, 31, 54)).toBe(false);
    // inside the crest at 30°: no mold there
    expect(at(30, 20, 60)).toBe(true);
    expect(at(30, 20, 50)).toBe(false);
  });

  it('builds a closed cutter that does the same', () => {
    const vase = filled(wavyVase(csg));
    const cut = rimCut(vase.mesh, vase.rim?.zMm ?? 0, vase.rim?.radiusMm ?? 0);
    if (!cut) throw new Error('no rim');
    const scope = new CsgScope();
    try {
      const parts = cut.meshes(80, 100).map((mesh) => scope.keep(toManifold(csg, mesh)));
      const cutter = scope.keep(csg.Manifold.union(parts));
      expect(cutter.volume()).toBeGreaterThan(0);
      const probe = (x: number, y: number, z: number): number =>
        scope.keep(cutter.intersect(scope.keep(csg.Manifold.cube([0.2, 0.2, 0.2], true).translate([x, y, z])))).volume();
      expect(probe(31 * Math.cos(Math.PI / 6), 31 * Math.sin(Math.PI / 6), 65)).toBeGreaterThan(0);
      expect(probe(31 * Math.cos(Math.PI / 6), 31 * Math.sin(Math.PI / 6), 63)).toBe(0);
      expect(probe(0, 31, 54)).toBe(0);
      expect(probe(10, 0, 56)).toBeGreaterThan(0);
    } finally {
      scope.dispose();
    }
  });

  it('a flat rim gives a plane over it', () => {
    const cup = filled(placeModel(fixture('cup-hollow'), defaultOrientation()));
    const rim = cup.rim?.zMm ?? 0;
    const cut = rimCut(cup.mesh, rim, cup.rim?.radiusMm ?? 0);
    if (!cut) throw new Error('no rim');
    for (const deg of [0, 100, 200, 300]) expect(cut.topAt((deg * Math.PI) / 180)).toBeCloseTo(rim, 0);
  });
});
