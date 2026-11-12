import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import type { CsgApi } from 'maker-kit/csg/manifold';
import { CsgScope, fromManifold, initCSG, toManifold } from 'maker-kit/csg/manifold';
import { solidify } from '../solidify';
import { castRays, releaseDepth } from '../release';
import { wavyVase } from '../testing';
import { validateMesh } from 'maker-kit/3d/validate';
import { rimCut } from './rim';
import { buildHalf } from './index';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

const WALL = 3;
const LAND = 12;

/** The wavy vase filled, split by the plane x = 0, the two halves and the means to probe them. */
function halves(scope: CsgScope) {
  const solid = solidify(csg, scope, scope.keep(toManifold(csg, wavyVase(csg), { merge: true })));
  const piece = solid.solid;
  const mesh = fromManifold(piece);
  const cut = rimCut(mesh, solid.rim?.zMm ?? 0, solid.rim?.radiusMm ?? 0);
  if (!cut) throw new Error('no rim');
  const cutter = scope.keep(csg.Manifold.union(cut.meshes(120, 100).map((part) => scope.keep(toManifold(csg, part)))));
  const rays = castRays(mesh, 0, 0.5, LAND);
  const build = (side: 1 | -1): Manifold => buildHalf(csg, scope, piece, rays, { plane: 0, side, wallMm: WALL, landMm: LAND, cutter });
  return { piece, rays, cut, a: build(-1), b: build(1) };
}

/** How much of the solid is in a little cube about the point. */
function at(scope: CsgScope, solid: Manifold, x: number, y: number, z: number): number {
  return scope.keep(solid.intersect(scope.keep(csg.Manifold.cube([0.4, 0.4, 0.4], true).translate([x, y, z])))).volume();
}

describe('buildHalf', () => {
  it('two closed shells, each on its side of the plane, off the piece; the vase releases', () => {
    const scope = new CsgScope();
    try {
      const { piece, rays, cut, a, b } = halves(scope);
      for (const side of [-1, 1] as const) expect(releaseDepth(rays, { plane: 0, side, cut: cut.contains }).depthMm).toBe(0);
      for (const half of [a, b]) {
        expect(validateMesh(fromManifold(half)).watertight).toBe(true);
        expect(scope.keep(half.intersect(piece)).volume()).toBeLessThan(1);
      }
      expect(a.boundingBox().max[0]).toBeCloseTo(0, 3);
      expect(b.boundingBox().min[0]).toBeCloseTo(0, 3);
      // the land reaches past the piece's outline by its width
      expect(b.boundingBox().max[1]).toBeCloseTo(30 + LAND, 0);
    } finally {
      scope.dispose();
    }
  });

  it('a shell, not a block: the wall thick behind the piece, nothing past it', () => {
    const scope = new CsgScope();
    try {
      const { b } = halves(scope);
      // behind the vase's side at mid-height: mold from r = 30 out to about 30 + the wall
      expect(at(scope, b, 31, 0, 30)).toBeGreaterThan(0);
      expect(at(scope, b, 30 + WALL - 0.3, 0, 30)).toBeGreaterThan(0);
      expect(at(scope, b, 30 + WALL + 1.5, 0, 30)).toBe(0);
      // over the land the flange is twice the wall thick
      expect(at(scope, b, 2 * WALL - 0.3, 35, 30)).toBeGreaterThan(0);
      expect(at(scope, b, 2 * WALL + 0.5, 35, 30)).toBe(0);
      // the shell's volume is a fraction of the block's
      const box = b.boundingBox();
      const block = (box.max[0] - box.min[0]) * (box.max[1] - box.min[1]) * (box.max[2] - box.min[2]);
      expect(b.volume()).toBeLessThan(block / 4);
    } finally {
      scope.dispose();
    }
  });

  it('the edge follows the wavy rim; no mold inside the mouth', () => {
    const scope = new CsgScope();
    try {
      const { b } = halves(scope);
      const polar = (deg: number, r: number, z: number): number =>
        at(scope, b, r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180), z);
      // a crest at 30° stands to 65, a trough at −30° to 55
      expect(polar(30, 31.5, 64)).toBeGreaterThan(0);
      expect(polar(30, 31.5, 65.5)).toBe(0);
      expect(polar(-30, 31.5, 54)).toBeGreaterThan(0);
      expect(polar(-30, 31.5, 55.5)).toBe(0);
      // inside the crest
      expect(polar(30, 20, 60)).toBe(0);
    } finally {
      scope.dispose();
    }
  });
});
