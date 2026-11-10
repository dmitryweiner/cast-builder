// Undercuts and the choice of the parting scheme of a plaster mold.
//
// A mold comes apart if each part leaves the piece in its own direction
// without catching. We check it by the triangle normals: a face hinders the
// pull if it looks against the direction of removal.
//
// The key fact: a body of revolution split into two vertical halves has no
// undercuts at all. The normal of such a surface lies in the axial plane,
// its projection on the pull direction is n_r·sin θ and is always positive
// in its half. So two halves always work, and the choice comes down to
// "can one part do". Only relief that changes with the angle breaks the
// picture, and a handle or a spout makes one part impossible by itself.

import type { SurfaceMesh } from 'maker-kit/3d/mesh';
import type { Message } from '../message';

export const MOLD_SCHEMES = ['dropout', 'halves', 'halves-bottom'] as const;
export type MoldScheme = (typeof MOLD_SCHEMES)[number];

export type PullMode = 'up' | 'sides';

/** A part of the mold. The interface names it by `id` (`part.<id>`). */
export interface MoldPart {
  id: string;
}

export interface MoldReport {
  scheme: MoldScheme;
  parts: MoldPart[];
  /** why this scheme — shown to the user, sentence by sentence */
  reason: Message[];
  /** share of the area that catches when pulled up */
  dropoutUndercut: number;
  /** share of the area that catches when split into halves */
  halvesUndercut: number;
  warnings: Message[];
}

export interface AnalyzeOptions {
  /**
   * The model has a through hole (its genus is above zero): a handle. Then a
   * one-part mold is out by the hole itself, whatever the normals say.
   */
  hasHandle: boolean;
  /** the mouth is closed by a plug: one more part (see mold/block.ts) */
  hasPlug?: boolean;
}

export interface UndercutResult {
  /** share of the surface area that hinders removal */
  fraction: number;
  /** the deepest catch: −cos of the angle between the normal and the pull, 0…1 */
  worst: number;
}

/** A cosine above which a face counts as hindering (room for noise in the normals). */
const BLOCK_EPS = 1e-3;
/** A band under the very top where a horizontal face is the mouth, not a wall. */
const OPENING_BAND = 0.02;
/** A band along the parting plane where faces run tangentially. */
const SEAM_BAND = 0.02;

/**
 * Share of the area that hinders removal.
 *
 * `up` — a one-part mold, the piece comes out upwards. A face looking UP
 * hinders (n_z > 0): plaster lies over it and will not let go. Faces looking
 * down and out are free — that is how any bowl is made. The top of the mouth
 * does not count: there is no mold above it, the slip is poured there.
 *
 * `sides` — two halves, each leaves in its own direction along ±y. A face
 * looking away from its pull hinders (n·d < 0). Faces at the parting plane
 * itself are left out: there the normal is nearly perpendicular to the pull
 * and its sign is noise.
 */
export function pullUndercut(mesh: Pick<SurfaceMesh, 'positions' | 'indices'>, mode: PullMode): UndercutResult {
  const { positions, indices } = mesh;
  let zMin = Infinity;
  let zMax = -Infinity;
  let extent = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 2] < zMin) zMin = positions[i + 2];
    if (positions[i + 2] > zMax) zMax = positions[i + 2];
    extent = Math.max(extent, Math.abs(positions[i]), Math.abs(positions[i + 1]));
  }
  const openingZ = zMax - OPENING_BAND * (zMax - zMin);
  const seamY = SEAM_BAND * extent;

  let total = 0;
  let blocked = 0;
  let worst = 0;

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
    if (area2 < 1e-18) continue;

    /** > 0 — the face hinders removal, < 0 — it is free */
    let blocking: number;
    if (mode === 'up') {
      const up = nz / area2;
      const centroidZ = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
      if (up > 0.99 && centroidZ > openingZ) continue;
      blocking = up;
    } else {
      const centroidY = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
      if (Math.abs(centroidY) < seamY) continue;
      blocking = -(centroidY > 0 ? ny : -ny) / area2;
    }

    total += area2;
    if (blocking > BLOCK_EPS) {
      blocked += area2;
      worst = Math.max(worst, blocking);
    }
  }

  return { fraction: total > 0 ? blocked / total : 0, worst };
}

/** A band at the very bottom within which a point counts as lying on it. */
const FLOOR_BAND = 0.005;

/** Diameter of the bottom as a share of the largest diameter of the piece. */
function baseShare(mesh: Pick<SurfaceMesh, 'positions'>): number {
  const { positions } = mesh;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    if (positions[i] < zMin) zMin = positions[i];
    if (positions[i] > zMax) zMax = positions[i];
  }
  const floorZ = zMin + FLOOR_BAND * (zMax - zMin);
  let baseRadius = 0;
  let maxRadius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const r = Math.hypot(positions[i], positions[i + 1]);
    if (r > maxRadius) maxRadius = r;
    if (positions[i + 2] <= floorZ && r > baseRadius) baseRadius = r;
  }
  return maxRadius > 0 ? baseRadius / maxRadius : 0;
}

/**
 * Thresholds below which undercuts do not matter.
 *
 * A mold lets small relief go: plaster gives a little, and clay shrinks as it
 * dries and leaves the walls by itself. Rouletting 1.5 mm deep gives about
 * 0.7 % of the area with catches and casts without trouble. What really
 * locks a mold is either a large area (deep ring beads — 11 %) or a steep
 * catch (dots pressed 6 mm in — 3.5 % of the area at 34°). The 2 % threshold
 * lies in the gap between them.
 */
const DROPOUT_TOLERANCE = 0.002;
const HALVES_TOLERANCE = 0.02;
/**
 * Share of the bottom's diameter from which a seam through the bottom
 * becomes a problem: a wide flat area is the hardest to clean, so it is cast
 * as a separate part.
 */
const WIDE_BASE_SHARE = 0.55;

const HALF_A: MoldPart = { id: 'half-A' };
const HALF_B: MoldPart = { id: 'half-B' };
const BOTTOM: MoldPart = { id: 'bottom' };
const SINGLE: MoldPart = { id: 'single' };
const PLUG: MoldPart = { id: 'plug' };

function partsOf(scheme: MoldScheme, plug: boolean): MoldPart[] {
  const tail = plug ? [PLUG] : [];
  if (scheme === 'dropout') return [SINGLE, ...tail];
  if (scheme === 'halves') return [HALF_A, HALF_B, ...tail];
  return [HALF_A, HALF_B, BOTTOM, ...tail];
}

export function analyzeMold(mesh: Pick<SurfaceMesh, 'positions' | 'indices'>, options: AnalyzeOptions): MoldReport {
  const dropout = pullUndercut(mesh, 'up');
  const halves = pullUndercut(mesh, 'sides');
  const warnings: Message[] = [];
  const plug = Boolean(options.hasPlug);

  if (halves.fraction > HALVES_TOLERANCE) {
    const worstDeg = (Math.asin(Math.min(1, halves.worst)) * 180) / Math.PI;
    warnings.push({
      code: 'mold.undercuts',
      params: { pct: (halves.fraction * 100).toFixed(1), deg: worstDeg.toFixed(0) },
    });
  }
  const measured = { dropoutUndercut: dropout.fraction, halvesUndercut: halves.fraction, warnings };

  if (!options.hasHandle && dropout.fraction <= DROPOUT_TOLERANCE) {
    return { scheme: 'dropout', parts: partsOf('dropout', plug), reason: [{ code: 'mold.dropout' }], ...measured };
  }

  const reason: Message = options.hasHandle
    ? { code: 'mold.whyHandle' }
    : { code: 'mold.whyWider', params: { pct: (dropout.fraction * 100).toFixed(0) } };
  if (baseShare(mesh) >= WIDE_BASE_SHARE) {
    return { scheme: 'halves-bottom', parts: partsOf('halves-bottom', plug), reason: [reason, { code: 'mold.wideBase' }], ...measured };
  }
  return { scheme: 'halves', parts: partsOf('halves', plug), reason: [reason, { code: 'mold.narrowBase' }], ...measured };
}

/**
 * The report with a scheme the user picked by hand. The analysis does not
 * know everything: a mark on the bottom wants a bottom plate, a spout that
 * barely sticks out may still drop out. The measured undercuts stay.
 */
export function withScheme(report: MoldReport, scheme: MoldScheme): MoldReport {
  if (scheme === report.scheme) return report;
  const plug = report.parts.some((part) => part.id === PLUG.id);
  return { ...report, scheme, parts: partsOf(scheme, plug), reason: [{ code: 'mold.manual' }] };
}
