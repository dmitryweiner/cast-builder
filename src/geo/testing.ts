// Shared helpers of the geometry tests: fixtures from clayform and simple
// bodies of revolution. Not imported by the app.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IndexedMesh } from 'maker-kit/3d/mesh';
import { parseSTL } from 'maker-kit/3d/stl';
import type { SurfaceMesh } from 'maker-kit/3d/mesh';
import { assembleMesh, sampleGrid } from './surface';
import { meshNormals } from 'maker-kit/3d/mesh';
import type { PressSource } from './revolve';
import type { CsgApi } from 'maker-kit/csg/manifold';
import { CsgScope, fromManifold, toManifold } from 'maker-kit/csg/manifold';

/**
 * Fixtures are meshes built by clayform's core at 48 segments (see
 * fixtures/README.md). Solid: bowl, pot, cup, vase, pot-handle, teapot,
 * lid-upside-down. Printable, hollow: cup-hollow, teapot-hollow,
 * lid-printed, teapot-lid-beside.
 */
export function fixture(name: string): IndexedMesh {
  const bytes = readFileSync(resolve(import.meta.dirname, '../../fixtures', `${name}.stl`));
  return parseSTL(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export function withNormals(mesh: IndexedMesh): SurfaceMesh {
  return { ...mesh, normals: meshNormals(mesh.positions, mesh.indices) };
}

/** A closed body of revolution r(v), v ∈ [0, 1] bottom to top, of the given height. */
export function revolveMesh(radius: (v: number) => number, opts: { nu?: number; nv?: number; height?: number } = {}): SurfaceMesh {
  const { nu = 48, nv = 32, height = 1 } = opts;
  const grid = sampleGrid(nu, nv, (u, v, out) => {
    const r = radius(v);
    out[0] = r * Math.cos(u);
    out[1] = r * Math.sin(u);
    out[2] = v * height;
  });
  return withNormals(assembleMesh(grid, 'both'));
}

/**
 * A press source straight from a function r(u, v) — exact, with no mesh in
 * between. `radiusAt` is the silhouette the caller says it is.
 */
export function analyticSource(
  radius: (u: number, v: number) => number,
  silhouette: (v: number) => number,
  heightMm: number,
  n = 96,
): PressSource {
  const grid = sampleGrid(n, n, (u, v, out) => {
    const r = radius(u, v);
    out[0] = r * Math.cos(u);
    out[1] = r * Math.sin(u);
    out[2] = v * heightMm;
  });
  let outwardMm = 0;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i < n; i++) outwardMm = Math.max(outwardMm, radius((2 * Math.PI * i) / n, j / n) - silhouette(j / n));
  return { heightMm, grid, radiusAt: silhouette, outwardMm, outOfRoundMm: 0, catchMm: 0 };
}

/**
 * A hollow vase from CSG: a tube `outer` / `inner` mm in radius on a floor
 * 3 mm thick, its rim waving `wave` mm about `height` with `lobes` crests
 * round the axis — a printable piece open at the top, as MathSculpt's are.
 */
export function wavyVase(
  csg: CsgApi,
  {
    outer = 30,
    inner = 28,
    height = 60,
    wave = 5,
    lobes = 3,
  }: { outer?: number; inner?: number; height?: number; wave?: number; lobes?: number } = {},
): IndexedMesh {
  const scope = new CsgScope();
  try {
    const top = height + wave + 10;
    const tube = scope.keep(
      scope
        .keep(csg.Manifold.cylinder(top, outer, outer, 192))
        .subtract(scope.keep(csg.Manifold.cylinder(top, inner, inner, 192).translate([0, 0, 3]))),
    );
    // the rim: everything over z = height + wave · sin(lobes · θ) taken away — a polar height field,
    // flat along the radius from r = 1 out (inside that the mouth is empty anyway)
    const n = 384;
    const big = outer * 2;
    const positions: number[] = [0, 0, top + 1, 0, 0, height - wave - 1];
    const ring = (r: number, z: (u: number) => number): number => {
      const first = positions.length / 3;
      for (let i = 0; i < n; i++) {
        const u = (2 * Math.PI * i) / n;
        positions.push(r * Math.cos(u), r * Math.sin(u), z(u));
      }
      return first;
    };
    const rim = (u: number): number => height + wave * Math.sin(lobes * u);
    const near = ring(1, rim);
    const far = ring(big, rim);
    const lid = ring(big, () => top + 1);
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // the top fan, normal up; the bottom: a fan inside r = 1 and the annulus, normal down; the wall, normal out
      indices.push(0, lid + i, lid + j);
      indices.push(1, near + j, near + i);
      indices.push(near + i, near + j, far + j, near + i, far + j, far + i);
      indices.push(far + i, far + j, lid + j, far + i, lid + j, lid + i);
    }
    const cutter = scope.keep(toManifold(csg, { positions: new Float32Array(positions), indices: new Uint32Array(indices) }));
    return fromManifold(scope.keep(tube.subtract(cutter)));
  } finally {
    scope.dispose();
  }
}
