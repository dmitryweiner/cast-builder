import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from 'maker-kit/csg/manifold';
import { CsgScope, fromManifold, initCSG, toManifold } from 'maker-kit/csg/manifold';
import { castRays, reachOf } from '../release';
import type { Axis } from '../release';
import { shellHeights, shellMesh, turnForPrint } from './shell';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

function sphere(r: number) {
  const scope = new CsgScope();
  try {
    return fromManifold(scope.keep(csg.Manifold.sphere(r, 128)));
  } finally {
    scope.dispose();
  }
}

describe('shellHeights', () => {
  it('the back keeps at least the wall off the piece, by the seam too; the land is twice the wall', () => {
    const r = 20;
    const wall = 3;
    const rays = castRays(sphere(r), 0, 0.5);
    const heights = shellHeights(rays, reachOf(rays, 0, 1), wall);
    let nearest = Infinity;
    for (let node = 0; node < heights.length; node++) {
      const y = rays.o0 + Math.floor(node / rays.n1) * rays.cell;
      const z = rays.o1 + (node % rays.n1) * rays.cell;
      // the back's point over this node, its distance to the sphere
      nearest = Math.min(nearest, Math.hypot(heights[node], y, z) - r);
      expect(heights[node]).toBeGreaterThanOrEqual(2 * wall);
    }
    expect(nearest).toBeGreaterThan(wall - 0.05);
    // and not much more over the top of the half
    expect(heights[rays.nodeAt(0, 0)]).toBeLessThan(r + wall + 1);
  });
});

describe('shellMesh', () => {
  it.each([
    [0, 1],
    [0, -1],
    [1, 1],
    [2, -1],
  ] satisfies [Axis, 1 | -1][])('is a closed solid between the plane and the back (axis %i, side %i)', (axis, side) => {
    const rays = castRays(sphere(10), axis, 1);
    const heights = shellHeights(rays, reachOf(rays, 2, side), 2);
    const scope = new CsgScope();
    try {
      const solid = scope.keep(toManifold(csg, shellMesh(rays, 2, side, heights)));
      // the cells between the nodes, each the mean of its corners (the triangles' prisms): an edge node counts half, a corner a quarter
      let volume = 0;
      for (let i = 0; i < rays.n0; i++) {
        for (let j = 0; j < rays.n1; j++) {
          const weight = (i === 0 || i === rays.n0 - 1 ? 0.5 : 1) * (j === 0 || j === rays.n1 - 1 ? 0.5 : 1);
          volume += weight * heights[i * rays.n1 + j];
        }
      }
      expect(solid.volume()).toBeCloseTo(volume * rays.cell ** 2, -1);
      const box = solid.boundingBox();
      expect(side > 0 ? box.min[axis] : box.max[axis]).toBeCloseTo(2, 3);
    } finally {
      scope.dispose();
    }
  });
});

describe('turnForPrint', () => {
  it.each([0, 1, 2] satisfies Axis[])('turns, never mirrors: the pull points down, on z = 0 (axis %i)', (axis) => {
    for (const side of [1, -1] as const) {
      // a point at the origin and one a step along the pull
      const positions = new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
      positions[3 + axis] = side;
      const turned = turnForPrint({ positions, indices: new Uint32Array(0) }, axis, side).positions;
      const at = (i: number): number[] => [turned[i * 3], turned[i * 3 + 1], turned[i * 3 + 2]];
      const [o, pull] = [at(0), at(1)];
      expect(pull.map((v, k) => v - o[k])).toEqual([0, 0, -1]);
      // x, y, z stay a right-handed frame: a turn
      const [ex, ey, ez] = [at(2), at(3), at(4)].map((p) => p.map((v, k) => v - o[k]));
      const det =
        ex[0] * (ey[1] * ez[2] - ey[2] * ez[1]) - ex[1] * (ey[0] * ez[2] - ey[2] * ez[0]) + ex[2] * (ey[0] * ez[1] - ey[1] * ez[0]);
      expect(det).toBe(1);
      expect(Math.min(...[0, 1, 2, 3, 4].map((i) => at(i)[2]))).toBe(0);
    }
  });
});
