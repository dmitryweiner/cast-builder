// The rim of an open piece in a split mold: where the mold ends.
//
// A filled hollow piece (geo/solidify.ts) has its lid at the rim's lowest
// point — the troughs of a wavy rim; the crests stand over it as bare wall.
// The two halves are built from the hull of the piece seen along the pull,
// and over the lid that hull is the mouth itself: a shell from it would fill
// the mouth and hold a crest from inside as well as outside. So the mold is
// cut by one solid, read in polar coordinates round the axis by rays from
// it, as revolve.ts reads the outside, in the band from the lid up:
//
//  - over z = top(θ) − RIM_BELOW_MM, top(θ) the top of the wall at the
//    angle θ: the mold's edge is the rim, a wavy one included, and the clay
//    is cut along it; a flat rim gives a plane;
//  - the inside of the mouth over the lid: r < core(θ), the widest the
//    inside of the wall gets in the band, kept a hair inside the outside's
//    narrowest — a crest that leans in loses a little mold over its outer
//    face, never gets mold inside.
//
// Pure: the cutter comes out as meshes; the worker makes them solids.

import type { IndexedMesh } from '../stl';
import { farthestHit, nearestHit, sliceAt } from '../revolve';

/** The mold's edge stands this far under the top of the wall, mm: no coincident faces, the clay cut a hair lower. */
export const RIM_BELOW_MM = 0.2;
/** The cut inside the mouth starts this far under the lid's crest, inside the lid: the wall is whole there. */
const CORE_BELOW_MM = 0.5;
/**
 * The first row stands this far under the lid's crest, mm: over the fill's
 * lid (0.15 mm under it) and under the lowest trough — the one slice where
 * the wall is whole round the axis.
 */
const FIRST_ROW_BELOW_MM = 0.1;
/** The inside of the mouth keeps this far inside the outside of the wall, mm. */
const CORE_INSIDE_MM = 0.2;
/**
 * The inside of the wall is read this far under its top, mm: right under a
 * sloping crest the slice cuts the crest's top, and the ray from the axis
 * meets that cut anywhere across the wall.
 */
const UNDER_TOP_MM = 1;
/** Angles round the axis. */
const ANGLES = 360;
/** Rows of the band, mm apart. */
const ROW_MM = 0.25;
/** A wall farther from the axis than the rim by this share is not the rim (a spout, a handle). */
const RIM_REACH = 1.25;
const RIM_MARGIN_MM = 2;

export interface RimCut {
  /** the crest of the lid, mm: the inside of the mouth is cut from a hair under it */
  lidZ: number;
  /** the top of the wall at the angle θ (radians), mm */
  topAt: (u: number) => number;
  /** the inside of the mouth at the angle θ: its radius, mm */
  coreAt: (u: number) => number;
  /** the point is in the cut: no mold there */
  contains: (x: number, y: number, z: number) => boolean;
  /**
   * The cutter as two closed meshes to be fused: over the rim out to
   * `reachMm` from the axis, and inside the mouth; both up to `topMm`.
   */
  meshes: (reachMm: number, topMm: number) => IndexedMesh[];
}

/**
 * The rim of a filled piece: `lidZ` the crest found by the fill, `rimMm` the
 * rim's outer radius. null if no wall stands at the lid at all (no rim).
 */
export function rimCut(mesh: IndexedMesh, lidZ: number, rimMm: number): RimCut | null {
  const { positions, indices } = mesh;
  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) zMax = Math.max(zMax, positions[i]);
  const from = lidZ - CORE_BELOW_MM;
  const first = lidZ - FIRST_ROW_BELOW_MM;
  const rows = Math.max(1, Math.ceil((zMax - first) / ROW_MM));
  const reach = rimMm * RIM_REACH + RIM_MARGIN_MM;

  // the faces of the band, by row
  const buckets: number[][] = Array.from({ length: rows + 1 }, () => []);
  for (let t = 0; t < indices.length; t += 3) {
    const za = positions[indices[t] * 3 + 2];
    const zb = positions[indices[t + 1] * 3 + 2];
    const zc = positions[indices[t + 2] * 3 + 2];
    const lo = Math.max(0, Math.floor((Math.min(za, zb, zc) - first) / ROW_MM));
    const hi = Math.min(rows, Math.ceil((Math.max(za, zb, zc) - first) / ROW_MM));
    for (let j = lo; j <= hi; j++) buckets[j].push(t);
  }

  const tops = new Float64Array(ANGLES).fill(lidZ);
  const outsides = new Float64Array(ANGLES).fill(Infinity);
  /** the nearest hit per row and angle; NaN — no wall */
  const nears = new Float64Array((rows + 1) * ANGLES).fill(NaN);
  let walls = 0;
  for (let j = 0; j <= rows; j++) {
    const z = Math.min(first + j * ROW_MM, zMax - 1e-3);
    const segments = sliceAt(positions, indices, buckets[j], z);
    if (segments.length === 0) continue;
    for (let i = 0; i < ANGLES; i++) {
      const u = (2 * Math.PI * i) / ANGLES;
      const far = farthestHit(segments, Math.cos(u), Math.sin(u));
      if (!(far <= reach)) continue;
      const near = nearestHit(segments, Math.cos(u), Math.sin(u));
      walls++;
      tops[i] = Math.max(tops[i], z);
      nears[j * ANGLES + i] = near;
      outsides[i] = Math.min(outsides[i], far);
    }
  }
  if (walls === 0) return null;
  const cores = new Float64Array(ANGLES);
  for (let i = 0; i < ANGLES; i++) {
    let inside = 0;
    for (let j = 0; j <= rows; j++) {
      const near = nears[j * ANGLES + i];
      // the first row always: the wall is whole there; higher ones clear of the crest's top
      if (near > inside && (j === 0 || first + j * ROW_MM <= tops[i] - UNDER_TOP_MM)) inside = near;
    }
    cores[i] = Math.max(0, Math.min(inside, outsides[i] - CORE_INSIDE_MM));
  }

  const at = (values: Float64Array, u: number): number => {
    const x = ((((u / (2 * Math.PI)) % 1) + 1) % 1) * ANGLES;
    const i = Math.floor(x) % ANGLES;
    const t = x - Math.floor(x);
    return values[i] + (values[(i + 1) % ANGLES] - values[i]) * t;
  };
  const topAt = (u: number): number => at(tops, u);
  const coreAt = (u: number): number => at(cores, u);
  return {
    lidZ,
    topAt,
    coreAt,
    contains: (x, y, z) => {
      const u = Math.atan2(y, x);
      if (z >= topAt(u) - RIM_BELOW_MM) return true;
      return z >= from && Math.hypot(x, y) < coreAt(u);
    },
    meshes: (reachMm, topMm) => [overRim(tops, cores, reachMm, topMm), insideMouth(cores, from, topMm + 1)],
  };
}

/**
 * Over the rim: z from top(θ) − RIM_BELOW_MM up to `topMm`, flat along the
 * radius from half the mouth's radius out to `reachMm`; inside that half it
 * dips to a centre that the mouth's cut covers anyway.
 */
function overRim(tops: Float64Array, cores: Float64Array, reachMm: number, topMm: number): IndexedMesh {
  const n = tops.length;
  let lowest = Infinity;
  for (const top of tops) lowest = Math.min(lowest, top - RIM_BELOW_MM);
  const positions: number[] = [0, 0, topMm, 0, 0, lowest];
  const ring = (radius: (i: number) => number, z: (i: number) => number): number => {
    const first = positions.length / 3;
    for (let i = 0; i < n; i++) {
      const u = (2 * Math.PI * i) / n;
      positions.push(radius(i) * Math.cos(u), radius(i) * Math.sin(u), z(i));
    }
    return first;
  };
  const edge = (i: number): number => tops[i] - RIM_BELOW_MM;
  const near = ring((i) => Math.max(cores[i] / 2, 0.1), edge);
  const far = ring(() => reachMm, edge);
  const lid = ring(
    () => reachMm,
    () => topMm,
  );
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // counter-clockwise from outside: the top up, the bottom down, the wall out
    indices.push(0, lid + i, lid + j);
    indices.push(1, near + j, near + i);
    indices.push(near + i, near + j, far + j, near + i, far + j, far + i);
    indices.push(far + i, far + j, lid + j, far + i, lid + j, lid + i);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Inside the mouth: a prism over the star r < core(θ), from `bottomMm` to `topMm`. */
function insideMouth(cores: Float64Array, bottomMm: number, topMm: number): IndexedMesh {
  const n = cores.length;
  const positions: number[] = [0, 0, topMm, 0, 0, bottomMm];
  for (let i = 0; i < n; i++) {
    const u = (2 * Math.PI * i) / n;
    const r = Math.max(cores[i], 0.2);
    positions.push(r * Math.cos(u), r * Math.sin(u), bottomMm, r * Math.cos(u), r * Math.sin(u), topMm);
  }
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b0 = 2 + 2 * i,
      t0 = b0 + 1,
      b1 = 2 + 2 * j,
      t1 = b1 + 1;
    indices.push(0, t0, t1, 1, b1, b0, b0, b1, t1, b0, t1, t0);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}
