// A half of a split mold as a shell: a height field over the parting plane.
//
// A half that comes off along its pull sees the piece as a height field:
// every ray along the pull leaves the piece's outside once (over a catch the
// allowed undercut lets through, the last exit — the hull). So no 3D offset
// of an arbitrary surface is needed. On the grid of the release check:
//
//  - reach(p): how far the piece reaches from the plane at the node p;
//  - the back: B(p) = max over |q − p| ≤ t of reach(q) + √(t² − |q − p|²) —
//    the graph moved out by the wall ALONG THE NORMAL, a dilation by a
//    ball (mold/underside.ts erodes by one for the same reason): along the
//    pull alone the shell would thin to nothing by the seam, where the
//    piece's wall runs along the pull;
//  - the land: B is never under twice the wall — a flat flange round the
//    cavity, the clay is cut flush with it.
//
// The solid is the slab between the plane and the back over the whole grid;
// the worker cuts it to the land's outline and takes the piece out of it.
//
// Pure: meshes as typed arrays.

import type { IndexedMesh } from 'maker-kit/3d/mesh';
import type { Axis, RayGrid } from '../release';

/**
 * The back's height over the plane at every node, mm. The ball is grown by
 * a cell's diagonal: the grid knows the piece only at its nodes, and the
 * nearest node may be that far from the real surface.
 */
export function shellHeights(rays: RayGrid, reach: Float64Array, wallMm: number): Float64Array {
  const { n0, n1, cell } = rays;
  const radius = wallMm + cell * Math.SQRT2;
  const steps = Math.ceil(radius / cell);
  const ball: { di: number; dj: number; rise: number }[] = [];
  for (let di = -steps; di <= steps; di++) {
    for (let dj = -steps; dj <= steps; dj++) {
      const d2 = (di * di + dj * dj) * cell * cell;
      if (d2 <= radius * radius) ball.push({ di, dj, rise: Math.sqrt(radius * radius - d2) });
    }
  }
  const out = new Float64Array(n0 * n1).fill(2 * wallMm);
  for (let i = 0; i < n0; i++) {
    for (let j = 0; j < n1; j++) {
      const h = reach[i * n1 + j];
      if (Number.isNaN(h)) continue;
      // scatter: this node lifts the back round it
      for (const { di, dj, rise } of ball) {
        const qi = i + di,
          qj = j + dj;
        if (qi < 0 || qj < 0 || qi >= n0 || qj >= n1) continue;
        const k = qi * n1 + qj;
        if (h + rise > out[k]) out[k] = h + rise;
      }
    }
  }
  return out;
}

/**
 * The closed slab between the plane (the coordinate `plane` along the rays'
 * axis) and the back `side`·heights over every node, in the world frame. The
 * flat face is a fan from its centre: no grid of triangles for a plane.
 */
export function shellMesh(rays: RayGrid, plane: number, side: 1 | -1, heights: Float64Array): IndexedMesh {
  const { n0, n1, cell, o0, o1, axis, across } = rays;
  const coords: number[] = [];
  const put = (a: number, b: number, w: number): number => {
    const point = [0, 0, 0];
    point[across[0]] = a;
    point[across[1]] = b;
    point[axis] = w;
    coords.push(point[0], point[1], point[2]);
    return coords.length / 3 - 1;
  };
  // the back over every node; then the plane under the edge nodes only
  for (let i = 0; i < n0; i++) for (let j = 0; j < n1; j++) put(o0 + i * cell, o1 + j * cell, plane + side * heights[i * n1 + j]);
  const back = (i: number, j: number): number => i * n1 + j;
  // the edge walking round counter-clockwise seen from +axis in (across[0], across[1]) — a right-handed frame with the axis
  const ring: [number, number][] = [];
  for (let i = 0; i < n0 - 1; i++) ring.push([i, 0]);
  for (let j = 0; j < n1 - 1; j++) ring.push([n0 - 1, j]);
  for (let i = n0 - 1; i > 0; i--) ring.push([i, n1 - 1]);
  for (let j = n1 - 1; j > 0; j--) ring.push([0, j]);
  const flat = ring.map(([i, j]) => put(o0 + i * cell, o1 + j * cell, plane));
  const centre = put(o0 + ((n0 - 1) * cell) / 2, o1 + ((n1 - 1) * cell) / 2, plane);

  const tris: number[] = [];
  // counter-clockwise seen from outside; `face(a, b, c)` as seen from +axis, flipped for the side facing −axis
  const up = (a: number, b: number, c: number): void => void tris.push(a, b, c);
  const down = (a: number, b: number, c: number): void => void tris.push(a, c, b);
  const backFace = side > 0 ? up : down;
  const flatFace = side > 0 ? down : up;
  for (let i = 0; i < n0 - 1; i++) {
    for (let j = 0; j < n1 - 1; j++) {
      backFace(back(i, j), back(i + 1, j), back(i + 1, j + 1));
      backFace(back(i, j), back(i + 1, j + 1), back(i, j + 1));
    }
  }
  for (let e = 0; e < ring.length; e++) {
    const f = (e + 1) % ring.length;
    flatFace(centre, flat[e], flat[f]);
    // the wall between the edge of the back and the plane, normal out
    const [ai, aj] = ring[e];
    const [bi, bj] = ring[f];
    const a = back(ai, aj),
      b = back(bi, bj);
    // walking counter-clockwise (from +axis), outside is on the right: seen from outside the edge runs left to right
    if (side > 0) tris.push(flat[e], flat[f], b, flat[e], b, a);
    else tris.push(a, b, flat[f], a, flat[f], flat[e]);
  }
  return { positions: new Float32Array(coords), indices: new Uint32Array(tris) };
}

/**
 * A half turned for the print: its pull points down — the parting face up,
 * the back on supports — and it stands on z = 0. A turn, never a mirror:
 * the across coordinates go to x and ∓y, the axis to ∓z, a right-handed
 * frame either way.
 */
export function turnForPrint<M extends IndexedMesh>(mesh: M, axis: Axis, side: 1 | -1): M {
  const across: [Axis, Axis] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
  const { positions } = mesh;
  const out = new Float32Array(positions.length);
  let low = Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i + across[0]];
    out[i + 1] = -side * positions[i + across[1]];
    out[i + 2] = -side * positions[i + axis];
    low = Math.min(low, out[i + 2]);
  }
  for (let i = 2; i < out.length; i += 3) out[i] -= low;
  return { ...mesh, positions: out };
}
