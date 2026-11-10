// A loaded mesh read as a body of revolution — what the slump mold and its
// punch are built from.
//
// The slump mold's working surface is the outside of the piece, relief and
// all; its outside and the punch are smooth bodies of revolution about the
// same axis. In clayform both came straight from the parametric silhouette.
// Here the mesh is sampled in cylindrical coordinates instead: at every
// height of a grid row and every angle, a ray from the axis outwards hits
// the outermost face. That gives the outer surface as a grid r(u, z) —
// exactly the outside a slab of clay can touch when it is pressed in and
// lifted out — and the mean radius of each row, smoothed, gives the
// silhouette. Smoothed, because relief that runs round the piece (throwing
// rings, grooves) does not cancel out in the mean: a punch built from it
// copied the rings onto the inside of the piece, and its offset by the slab
// turned them into steps.
//
// The bottom of the piece is read separately, from below: the lowest face
// over each point of the table. A foot ring or a maker's mark there becomes
// the relief of the mold's floor.

import type { Grid } from './surface';
import type { IndexedMesh } from 'maker-kit/3d/mesh';

/** What the slump mold and the punch need to know about the piece. */
export interface PressSource {
  heightMm: number;
  /** the outer surface: nu × (nv + 1) nodes, row j at z = j/nv · heightMm, the axis through the origin */
  grid: Grid;
  /** smooth silhouette: the mean radius at height share v ∈ [0, 1] */
  radiusAt: (v: number) => number;
  /** how far the surface comes out of the silhouette at most, mm */
  outwardMm: number;
  /** the largest spread of radii in one row, mm: 0 for a true body of revolution */
  outOfRoundMm: number;
  /**
   * the deepest catch of the outside, mm: how much narrower it is anywhere
   * than its widest point below at the same angle — what holds a slab in the
   * mold. The rim's rounding (`RIM_BAND_MM`) is left out.
   */
  catchMm: number;
  /** relief of the bottom seen from below: lift over the table at (x, y), mm; absent for a flat bottom */
  floorAt?: (x: number, y: number) => number;
}

/** How far past its ends a segment still counts as hit, as a share of its length. */
const HIT_SLACK = 1e-9;
/** Smallest radius of a node: the surface never crosses the axis. */
export const MIN_RADIUS_MM = 1.5;
/** Cell of the bottom's height map, mm: fine enough for a letter of a mark. */
export const FLOOR_CELL_MM = 0.5;
/** A bottom lifted less than this over the table is flat, mm. */
const FLOOR_RELIEF_MM = 0.05;
/**
 * Width of the silhouette's smoothing along its own length, mm (σ of a
 * Gaussian): rings 4–5 mm apart are gone to a thousandth; a bend of 5 mm
 * radius moves by about half a millimetre. The slab's offset magnifies
 * what ripple is left — at σ = 1.5 the punch of a ringed bowl still showed
 * bands.
 */
export const SILHOUETTE_SMOOTH_MM = 2.5;
/**
 * The top of the piece where a narrowing is no catch, mm: a rim rounded off
 * by half the wall (clayform's printable export) leans in by a millimetre or
 * two, and the slab is cut at the rim anyway.
 */
export const RIM_BAND_MM = 3;

/** Samples the outer surface of a placed model (axis through the origin, bottom on z = 0). */
export function meshSource(mesh: IndexedMesh, nu: number, nv: number): PressSource {
  const { positions, indices } = mesh;
  let heightMm = 0;
  for (let i = 2; i < positions.length; i += 3) heightMm = Math.max(heightMm, positions[i]);
  if (!(heightMm > 0)) throw new Error('meshSource: the model has no height');

  // triangles by the rows they cross: a row's slice then looks at a few of them
  const rowOf = (z: number): number => (z / heightMm) * nv;
  const buckets: number[][] = Array.from({ length: nv + 1 }, () => []);
  for (let t = 0; t < indices.length; t += 3) {
    const za = positions[indices[t] * 3 + 2];
    const zb = positions[indices[t + 1] * 3 + 2];
    const zc = positions[indices[t + 2] * 3 + 2];
    const from = Math.max(0, Math.floor(rowOf(Math.min(za, zb, zc))));
    const to = Math.min(nv, Math.ceil(rowOf(Math.max(za, zb, zc))));
    for (let j = from; j <= to; j++) buckets[j].push(t);
  }

  const radii = new Float64Array(nu * (nv + 1)).fill(NaN);
  // the end rows are sampled a hair inside: exactly at z = 0 the bottom lies in the plane of the slice
  const edge = Math.min(0.05, heightMm / 1000);
  for (let j = 0; j <= nv; j++) {
    const z = Math.min(Math.max((j / nv) * heightMm, edge), heightMm - edge);
    const segments = sliceAt(positions, indices, buckets[j], z);
    for (let i = 0; i < nu; i++) {
      const u = (2 * Math.PI * i) / nu;
      radii[j * nu + i] = farthestHit(segments, Math.cos(u), Math.sin(u));
    }
  }
  fillMisses(radii, nu, nv);

  const raw: number[] = [];
  const highs: number[] = [];
  let outOfRoundMm = 0;
  for (let j = 0; j <= nv; j++) {
    let sum = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < nu; i++) {
      const r = radii[j * nu + i];
      sum += r;
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    raw.push(sum / nu);
    highs.push(hi);
    outOfRoundMm = Math.max(outOfRoundMm, hi - lo);
  }
  const means = smoothSilhouette(raw, heightMm / nv, SILHOUETTE_SMOOTH_MM);
  let outwardMm = 0;
  for (let j = 0; j <= nv; j++) outwardMm = Math.max(outwardMm, highs[j] - means[j]);

  const grid: Grid = { nu, nv, positions: new Float32Array(nu * (nv + 1) * 3) };
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < nu; i++) {
      const u = (2 * Math.PI * i) / nu;
      const r = radii[j * nu + i];
      const k = (j * nu + i) * 3;
      grid.positions[k] = r * Math.cos(u);
      grid.positions[k + 1] = r * Math.sin(u);
      grid.positions[k + 2] = (j / nv) * heightMm;
    }
  }

  const catchMm = deepestCatch(radii, nu, nv, Math.floor(nv * (1 - RIM_BAND_MM / heightMm)));

  let footMm = Infinity;
  for (let i = 0; i < nu; i++) footMm = Math.min(footMm, radii[i]);
  const floorAt = floorRelief(mesh, heightMm, footMm);
  return {
    heightMm,
    grid,
    radiusAt: (v) => {
      const x = Math.min(Math.max(v, 0), 1) * nv;
      const j = Math.min(nv - 1, Math.floor(x));
      const t = x - j;
      return means[j] + (means[j + 1] - means[j]) * t;
    },
    outwardMm,
    outOfRoundMm,
    catchMm,
    ...(floorAt ? { floorAt } : {}),
  };
}

/** Up the rows to `top` at every angle: the widest radius so far less the radius at hand, at most. */
function deepestCatch(radii: Float64Array, nu: number, nv: number, top: number): number {
  let deepest = 0;
  for (let i = 0; i < nu; i++) {
    let widest = 0;
    for (let j = 0; j <= Math.min(nv, top); j++) {
      const r = radii[j * nu + i];
      widest = Math.max(widest, r);
      deepest = Math.max(deepest, widest - r);
    }
  }
  return deepest;
}

/**
 * Radii of rows `dz` apart smoothed by a Gaussian along the length of the
 * section's curve — not along the height: where the curve runs nearly flat
 * (a bowl's bottom turning into its wall) a millimetre of height is many
 * millimetres of curve, and the shape must stay. Both coordinates are
 * smoothed, the curve as a curve, and its radius is read back at the rows'
 * heights: put back at the old heights, the radius kept a kink wherever
 * the raw curve had one. Past the ends the curve is continued by its point
 * reflection, so the ends and their slopes stay put: the rim is not pulled
 * in, the foot not out.
 */
function smoothSilhouette(radii: readonly number[], dz: number, sigma: number): number[] {
  const n = radii.length;
  if (n < 3 || !(sigma > 0)) return [...radii];
  const last = n - 1;
  const heights = radii.map((_, j) => j * dz);
  const along = [0];
  for (let j = 1; j < n; j++) along.push(along[j - 1] + Math.hypot(radii[j] - radii[j - 1], dz));
  const reach = 3 * sigma;
  // each sample weighs as much curve as it stands for: where the radius
  // climbs, rows lie farther apart along the curve
  const share = along.map((_, k) => (along[Math.min(last, k + 1)] - along[Math.max(0, k - 1)]) / 2);
  const r: number[] = [];
  const z: number[] = [];
  for (let j = 0; j < n; j++) {
    let sr = 0;
    let sz = 0;
    let weights = 0;
    const add = (s: number, pr: number, pz: number, ds: number): void => {
      const d = s - along[j];
      if (Math.abs(d) > reach) return;
      const w = Math.exp((-d * d) / (2 * sigma * sigma)) * ds;
      sr += w * pr;
      sz += w * pz;
      weights += w;
    };
    for (let k = 0; k < n; k++) {
      add(along[k], radii[k], heights[k], share[k]);
      // reflections through the ends: s → 2·end − s, (r, z) → 2·end − (r, z)
      if (k > 0) add(-along[k], 2 * radii[0] - radii[k], 2 * heights[0] - heights[k], share[k]);
      if (k < last) add(2 * along[last] - along[k], 2 * radii[last] - radii[k], 2 * heights[last] - heights[k], share[k]);
    }
    r.push(sr / weights);
    z.push(sz / weights);
  }
  // the smoothed heights still rise (an average of rising ones): read r back at the rows
  let k = 0;
  return heights.map((h) => {
    while (k < last - 1 && z[k + 1] < h) k++;
    const t = z[k + 1] > z[k] ? Math.min(1, Math.max(0, (h - z[k]) / (z[k + 1] - z[k]))) : 0;
    return r[k] + (r[k + 1] - r[k]) * t;
  });
}

/** Segments of the slice at height z, x0 y0 x1 y1 in a row. */
export function sliceAt(positions: Float32Array, indices: Uint32Array, triangles: readonly number[], z: number): number[] {
  const out: number[] = [];
  for (const t of triangles) {
    const crossings: number[] = [];
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e] * 3;
      const b = indices[t + ((e + 1) % 3)] * 3;
      const za = positions[a + 2];
      const zb = positions[b + 2];
      // a vertex exactly at z counts as above: each crossing is met once
      if (za >= z === zb >= z) continue;
      const s = (z - za) / (zb - za);
      crossings.push(positions[a] + (positions[b] - positions[a]) * s, positions[a + 1] + (positions[b + 1] - positions[a + 1]) * s);
    }
    if (crossings.length === 4) out.push(...crossings);
  }
  return out;
}

/**
 * Distance along the ray from the axis to the farthest segment it crosses;
 * NaN if none. A ray through the common end of two segments may find that
 * end a rounding error outside both: the ends are let in by a hair.
 */
export function farthestHit(segments: readonly number[], dx: number, dy: number): number {
  let best = NaN;
  for (let s = 0; s < segments.length; s += 4) {
    const t = hitAt(segments, s, dx, dy);
    if (t > 0 && !(t <= best)) best = t;
  }
  return best;
}

/** The same to the nearest segment: the inside of a wall, seen from the axis. */
export function nearestHit(segments: readonly number[], dx: number, dy: number): number {
  let best = NaN;
  for (let s = 0; s < segments.length; s += 4) {
    const t = hitAt(segments, s, dx, dy);
    if (t > 0 && !(t >= best)) best = t;
  }
  return best;
}

/** Where the ray from the axis along (dx, dy) crosses segment `s`; NaN if it does not. */
function hitAt(segments: readonly number[], s: number, dx: number, dy: number): number {
  const px = segments[s];
  const py = segments[s + 1];
  const ex = segments[s + 2] - px;
  const ey = segments[s + 3] - py;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return NaN;
  // p + s·e = t·d: s from the cross product with d, t from the one with e
  const along = (px * dy - py * dx) / denom;
  if (along < -HIT_SLACK || along > 1 + HIT_SLACK) return NaN;
  return (px * ey - py * ex) / denom;
}

/**
 * Rays that hit nothing (a row above a narrowing neck, a point model) take
 * the radius from the nearest row that has one, at the same angle — never
 * less than the minimum, so the surface never meets the axis.
 */
function fillMisses(radii: Float64Array, nu: number, nv: number): void {
  for (let i = 0; i < nu; i++) {
    let last = NaN;
    for (let j = 0; j <= nv; j++) {
      const k = j * nu + i;
      if (Number.isNaN(radii[k])) radii[k] = last;
      else last = radii[k];
    }
    last = NaN;
    for (let j = nv; j >= 0; j--) {
      const k = j * nu + i;
      if (Number.isNaN(radii[k])) radii[k] = last;
      else last = radii[k];
    }
    for (let j = 0; j <= nv; j++) {
      const k = j * nu + i;
      radii[k] = Math.max(MIN_RADIUS_MM, Number.isNaN(radii[k]) ? MIN_RADIUS_MM : radii[k]);
    }
  }
}

/**
 * The bottom from below: a z-buffer of the lowest down-facing face over each
 * node of a fine grid, within the foot (`footMm`, the radius of the bottom
 * row) — outside it the mold's floor ends and the wall begins. null when the
 * bottom is flat: the floor then needs no grid of its own.
 */
function floorRelief(mesh: IndexedMesh, heightMm: number, footMm: number): ((x: number, y: number) => number) | null {
  const { positions, indices } = mesh;
  const extent = footMm;
  const cell = FLOOR_CELL_MM;
  const n = Math.max(1, Math.ceil((2 * extent) / cell));
  const x0 = -(n * cell) / 2;
  const stride = n + 1;
  const low = new Float64Array(stride * stride).fill(NaN);
  const px = (v: number): number => (positions[v] - x0) / cell;
  const py = (v: number): number => (positions[v + 1] - x0) / cell;

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ax = px(a);
    const ay = py(a);
    const bx = px(b);
    const by = py(b);
    const cx = px(c);
    const cy = py(c);
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    // only down-facing faces are seen from below
    if (area > -1e-12) continue;
    const az = positions[a + 2];
    const bz = positions[b + 2];
    const cz = positions[c + 2];
    if (Math.min(az, bz, cz) > heightMm / 2) continue;
    const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 1e-9));
    const i1 = Math.min(n, Math.floor(Math.max(ax, bx, cx) + 1e-9));
    const j0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 1e-9));
    const j1 = Math.min(n, Math.floor(Math.max(ay, by, cy) + 1e-9));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const wa = ((bx - i) * (cy - j) - (cx - i) * (by - j)) / area;
        const wb = ((cx - i) * (ay - j) - (ax - i) * (cy - j)) / area;
        const wc = 1 - wa - wb;
        if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
        const height = wa * az + wb * bz + wc * cz;
        const k = j * stride + i;
        if (!(low[k] <= height)) low[k] = height;
      }
    }
  }

  let relief = false;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * stride + i;
      const inside = Math.hypot(x0 + i * cell, x0 + j * cell) < footMm - cell;
      if (Number.isNaN(low[k]) || !inside) low[k] = 0;
      else if (low[k] > FLOOR_RELIEF_MM) relief = true;
    }
  }
  if (!relief) return null;

  const at = (i: number, j: number): number => low[Math.min(n, Math.max(0, j)) * stride + Math.min(n, Math.max(0, i))];
  return (x, y) => {
    const fx = (x - x0) / cell;
    const fy = (y - x0) / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const lower = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const upper = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return lower + (upper - lower) * ty;
  };
}
