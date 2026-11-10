// Where the mouth of a solid model is: the pouring collar stands on it.
//
// In clayform the builder of the silhouette knew the answer; here only the
// mesh is left. The top of the mesh is the wrong answer for a teapot: the
// tip of its spout is higher than the rim, and a collar "at the highest
// point" would cap the piece with a hat as wide as the spout reaches. A
// solid vessel is closed at the mouth by a flat disc, though, and that disc
// is the largest up-facing flat area in the upper part of the piece — the
// tip of a spout is a far smaller one. Its height is the mouth, its edge the
// rim.

import type { IndexedMesh } from 'maker-kit/3d/mesh';

export interface Mouth {
  zMm: number;
  /** outer radius of the rim */
  radiusMm: number;
}

/** A face is flat and up-facing when its normal is this close to +z. */
const FLAT_COS = 0.995;
/** Faces within this height of each other belong to one flat area, mm. */
const BIN_MM = 0.25;
/** Only this upper share of the height is searched. */
const UPPER_SHARE = 0.5;

export function guessMouth(mesh: IndexedMesh): Mouth {
  const { positions, indices } = mesh;
  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zMax = Math.max(zMax, positions[i]);
  const zFrom = zMax * (1 - UPPER_SHARE);

  const bins = new Map<number, { area: number; zArea: number; radius: number }>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const area2 = Math.hypot(nx, ny, nz);
    if (area2 < 1e-12 || nz / area2 < FLAT_COS) continue;
    const z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
    if (z < zFrom) continue;
    const key = Math.round(z / BIN_MM);
    const bin = bins.get(key) ?? { area: 0, zArea: 0, radius: 0 };
    bin.area += area2;
    bin.zArea += area2 * z;
    for (const v of [a, b, c]) bin.radius = Math.max(bin.radius, Math.hypot(positions[v], positions[v + 1]));
    bins.set(key, bin);
  }

  let best: { area: number; zArea: number; radius: number } | null = null;
  for (const bin of bins.values()) if (!best || bin.area > best.area) best = bin;
  if (best) return { zMm: best.zArea / best.area, radiusMm: best.radius };
  return { zMm: zMax, radiusMm: radiusNear(mesh, zMax) };
}

/** The largest radius of the vertices within 2 mm below `z` — the rim of a piece without a flat top. */
function radiusNear({ positions }: IndexedMesh, z: number): number {
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 2] < z - 2) continue;
    radius = Math.max(radius, Math.hypot(positions[i], positions[i + 1]));
  }
  return Math.max(radius, 1);
}

/**
 * How much narrower than the rim the gate is, mm. A collar exactly on the
 * rim would be a cylinder in the cylinder of a straight rim — coincident
 * surfaces, the worst input of a boolean operation, which leaves slivers on
 * the joint. A share of the radius keeps a tiny gate from vanishing.
 */
const GATE_INSET_MM = 1.5;
const GATE_INSET_MAX = 0.15;

/** The radius of the gate for a rim of this radius. */
export function gateRadius(rimMm: number): number {
  return Math.max(rimMm * (1 - GATE_INSET_MAX), rimMm - GATE_INSET_MM);
}
