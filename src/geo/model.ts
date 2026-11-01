// The loaded model in the mold's frame.
//
// The tooling assumes what clayform's core assumed: the axis is z, the bottom
// at z = 0, the axis of the body through the origin, and the parting plane
// XZ (y = 0), so a handle or a spout must lie in it. An STL from elsewhere
// can come lying on its side or turned anyhow, so the user turns it by
// quarter turns about x and y and spins it about the vertical axis; the
// placement then finds the axis and drops the model onto the table.

import type { IndexedMesh } from './stl';

export interface Orientation {
  /** quarter turns as a rotation matrix with entries −1, 0, 1, row-major */
  turn: readonly number[];
  /** spin about the vertical axis after the turn, degrees */
  spinDeg: number;
}

export const IDENTITY_TURN: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function defaultOrientation(): Orientation {
  return { turn: IDENTITY_TURN, spinDeg: 0 };
}

/** A quarter turn about x or y (counter-clockwise looking from + towards the origin) after `turn`. */
export function quarterTurn(turn: readonly number[], axis: 'x' | 'y'): number[] {
  const q = axis === 'x' ? [1, 0, 0, 0, 0, -1, 0, 1, 0] : [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += q[r * 3 + k] * turn[k * 3 + c];
      out.push(sum);
    }
  }
  return out;
}

/** Turned upside down: half a turn about x. */
export function flip(turn: readonly number[]): number[] {
  return quarterTurn(quarterTurn(turn, 'x'), 'x');
}

/** A rotation by quarter turns: a signed permutation matrix with determinant 1. */
export function isTurn(raw: unknown): raw is number[] {
  if (!Array.isArray(raw) || raw.length !== 9) return false;
  const m: number[] = [];
  for (const value of raw) {
    if (value !== -1 && value !== 0 && value !== 1) return false;
    m.push(value);
  }
  for (let r = 0; r < 3; r++) {
    let row = 0;
    let col = 0;
    for (let k = 0; k < 3; k++) {
      row += Math.abs(m[r * 3 + k]);
      col += Math.abs(m[k * 3 + r]);
    }
    if (row !== 1 || col !== 1) return false;
  }
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  return det === 1;
}

export function sanitizeOrientation(raw: unknown): Orientation {
  const source: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  const spin = typeof source.spinDeg === 'number' && Number.isFinite(source.spinDeg) ? source.spinDeg : 0;
  return {
    turn: isTurn(source.turn) ? source.turn : IDENTITY_TURN,
    spinDeg: ((spin % 360) + 360) % 360,
  };
}

/** Share of the height at the bottom whose down-facing faces count as the foot. */
const FOOT_BAND = 0.01;

/**
 * The model turned, its axis through the origin and its bottom on z = 0.
 *
 * The axis is the centroid of the foot — the down-facing faces at the very
 * bottom — not the middle of the bounding box: a handle sticks out to one
 * side and would pull the middle off the axis, and with it the pouring
 * collar and the slump mold. A model without a flat foot falls back to the
 * middle of its box.
 */
export function placeModel(mesh: IndexedMesh, orientation: Orientation): IndexedMesh {
  const { turn, spinDeg } = orientation;
  const src = mesh.positions;
  const positions = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i];
    const y = src[i + 1];
    const z = src[i + 2];
    positions[i] = turn[0] * x + turn[1] * y + turn[2] * z;
    positions[i + 1] = turn[3] * x + turn[4] * y + turn[5] * z;
    positions[i + 2] = turn[6] * x + turn[7] * y + turn[8] * z;
  }
  const [cx, cy, zMin] = axisOf(positions, mesh.indices);
  const a = (spinDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] - cx;
    const y = positions[i + 1] - cy;
    positions[i] = x * cos - y * sin;
    positions[i + 1] = x * sin + y * cos;
    positions[i + 2] -= zMin;
  }
  return { positions, indices: mesh.indices };
}

/** Where the axis crosses the table: [x, y, z of the bottom]. */
function axisOf(positions: Float32Array, indices: Uint32Array): [number, number, number] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], positions[i + c]);
      max[c] = Math.max(max[c], positions[i + c]);
    }
  }
  const band = min[2] + Math.max(1e-3, FOOT_BAND * (max[2] - min[2]));
  let area = 0;
  let sx = 0;
  let sy = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    if (positions[a + 2] > band || positions[b + 2] > band || positions[c + 2] > band) continue;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    // z of the face normal, i.e. twice the signed area of its projection
    const nz = abx * acy - aby * acx;
    if (nz >= 0) continue;
    area -= nz;
    sx -= (nz * (positions[a] + positions[b] + positions[c])) / 3;
    sy -= (nz * (positions[a + 1] + positions[b + 1] + positions[c + 1])) / 3;
  }
  if (area > 1e-9) return [sx / area, sy / area, min[2]];
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
}

/** Extent of the mesh along x, y, z. */
export function sizeOf(positions: Float32Array): [number, number, number] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], positions[i + c]);
      max[c] = Math.max(max[c], positions[i + c]);
    }
  }
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}
