// Shared helpers of the geometry tests: fixtures from clayform and simple
// bodies of revolution. Not imported by the app.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IndexedMesh } from './stl';
import { parseSTL } from './stl';
import type { SurfaceMesh } from './surface';
import { assembleMesh, sampleGrid } from './surface';
import { meshNormals } from './normals';
import type { PressSource } from './revolve';

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
