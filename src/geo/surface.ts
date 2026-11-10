// Meshes as plain typed arrays and the grids they are assembled from. No
// Three.js here. The model axis is z, the bottom at z = 0; the renderer turns
// it y-up by itself.
//
// A grid is closed in u (the seam u = 0/2π is stitched by indices, not by
// duplicated vertices): vertex (i, j) has index j·nu + i, i ∈ [0, nu),
// j ∈ [0, nv].

import type { SurfaceMesh } from 'maker-kit/3d/mesh';
import type { Cap, CapSpec } from './bottom';
import { buildCap } from './bottom';

export type CapMode = 'both' | 'bottom' | 'top' | 'none';

/** Vertex positions of a grid closed in u, nv + 1 rows from the bottom (j = 0) to the top (j = nv). */
export interface Grid {
  nu: number;
  nv: number;
  /** nu·(nv+1)·3 numbers, layout (j·nu + i)·3 */
  positions: Float32Array;
}

export type GridFn = (u: number, v: number, out: Float64Array) => void;

/** Samples a surface function at the grid nodes: u = 2π·i/nu, v = j/nv. */
export function sampleGrid(nu: number, nv: number, f: GridFn): Grid {
  if (nu < 3 || nv < 1) throw new Error(`sampleGrid: bad dims ${nu}x${nv}`);
  const positions = new Float32Array(nu * (nv + 1) * 3);
  const out = new Float64Array(3);
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i < nu; i++) {
      const u = (2 * Math.PI * i) / nu;
      f(u, v, out);
      const k = (j * nu + i) * 3;
      positions[k] = out[0];
      positions[k + 1] = out[1];
      positions[k + 2] = out[2];
    }
  }
  return { nu, nv, positions };
}

/**
 * Side triangles of a grid: quad (i, j) → two triangles, counter-clockwise
 * seen from outside (normals point out for a body of revolution with r > 0).
 */
export function gridIndices(nu: number, nv: number): Uint32Array {
  const indices = new Uint32Array(nu * nv * 6);
  let k = 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i1 = (i + 1) % nu;
      const a = j * nu + i;
      const b = j * nu + i1;
      const c = (j + 1) * nu + i1;
      const d = (j + 1) * nu + i;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return indices;
}

/** Bottoms of a hollow mesh with a grid of their own: the outer one and the floor of the cavity. */
export interface HollowCaps {
  outer?: CapSpec;
  inner?: CapSpec;
}

/**
 * A hollow shell open at the top: the outer surface with its bottom, the
 * inner one with its floor, and a flat rim between their top rows. It is a
 * watertight solid. `inner` has the same layout (nu·(nv+1)) as
 * `outer.positions`.
 *
 * `ventMm` is the diameter of a through hole along the axis in the bottom.
 * `caps` are bottoms with a grid of their own (`geo/bottom.ts`) for relief
 * on them; the vent then goes through the shared rings of both.
 */
export function assembleHollowMesh(outer: Grid, inner: Float32Array, ventMm: number, caps: HollowCaps): Omit<SurfaceMesh, 'normals'> {
  const { nu, nv } = outer;
  const nGrid = nu * (nv + 1);
  const vertexCount = 2 * nGrid;
  const outPos = new Float32Array(vertexCount * 3);
  outPos.set(outer.positions, 0);
  outPos.set(inner, nGrid * 3);
  const oBase = 0;
  const iBase = nGrid;

  // outer walls + inner walls + one rim band
  const indices = new Uint32Array((nu * nv * 2 * 2 + nu * 2) * 3);
  let k = 0;
  // outer walls, normals out
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i1 = (i + 1) % nu;
      const a = oBase + j * nu + i;
      const b = oBase + j * nu + i1;
      const c = oBase + (j + 1) * nu + i1;
      const d = oBase + (j + 1) * nu + i;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  // inner walls, normals into the cavity: the reverse order
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i1 = (i + 1) % nu;
      const a = iBase + j * nu + i;
      const b = iBase + (j + 1) * nu + i;
      const c = iBase + (j + 1) * nu + i1;
      const d = iBase + j * nu + i1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  // the rim: a band from the outer top row to the inner one
  const oTop = oBase + nv * nu;
  const iTop = iBase + nv * nu;
  for (let i = 0; i < nu; i++) {
    const i1 = (i + 1) % nu;
    indices[k++] = oTop + i;
    indices[k++] = oTop + i1;
    indices[k++] = iTop + i1;
    indices[k++] = oTop + i;
    indices[k++] = iTop + i1;
    indices[k++] = iTop + i;
  }
  const shell = { positions: outPos, indices };

  const hole = ventMm / 2;
  const low = buildCap(outPos, oBase, nu, vertexCount, { ...caps.outer, holeMm: hole }, 'down');
  const withLow = appendCap(shell, low);
  const high = buildCap(withLow.positions, iBase, nu, withLow.positions.length / 3, { ...caps.inner, holeMm: hole }, 'up');
  const both = appendCap(withLow, high);
  if (!low.hole || !high.hole) return both;
  // the wall of the vent, normals towards the axis: both bottoms have nu vertices on its ring
  const wall = new Uint32Array(nu * 6);
  let w = 0;
  for (let i = 0; i < nu; i++) {
    const i1 = (i + 1) % nu;
    wall[w++] = low.hole[i1];
    wall[w++] = low.hole[i];
    wall[w++] = high.hole[i];
    wall[w++] = low.hole[i1];
    wall[w++] = high.hole[i];
    wall[w++] = high.hole[i1];
  }
  return appendCap(both, { positions: new Float32Array(0), indices: wall, hole: null });
}

/** A closed solid from a grid: its side plus fan caps from the centroids of the end rings. */
export function assembleMesh(grid: Grid, caps: CapMode): Omit<SurfaceMesh, 'normals'> {
  const { nu, nv, positions } = grid;
  const side = gridIndices(nu, nv);
  const bottom = caps === 'both' || caps === 'bottom';
  const top = caps === 'both' || caps === 'top';
  const extra = (bottom ? 1 : 0) + (top ? 1 : 0);
  const nGrid = nu * (nv + 1);

  const outPos = new Float32Array((nGrid + extra) * 3);
  outPos.set(positions);
  const capTris = (bottom ? nu : 0) + (top ? nu : 0);
  const indices = new Uint32Array(side.length + capTris * 3);
  indices.set(side);
  let k = side.length;
  let nextVertex = nGrid;

  const centroid = (j: number, dst: number): void => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < nu; i++) {
      const p = (j * nu + i) * 3;
      x += positions[p];
      y += positions[p + 1];
      z += positions[p + 2];
    }
    outPos[dst * 3] = x / nu;
    outPos[dst * 3 + 1] = y / nu;
    outPos[dst * 3 + 2] = z / nu;
  };

  if (bottom) {
    const c = nextVertex++;
    centroid(0, c);
    // clockwise seen from below: the normal is −z
    for (let i = 0; i < nu; i++) {
      indices[k++] = c;
      indices[k++] = (i + 1) % nu;
      indices[k++] = i;
    }
  }
  if (top) {
    const c = nextVertex;
    centroid(nv, c);
    const ring = nv * nu;
    for (let i = 0; i < nu; i++) {
      indices[k++] = c;
      indices[k++] = ring + i;
      indices[k++] = ring + ((i + 1) % nu);
    }
  }
  return { positions: outPos, indices };
}

/** A mesh plus a bottom with a grid of its own: the bottom's vertices go to the end. */
function appendCap(mesh: Omit<SurfaceMesh, 'normals'>, cap: Cap): Omit<SurfaceMesh, 'normals'> {
  const positions = new Float32Array(mesh.positions.length + cap.positions.length);
  positions.set(mesh.positions);
  positions.set(cap.positions, mesh.positions.length);
  const indices = new Uint32Array(mesh.indices.length + cap.indices.length);
  indices.set(mesh.indices);
  indices.set(cap.indices, mesh.indices.length);
  return { positions, indices };
}

/**
 * Several meshes in one: buffers in a row, indices of each next one shifted
 * by the vertices before it. The bodies are not fused — it is several closed
 * components in one file, the way they lie on the slicer's bed.
 */
export function mergeMeshes(meshes: readonly SurfaceMesh[]): SurfaceMesh {
  let vertexCount = 0;
  let indexCount = 0;
  for (const mesh of meshes) {
    vertexCount += mesh.positions.length;
    indexCount += mesh.indices.length;
  }
  const positions = new Float32Array(vertexCount);
  const normals = new Float32Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const mesh of meshes) {
    positions.set(mesh.positions, vertexOffset);
    normals.set(mesh.normals, vertexOffset);
    const base = vertexOffset / 3;
    for (let i = 0; i < mesh.indices.length; i++) indices[indexOffset + i] = mesh.indices[i] + base;
    vertexOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
  }
  return { positions, normals, indices };
}

/**
 * Turned over as a hand turns a part: half a turn about the x axis,
 * y → −y and z → top − z, where top is the top of the mesh, so it stands on
 * z = 0 again. A turn, not a mirror: a mirror in z alone would print the
 * mirror image of whatever is not symmetric (the punch's tabs beside its
 * legs). A turn keeps the orientation, so the triangles keep their order.
 */
export function turnOver(mesh: SurfaceMesh): SurfaceMesh {
  let top = -Infinity;
  for (let i = 2; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i]);
  const positions = new Float32Array(mesh.positions);
  const normals = new Float32Array(mesh.normals);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = -positions[i + 1];
    positions[i + 2] = top - positions[i + 2];
    normals[i + 1] = -normals[i + 1];
    normals[i + 2] = -normals[i + 2];
  }
  return { positions, normals, indices: new Uint32Array(mesh.indices) };
}

/** A shift in the plane of the bed. */
export function translateMesh(mesh: SurfaceMesh, dx: number, dy: number): SurfaceMesh {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += dx;
    positions[i + 1] += dy;
  }
  return { ...mesh, positions };
}

/** Uniform scaling about the origin. */
export function scaleMesh(mesh: SurfaceMesh, factor: number): SurfaceMesh {
  if (factor === 1) return mesh;
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i++) positions[i] = mesh.positions[i] * factor;
  return { ...mesh, positions };
}
