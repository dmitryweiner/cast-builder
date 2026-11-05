// "Find": the parting plane with the shallowest catch.
//
// The axis is the user's; the position along it is looked for, and for an
// upright plane the spin of the piece too — a spin and its half turn give the
// same plane, so 0…165° covers them all. Per spin the rays are cast once and
// every position only reads them anew (geo/release.ts). Coarse first, on a
// big cell; then round the best, finer. A tie goes to the smaller turn of the
// piece and to the plane nearer its middle: the user's setup moves least.
//
// Pure: the piece comes as a mesh, filled and scaled.

import type { Axis, RayMesh } from '../release';
import { castRays, releaseCell, releaseDepth } from '../release';
import type { RimCut } from './rim';
import { SPLIT_PCT_MAX, SPLIT_PCT_MIN } from '../../state';

export interface FoundPlane {
  /** how far to spin the piece about z from where it is, degrees, 0…175 */
  spinDeg: number;
  /** where the plane goes along the axis, % of the spun piece's extent */
  pct: number;
  /** the deeper catch of the two halves there, mm */
  depthMm: number;
}

/**
 * The coarse scan: spins and positions this far apart. Its cell is a share
 * of the piece's size but never over a millimetre for a piece under 12 cm:
 * the check does not see a catch under a cell and a half, and a coarser one
 * would call a drilled hole clean.
 */
const COARSE = { spinDeg: 15, pct: 5, share: 1 / 120 };
/** The fine one round the best: ± this far, by these steps, on the preview's cell — the depth found is the one the preview shows. */
const FINE = { spinDeg: 10, spinStep: 5, pct: 4, pctStep: 1 };

/** A spin about z by `deg`, counter-clockwise as the placement spins. */
export function spinMesh<M extends RayMesh>(mesh: M, deg: number): M {
  if (deg === 0) return mesh;
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = mesh.positions[i];
    const y = mesh.positions[i + 1];
    positions[i] = x * cos - y * sin;
    positions[i + 1] = x * sin + y * cos;
    positions[i + 2] = mesh.positions[i + 2];
  }
  return { ...mesh, positions };
}

interface Candidate {
  spinDeg: number;
  pct: number;
}

/**
 * The plane across `axis` with the shallowest catch, the piece spun about z
 * for an upright one. `rim` — the cut over the rim of an open piece, read in
 * its unspun frame.
 */
export function findPlane(mesh: RayMesh, axis: Axis, rim: RimCut | null, onSpin: (i: number, n: number) => void = () => {}): FoundPlane {
  const upright = axis !== 2;
  const coarseSpins = upright ? range(0, 180 - COARSE.spinDeg, COARSE.spinDeg) : [0];
  const coarsePcts = range(SPLIT_PCT_MIN, SPLIT_PCT_MAX, COARSE.pct);
  const fineSpins = upright ? 2 * (FINE.spinDeg / FINE.spinStep) + 1 : 1;
  // the spins one by one, the coarse and the fine ones: the bar counts them
  let done = 0;
  const total = coarseSpins.length + fineSpins;
  const tick = (): void => onSpin(++done, total);
  const size = largest(mesh.positions);
  const coarse = scan(mesh, axis, rim, coarseSpins, coarsePcts, Math.max(1, size * COARSE.share), tick);

  const spins = upright
    ? range(coarse.spinDeg - FINE.spinDeg, coarse.spinDeg + FINE.spinDeg, FINE.spinStep).map((deg) => (deg + 180) % 180)
    : [0];
  const pcts = range(Math.round(coarse.pct) - FINE.pct, Math.round(coarse.pct) + FINE.pct, FINE.pctStep).filter(
    (pct) => pct >= SPLIT_PCT_MIN && pct <= SPLIT_PCT_MAX,
  );
  return scan(mesh, axis, rim, spins, pcts, releaseCell(size, false), tick);
}

function largest(positions: Float32Array): number {
  return Math.max(...([0, 1, 2] as const).map((axis) => extent(positions, axis)).map(([lo, hi]) => hi - lo));
}

function scan(mesh: RayMesh, axis: Axis, rim: RimCut | null, spins: number[], pcts: number[], cell: number, tick: () => void): FoundPlane {
  let best: FoundPlane | null = null;
  for (const spinDeg of spins) {
    tick();
    const spun = spinMesh(mesh, spinDeg);
    const rays = castRays(spun, axis, cell);
    const cut = rim ? unspunCut(rim, spinDeg) : undefined;
    const [lo, hi] = extent(spun.positions, axis);
    for (const pct of pcts) {
      const plane = lo + ((hi - lo) * pct) / 100;
      const a = releaseDepth(rays, { plane, side: -1, ...(cut ? { cut } : {}) }).depthMm;
      // the other half cannot make it better than this one makes it worse
      if (best && a > best.depthMm) continue;
      const depthMm = Math.max(a, releaseDepth(rays, { plane, side: 1, ...(cut ? { cut } : {}) }).depthMm);
      const candidate = { spinDeg, pct, depthMm };
      if (!best || better(candidate, depthMm, best)) best = candidate;
    }
  }
  if (!best) throw new Error('findPlane: nothing to scan');
  return best;
}

/** How far a spin turns the piece, either way. */
const turn = (deg: number): number => Math.min(deg, 180 - deg);

function better(candidate: Candidate, depthMm: number, best: FoundPlane): boolean {
  if (depthMm !== best.depthMm) return depthMm < best.depthMm;
  if (turn(candidate.spinDeg) !== turn(best.spinDeg)) return turn(candidate.spinDeg) < turn(best.spinDeg);
  return Math.abs(candidate.pct - 50) < Math.abs(best.pct - 50);
}

/** The rim's cut seen from the piece spun by `deg`: a point is turned back before it is asked. */
function unspunCut(rim: RimCut, deg: number): (x: number, y: number, z: number) => boolean {
  const a = (-deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (x, y, z) => rim.unchecked(x, y, z) || rim.contains(x * cos - y * sin, x * sin + y * cos, z);
}

function extent(positions: Float32Array, axis: Axis): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = axis; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]);
    hi = Math.max(hi, positions[i]);
  }
  return [lo, hi];
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let value = from; value <= to + 1e-9; value += step) out.push(Math.round(value * 100) / 100);
  return out;
}
