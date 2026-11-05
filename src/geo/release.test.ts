import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from './csg';
import { CsgScope, fromManifold, initCSG } from './csg';
import { castRays, releaseDepth, reachOf } from './release';
import { fixture } from './testing';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

/** A sphere of radius `r` about the origin, finely faceted. */
function sphere(r: number): { positions: Float32Array; indices: Uint32Array } {
  const scope = new CsgScope();
  try {
    return fromManifold(scope.keep(csg.Manifold.sphere(r, 192)));
  } finally {
    scope.dispose();
  }
}

describe('releaseDepth', () => {
  it('a sphere split at its equator releases both ways', () => {
    const rays = castRays(sphere(20), 0, 0.25);
    expect(releaseDepth(rays, { plane: 0, side: 1 }).depthMm).toBeLessThan(0.3);
    expect(releaseDepth(rays, { plane: 0, side: -1 }).depthMm).toBeLessThan(0.3);
  });

  it('split off its equator, the bigger half catches as deep as the bulge over the plane', () => {
    const r = 20;
    const plane = -0.4 * r;
    const rays = castRays(sphere(r), 0, 0.25);
    const bigger = releaseDepth(rays, { plane, side: 1 });
    // the farthest locked point from the clay: on the plane at the equator's radius
    expect(bigger.depthMm).toBeCloseTo(r * (Math.hypot(0.4, 1) - 1), 0);
    expect(bigger.at?.[0]).toBeCloseTo(plane, 0);
    expect(bigger.lockedMm3).toBeGreaterThan(0);
    // the cap comes off its way
    expect(releaseDepth(rays, { plane, side: -1 }).depthMm).toBeLessThan(0.3);
  });

  it('mold that a cutter takes away is no catch', () => {
    const rays = castRays(sphere(20), 0, 0.5);
    expect(releaseDepth(rays, { plane: -8, side: 1, cut: () => true }).depthMm).toBe(0);
  });

  it('the rays along another axis see the same', () => {
    const rays = castRays(sphere(20), 2, 0.25);
    expect(releaseDepth(rays, { plane: 8, side: -1 }).depthMm).toBeCloseTo(20 * (Math.hypot(0.4, 1) - 1), 0);
    expect(releaseDepth(rays, { plane: 8, side: -1 }).at?.[2]).toBeCloseTo(8, 0);
  });

  it('a recess under a tile is a catch at the rim, as deep as the recess', () => {
    const scope = new CsgScope();
    try {
      const plate = scope.keep(csg.Manifold.cube([30, 30, 6], true).translate([0, 0, 3]));
      const pocket = scope.keep(csg.Manifold.cube([12, 12, 2], true));
      const tile = fromManifold(scope.keep(plate.subtract(pocket)));
      // the mold lies over the face, the rim at the back (z = 0), pulled up
      const found = releaseDepth(castRays(tile, 2, 0.25), { plane: 0, side: 1 });
      expect(found.depthMm).toBeCloseTo(1, 0);
      expect(found.at?.[2]).toBeLessThan(1);
    } finally {
      scope.dispose();
    }
  });

  it('the keychain face up releases its mold upwards', () => {
    expect(releaseDepth(castRays(fixture('keychain'), 2, 0.25), { plane: 0.01, side: 1 }).depthMm).toBeLessThan(0.3);
  });
});

describe('reachOf', () => {
  it('is how far the half reaches from the plane at every node', () => {
    const rays = castRays(sphere(20), 0, 0.5);
    const reach = reachOf(rays, 0, 1);
    const centre = rays.nodeAt(0, 0);
    expect(reach[centre]).toBeCloseTo(20, 1);
    expect(reach[rays.nodeAt(12, 0)]).toBeCloseTo(16, 0);
    expect(Number.isNaN(reach[rays.nodeAt(21, 0)])).toBe(true);
  });
});
