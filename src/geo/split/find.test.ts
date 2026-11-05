import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from '../csg';
import { CsgScope, fromManifold, initCSG } from '../csg';
import { placeModel, IDENTITY_TURN } from '../model';
import { findPlane, spinMesh } from './find';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

/** A block with a blind hole drilled into its +y face, off the middle: split across x, the hole catches; across y, it opens. */
function drilledBlock(): { positions: Float32Array; indices: Uint32Array } {
  const scope = new CsgScope();
  try {
    const block = scope.keep(csg.Manifold.cube([40, 40, 40], true).translate([0, 0, 20]));
    const drill = scope.keep(scope.keep(scope.keep(csg.Manifold.cylinder(15, 4, 4, 48)).rotate([-90, 0, 0])).translate([10, 6, 20]));
    return fromManifold(scope.keep(block.subtract(drill)));
  } finally {
    scope.dispose();
  }
}

describe('spinMesh', () => {
  it('turns about z the way the placement spins', () => {
    const raw = drilledBlock();
    const spun = spinMesh(placeModel(raw, { turn: IDENTITY_TURN, spinDeg: 0 }), 35);
    const placed = placeModel(raw, { turn: IDENTITY_TURN, spinDeg: 35 });
    for (let i = 0; i < placed.positions.length; i++) expect(spun.positions[i]).toBeCloseTo(placed.positions[i], 3);
  });
});

describe('findPlane', () => {
  it('a plane across x catches the hole: the plane is turned a quarter to open it', () => {
    const block = placeModel(drilledBlock(), { turn: IDENTITY_TURN, spinDeg: 0 });
    const found = findPlane(block, 0, null);
    expect(found.spinDeg).toBe(90);
    expect(found.depthMm).toBe(0);
    expect(found.pct).toBeGreaterThanOrEqual(5);
    expect(found.pct).toBeLessThanOrEqual(95);
  });

  it('a level plane is not spun: only its height is looked for', () => {
    const scope = new CsgScope();
    try {
      // a ball comes apart clean at its equator only
      const ball = placeModel(fromManifold(scope.keep(csg.Manifold.sphere(20, 96))), { turn: IDENTITY_TURN, spinDeg: 0 });
      const found = findPlane(ball, 2, null);
      expect(found.spinDeg).toBe(0);
      expect(found.pct).toBeCloseTo(50, -1);
      expect(found.depthMm).toBe(0);
    } finally {
      scope.dispose();
    }
  });
});
