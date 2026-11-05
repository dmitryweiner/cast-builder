// Slump molding: a dished mold, a shell as thick as the wall — the slab only
// needs the surface it touches, not a solid block — and a punch for it.
//
// The slab is pressed INTO the mold. Its working surface is the OUTER
// surface of the piece with its relief; outside the shell is the smooth
// silhouette moved out by the wall, with three ears under the rim. The punch
// sits on these ears with its legs. No CSG anywhere.
//
// Both are built from a `PressSource` (geo/revolve.ts): the outer surface of
// the piece as a grid plus its smooth silhouette. The mold measures itself
// (`SlumpFit`) and the punch is built from that measure, not from the
// silhouette again — otherwise the legs would sooner or later miss the ears.

import type { Grid, SurfaceMesh } from './surface';
import { assembleHollowMesh, scaleMesh, turnOver } from './surface';
import type { CapSpec } from './bottom';
import type { Message } from './message';
import { meshNormals } from './normals';
import type { PressSource } from './revolve';
import { FLOOR_CELL_MM, MIN_RADIUS_MM } from './revolve';
import type { LathePoint } from './lathe';
import { lathe } from './lathe';
import { LUG_THREAD_MM, PAD, PAD_GAP_MM, SCREW, TAB_T_MM, THREAD } from './thread';

/** Offset samples: as many as preview rows, with room to spare. */
const INSET_SAMPLES = 256;

/** Thinnest and thickest slab, mm. */
export const SLAB_MIN_MM = 0.8;
export const SLAB_MAX_MM = 60;
/** Legs of the punch and ears of the mold: three supports do not rock and centre without overconstraint. */
export const PUNCH_LEGS = 3;
/** Width of a leg along the arc, mm; quantised by the grid step in angle. */
export const PUNCH_LEG_WIDTH_MM = 14;
/** Clearance between the lip of a leg and the ear, mm: a sliding fit for FDM. */
export const PUNCH_CLEARANCE_MM = 0.3;
/** How far the top of an ear is below the rim of the mold, mm. */
export const EAR_DROP_MM = 10;
/** Width of the seat on an ear for the leg by default, radially, mm (the "Ears" slider). */
export const EAR_SEAT_MM = 8;
/**
 * Between the legs the flange of the punch reaches past the outer edge of the
 * mold's top only this far, mm: there it just presses the clay on the rim.
 */
const FLANGE_OVER_RIM_MM = 2;
/** Radial step between flange points squeezed towards the rim between the legs, mm. */
const FLANGE_PACK_MM = 0.2;
/**
 * Gap between the wall of the mold and a leg beyond the slab, mm: the clay
 * hanging over the rim lies between them and is not pinched.
 */
const EAR_CLAY_GAP_MM = 1;
/**
 * How far the lip of a leg goes below the top of the ear, mm. The longer, the
 * earlier it catches the ear and the less the punch tilts on its way.
 */
export const PUNCH_LIP_MM = 10;
/** Radial thickness of the lip, mm. */
const PUNCH_LIP_T_MM = 4;
/** The vertical outer face of an ear is longer than the lip by this, mm; below it a 45° chamfer. */
const EAR_FACE_SPARE_MM = 3;
/** Width of a cheek of the slot along the arc, mm; no less than two grid steps. */
const CHEEK_MM = 5;
/**
 * The cheeks of the slot end this far below the rim, mm: the clay over the
 * rim lies on them freely and the flange (a slab above the rim) does not
 * pinch it.
 */
const CHEEK_BELOW_RIM_MM = 1.5;
/**
 * Default diameter of the vents — in the bottom of the mold and along the
 * axis of the punch, mm ("Vents" slider). PLA, unlike plaster, does not
 * drink water: without vents the air is locked under the slab while
 * pressing, and on lifting it holds the slab by suction.
 */
export const VENT_MM = 2.5;
export const VENT_MIN_MM = 1;
export const VENT_MAX_MM = 8;
export const EAR_MIN_MM = 4;
export const EAR_MAX_MM = 12;
/**
 * Grooves on the sole of the mold: from the vent to the edge, halfway between
 * the ears. The table closes the vent from below, and without them the air
 * and extra clay under the slab have nowhere to go. Triangular, 45° sides —
 * prints on the bed without supports. Width at the table — this many vents.
 */
const GROOVE_WIDTH_VENTS = 1;
/** At least this much over the ridge of a groove to the floor of the cavity, or it presses through. */
const GROOVE_ROOF_MM = 1.2;
/** A groove shallower than this is no groove — there is none at all then. */
const GROOVE_MIN_MM = 0.4;
/** The flange is never thinner: legs on it wobble. */
const PUNCH_FLANGE_MIN_MM = 3;
/**
 * Radial step between a flange point without an offset and the first point
 * of a leg. At zero lathe would merge them (compact compares only r and z),
 * and outside the sectors the face would fold into a strip of zero width.
 */
const PUNCH_STEP_MM = 0.3;
/** Segments of the arc round the rim of the mold. */
const PUNCH_ARC_STEPS = 6;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Parameters of the slump mold and its punch. */
export interface PressOptions {
  /** thickness of the printed shells, mm */
  shellMm: number;
  /** slip shrinkage, %: both parts grow by it */
  shrinkPct: number;
  /** thickness of the clay slab — the wall of the piece, mm */
  slabMm: number;
  /** seat of an ear for a leg, radially, mm */
  earMm: number;
  /** diameter of the vents, mm */
  ventMm: number;
  /** rounding of the punch's bottom, % of the largest */
  roundPct: number;
  /** screw clamps: lugs on the mold, tabs on the punch beside the ears (geo/thread.ts) */
  screws: boolean;
  /** radial clearance of the lugs' threaded holes, mm of the print */
  fitMm: number;
}

/**
 * Thickness of the slab: no thinner than the thinnest wall and no thicker
 * than 0.4 of the height. One for the mold (its ears) and the punch,
 * otherwise the legs would stop at one depth and the working surface at
 * another.
 */
export function slabThickness(slabMm: number, heightMm: number): number {
  return clamp(slabMm, SLAB_MIN_MM, Math.min(SLAB_MAX_MM, heightMm * 0.4));
}

/**
 * A catch of the outside the slab survives, mm: relief a millimetre deep
 * lets go as the clay shrinks and the slab gives; a shoulder narrowing to a
 * neck is tens of millimetres and holds the piece in the mold.
 */
const CATCH_MM = 2;

/**
 * What to tell about a piece in a slump mold: warnings, never a refusal.
 * Both are measured on the outside the mold copies, not on the inside of a
 * hollow piece. The punch is round, so the slab is as uneven as the piece is
 * out of round; within half the slab that is relief, past it the shape.
 */
export function pressWarnings(source: Pick<PressSource, 'heightMm' | 'catchMm' | 'outOfRoundMm'>, slabMm: number): Message[] {
  const warnings: Message[] = [];
  if (source.catchMm > CATCH_MM) warnings.push({ code: 'press.undercut', params: { mm: source.catchMm.toFixed(1) } });
  if (source.outOfRoundMm > slabThickness(slabMm, source.heightMm) / 2) {
    warnings.push({ code: 'press.notRound', params: { mm: source.outOfRoundMm.toFixed(1) } });
  }
  return warnings;
}

/**
 * A point of the smooth silhouette moved in by `wallMm` along the normal of
 * the axial section; a negative wall moves it out.
 */
function offsetPoint(radiusAt: (v: number) => number, heightMm: number, wallMm: number, v: number): { r: number; z: number } {
  const h = 1e-4;
  const lo = Math.max(0, v - h);
  const hi = Math.min(1, v + h);
  const drdv = (radiusAt(hi) - radiusAt(lo)) / Math.max(1e-9, hi - lo);
  const dzdv = heightMm;
  const len = Math.hypot(drdv, dzdv);
  // the outward normal of the section: (dz, −dr) / |…|
  const nr = dzdv / len;
  const nz = -drdv / len;
  return { r: radiusAt(v) - wallMm * nr, z: v * heightMm - wallMm * nz };
}

interface Offset {
  /** points of the offset from the bottom up; the first is on the floor or above */
  samples: { r: number; z: number }[];
  /** radius where the offset crosses the floor (linear between samples) */
  floorR: number;
}

/**
 * The silhouette moved in by `wall` along the normal, with the same limits a
 * cavity has: not below the floor, not below the previous point (the offset
 * of a sharp shoulder steps down) and not above `zMax`.
 */
function offsetSamples(radiusAt: (v: number) => number, heightMm: number, wall: number, floorZ: number, zMax: number): Offset {
  const samples: { r: number; z: number }[] = [];
  let previous = floorZ;
  let below: { r: number; z: number } | null = null;
  let floorR = NaN;
  // The silhouette with the floor: a point moved along its normal may still
  // come nearer than `wall` to another part of it — where the curve bends
  // tighter than `wall` (rings of relief, a sharp step) the moved points
  // loop back. Those are dropped: the rest is the honest offset, with a
  // corner where a loop was.
  const curve = [{ r: 0, z: 0 }];
  for (let i = 0; i <= INSET_SAMPLES; i++) curve.push({ r: radiusAt(i / INSET_SAMPLES), z: (i / INSET_SAMPLES) * heightMm });
  for (let i = 0; i <= INSET_SAMPLES; i++) {
    const point = offsetPoint(radiusAt, heightMm, wall, i / INSET_SAMPLES);
    if (point.z >= floorZ && tooNear(curve, point, wall)) continue;
    const z = Math.min(Math.max(point.z, floorZ, previous), zMax);
    previous = z;
    // below the floor the offset lies under it: the floor takes its place
    if (point.z < floorZ) {
      below = point;
      continue;
    }
    if (samples.length === 0) {
      const t = below && point.z > below.z ? (floorZ - below.z) / (point.z - below.z) : 1;
      floorR = below ? below.r + (point.r - below.r) * t : point.r;
    }
    const next = { r: Math.max(MIN_RADIUS_MM, point.r), z };
    if (samples.length > 0 && coincide(samples[samples.length - 1], next)) continue;
    samples.push(next);
  }
  return { samples, floorR: Math.max(MIN_RADIUS_MM, Number.isFinite(floorR) ? floorR : MIN_RADIUS_MM) };
}

/**
 * The measure of the mold the punch is built from — before shrinkage, in the
 * mold's frame (the bottom on the table, z = 0).
 */
export interface SlumpFit {
  /** radius of the mold's rim = the outer radius of the piece at the top, mm */
  rimMm: number;
  /** height of the rim over the table = height of the piece + the shell, mm */
  rimZ: number;
  /** the widest outer ring of the mold without ears (after fillWaists), mm */
  outerMaxMm: number;
  /** outer edge of the mold's top — its upper outer ring, mm */
  topOuterMm: number;
  /** diameter of the vent in the mold's bottom; the punch has the same one, mm */
  ventMm: number;
  ear: EarFit;
  /** the outer silhouette of the mold without ears and grooves, from the table up */
  outer: { r: number; z: number }[];
}

/**
 * An ear of the mold — a lug on the outer wall under the rim, the punch's leg
 * sits on it. The top of an ear is a grid face between the ring pulled out to
 * the ear's outer face and the next ring of the wall: a straight line in the
 * axial section, a little inclined outwards-down. The sole of the leg follows
 * it, so the contact is a plane, not an edge.
 */
export interface EarFit {
  /** the ear's outer face and the height of its top there */
  outerMm: number;
  topZ: number;
  /** the top of the ear at the wall: the next ring of the mold */
  wallMm: number;
  wallZ: number;
  /** where the leg's seat begins: the wall + the slab + a gap */
  seatInMm: number;
  /** bottom of the ear's vertical outer face; below it a 45° chamfer to the wall */
  faceZ: number;
  /** how far the ear stands out of the wall at most below its face: on a gentle wall a rib this deep */
  depthMm: number;
  /** reach of a leg: the punch lowers vertices with legDistance ≤ legReach */
  legReach: number;
  /**
   * Reach of the slot: vertices in (legReach, slotReach] stay free — an empty
   * grid cell between the face of the leg and the face of the cheek, both
   * inclined by one step in angle.
   */
  slotReach: number;
  /** reach of the ear with its cheeks: the cheeks are in (slotReach, reach] */
  reach: number;
  /** top of the slot's cheeks */
  cheekZ: number;
}

/** Height of the ear's top at radius r — along the straight line of its top face. */
export function earTopAt(ear: EarFit, r: number): number {
  return ear.topZ + ((r - ear.outerMm) * (ear.wallZ - ear.topZ)) / (ear.wallMm - ear.outerMm);
}

export interface SlumpShell {
  /** the mold in its printing position, grown by the shrinkage */
  mesh: SurfaceMesh;
  fit: SlumpFit;
}

/**
 * The dished mold as a shell. Inside — the outer surface of the piece with
 * relief (the slab touches it); outside — the smooth silhouette moved out
 * along the normal by the shell plus the highest relief, so a raised pattern
 * never pierces the shell. Below — a flat bottom as thick as the shell, the
 * mold stands on it; on top — a flat end at the rim. Under the rim outside —
 * three ears for the punch's legs (`slumpEars`); their size depends on the
 * slab: room is left between the wall and a leg for the clay hanging over.
 * Grown by the shrinkage.
 */
export function buildSlumpShell(source: PressSource, options: PressOptions): SlumpShell {
  const { heightMm, grid: inner, radiusAt } = source;
  const { nu, nv } = inner;
  const { shellMm, shrinkPct } = options;
  const offset = shellMm + source.outwardMm;

  const positions = new Float32Array(inner.positions.length);
  const rings: { r: number; z: number }[] = [];
  let previous = -shellMm;
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const point = offsetPoint(radiusAt, heightMm, -offset, v);
    // The bottom of the shell is flat at −shell, the top exactly at the rim;
    // in between the height never decreases: the offset of a sharp bend
    // would step down and fold the surface onto itself.
    const z = j === 0 ? -shellMm : j === nv ? heightMm : clamp(Math.max(point.z, previous), -shellMm, heightMm);
    previous = z;
    rings.push({ z, r: Math.max(point.r, radiusAt(v) + offset * 0.5) });
  }
  // Outside, the waists of the silhouette at the bottom are not repeated: a
  // bowl's foot would give the mold a plinth with a recess, and the mold
  // would stand on it rather than on its wall. Below the widest place the
  // outer silhouette is replaced by the concave envelope — hollows are
  // bridged by a straight wall from the belly to the base, convex sides stay
  // as they are. Inside nothing changes: there is the piece.
  fillWaists(rings);
  spreadDuplicates(rings);
  const outerMaxMm = rings.reduce((max, ring) => Math.max(max, ring.r), 0);
  // a vent no wider than a third of the bottom: the bottom must stay a bottom
  const vent = clamp(options.ventMm, 0.5, radiusAt(0) * 0.66);
  const slab = slabThickness(options.slabMm, heightMm);
  const fitOf = (ears: SlumpEars): SlumpFit => ({
    rimMm: radiusAt(1),
    rimZ: heightMm + shellMm,
    outerMaxMm,
    topOuterMm: rings[nv].r,
    ventMm: vent,
    outer: rings.map(({ r, z }) => ({ r, z: z + shellMm })),
    ear: {
      ...ears.fit,
      topZ: ears.fit.topZ + shellMm,
      wallZ: ears.fit.wallZ + shellMm,
      faceZ: ears.fit.faceZ + shellMm,
      cheekZ: ears.fit.cheekZ + shellMm,
    },
  });
  const ears = slumpEars(rings, nu, slab, heightMm, options.earMm);
  const fit = fitOf(ears);
  for (let j = 0; j <= nv; j++) {
    const { r, z } = rings[j];
    for (let i = 0; i < nu; i++) {
      const u = (2 * Math.PI * i) / nu;
      const k = (j * nu + i) * 3;
      const radius = Math.max(r, ears.radiusAt(j, z, legDistance(u)));
      positions[k] = radius * Math.cos(u);
      positions[k + 1] = radius * Math.sin(u);
      positions[k + 2] = z;
    }
  }
  const grooves = ventGrooves(vent, shellMm);
  if (grooves) liftGrooveExits(positions, nu, nv, grooves);
  const outer: Grid = { nu, nv, positions };
  // the floor of the cavity is the bottom of the piece: a mark recessed into
  // it stands out here, and the slab takes it back recessed
  const floor: CapSpec = source.floorAt ? { dense: [{ from: 0, to: Infinity, stepMm: FLOOR_CELL_MM }], heightAt: source.floorAt } : {};
  const shell = assembleHollowMesh(outer, inner.positions, vent, {
    outer: grooves
      ? {
          planeZ: -shellMm,
          dense: [{ from: 0, to: Infinity, stepMm: grooves.widthMm / 4 }],
          heightAt: grooves.heightAt,
        }
      : {},
    inner: floor,
  });
  // the bottom onto the table
  for (let i = 2; i < shell.positions.length; i += 3) shell.positions[i] += shellMm;
  const mesh = { ...shell, normals: meshNormals(shell.positions, shell.indices) };
  return { mesh: scaleMesh(mesh, 1 + shrinkPct / 100), fit };
}

/** Grooves of the sole: the lift of the sole over the table at (x, y). */
interface VentGrooves {
  widthMm: number;
  depthMm: number;
  heightAt: (x: number, y: number) => number;
}

/**
 * Three grooves from the axis at angles halfway between the ears. The lift is
 * the distance to the groove's edge (45° sides), capped by the depth; at the
 * axis the rays meet, and a common dimple forms round the vent by itself.
 * null — the mold's bottom is too thin for a groove.
 */
function ventGrooves(ventMm: number, shellMm: number): VentGrooves | null {
  const widthMm = GROOVE_WIDTH_VENTS * ventMm;
  const depthMm = Math.min(widthMm / 2, shellMm - GROOVE_ROOF_MM);
  if (depthMm < GROOVE_MIN_MM) return null;
  const pitch = (2 * Math.PI) / PUNCH_LEGS;
  // the ears are at −90° + k·pitch (legDistance), the grooves half a pitch from them
  const rays = Array.from({ length: PUNCH_LEGS }, (_, k) => {
    const a = Math.PI / 2 + k * pitch;
    return [Math.cos(a), Math.sin(a)] satisfies [number, number];
  });
  return {
    widthMm,
    depthMm,
    heightAt: (x, y) => {
      let lift = 0;
      for (const [cx, cy] of rays) {
        const along = x * cx + y * cy;
        // to the ray: across it, and behind the axis — to the axis itself
        const off = along > 0 ? Math.abs(x * cy - y * cx) : Math.hypot(x, y);
        lift = Math.max(lift, widthMm / 2 - off);
      }
      return clamp(lift, 0, depthMm);
    },
  };
}

/**
 * Where the grooves come out: the bottom of the wall in their sectors rises
 * with the edge of the sole and fades out by twice the groove's depth. The
 * lift falls with height slower than the height grows, so the rows of the
 * wall never swap places and the surface does not fold.
 */
function liftGrooveExits(positions: Float32Array, nu: number, nv: number, grooves: VentGrooves): void {
  const z0 = positions[2];
  const band = 2 * grooves.depthMm;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = (j * nu + i) * 3;
      const above = positions[k + 2] - z0;
      if (above >= band) continue;
      const lift = grooves.heightAt(positions[k], positions[k + 1]);
      positions[k + 2] += lift * (1 - above / band);
    }
  }
}

/**
 * Ears of the mold: the rings up to `ring` inclusive are pulled out in the
 * ears' sectors to the outer face — vertical under the top, below it a 45°
 * chamfer back to the wall (the mold prints standing, without supports). The
 * top is on the ring no higher than EAR_DROP_MM below the rim; the seat of
 * the leg is past the wall above the ear by the slab and a gap, so the clay
 * over the rim lies between them. On both sides of the seat, cheeks of a slot
 * rise almost to the rim: the leg enters between them long before it lands,
 * and the punch neither misses the ears nor tilts on its way. Heights are
 * before the lift by the shell.
 */
interface SlumpEars {
  radiusAt: (j: number, z: number, angle: number) => number;
  fit: EarFit;
}

function slumpEars(rings: readonly { r: number; z: number }[], nu: number, slabMm: number, heightMm: number, seatMm: number): SlumpEars {
  const nv = rings.length - 1;
  let ring = 1;
  for (let j = 1; j < nv; j++) if (rings[j].z <= heightMm - EAR_DROP_MM) ring = j;
  let cheekRing = ring;
  for (let j = ring + 1; j < nv; j++) if (rings[j].z <= heightMm - CHEEK_BELOW_RIM_MM) cheekRing = j;
  const topZ = rings[ring].z;
  const faceZ = Math.max(rings[0].z, topZ - PUNCH_LIP_MM - EAR_FACE_SPARE_MM);

  let above = 0;
  for (let j = ring + 1; j <= nv; j++) above = Math.max(above, rings[j].r);
  // the lip goes down along the outer face: the wall must not stick out past it there
  let face = 0;
  for (const { r, z } of rings) if (z >= faceZ && z <= topZ) face = Math.max(face, r);
  const seatInMm = above + slabMm + EAR_CLAY_GAP_MM;
  const outerMm = Math.max(seatInMm, face) + seatMm;

  // The leg, an empty cell, a cheek. The ear goes under the cheeks too:
  // otherwise their bottom would hang over the table, and the mold prints standing.
  const step = (2 * Math.PI) / nu;
  const legReach = legSpan(outerMm, nu);
  const slotReach = legReach + step;
  const reach = slotReach + Math.max(CHEEK_MM / outerMm, step * 2.01);
  // How far the ear stands out of the wall at the bottom of its vertical face: below it does not grow.
  let wallAtFace = rings[0].r;
  for (let j = 1; j <= ring; j++) {
    const a = rings[j - 1];
    const b = rings[j];
    if (b.z < faceZ) continue;
    const t = b.z > a.z ? clamp((faceZ - a.z) / (b.z - a.z), 0, 1) : 1;
    wallAtFace = a.r + (b.r - a.r) * t;
    break;
  }
  const depthMm = Math.max(0, outerMm - wallAtFace);
  return {
    radiusAt: (j, z, angle) => {
      if (angle > reach) return 0;
      if (j <= ring) {
        // Under the vertical face — a 45° chamfer, but no deeper than the ear
        // stood out at its bottom: on a steep wall (a tumbler) the chamfer
        // runs into the wall and the ear ends, on a gentle one (a bowl) it
        // goes down to the base as a rib parallel to the wall. It cannot
        // narrow or thin downwards: on a wall that itself overhangs past 45°
        // that would give a face overhanging even more, which needs supports.
        return Math.min(outerMm - Math.max(0, faceZ - z), rings[j].r + depthMm);
      }
      return j <= cheekRing && angle > slotReach ? outerMm : 0;
    },
    fit: {
      outerMm,
      topZ,
      wallMm: rings[ring + 1].r,
      wallZ: rings[ring + 1].z,
      seatInMm,
      faceZ,
      depthMm,
      legReach,
      slotReach,
      reach,
      cheekZ: rings[cheekRing].z,
    },
  };
}

/**
 * Angular reach of a leg: vertices whose grid cell in angle touches its
 * sector, but no less than a step on each side of the centre — one lowered
 * vertex would make a needle with a sole as thin as a line.
 */
function legSpan(radiusMm: number, nu: number): number {
  const step = (2 * Math.PI) / nu;
  return Math.max(PUNCH_LEG_WIDTH_MM / 2 / radiusMm + step / 2, step * 1.01);
}

/**
 * The least concave majorant of r(z) below the widest ring: the upper hull of
 * the points (z, r) by the monotone chain, the rings are raised to it.
 */
function fillWaists(rings: { r: number; z: number }[]): void {
  let widest = 0;
  for (let j = 1; j < rings.length; j++) if (rings[j].r >= rings[widest].r) widest = j;
  const hull: { r: number; z: number }[] = [];
  for (let j = 0; j <= widest; j++) {
    const p = rings[j];
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      // b lies no higher than the chord a→p — the upper hull does not need it
      const cross = (b.z - a.z) * (p.r - a.r) - (b.r - a.r) * (p.z - a.z);
      if (cross >= 0) hull.pop();
      else break;
    }
    hull.push(p);
  }
  for (let j = 0; j <= widest; j++) {
    const { z } = rings[j];
    let k = 0;
    while (k < hull.length - 2 && hull[k + 1].z < z) k++;
    const a = hull[k];
    const b = hull[Math.min(k + 1, hull.length - 1)];
    const t = b.z > a.z ? clamp((z - a.z) / (b.z - a.z), 0, 1) : 1;
    rings[j] = { z, r: Math.max(rings[j].r, a.r + (b.r - a.r) * t) };
  }
}

/**
 * Rings that coincide after the lift (the same r and z) are spread along the
 * segment to the next different ring — otherwise degenerate faces would lie
 * between them.
 */
const same = (p: { r: number; z: number }, q: { r: number; z: number }): boolean =>
  Math.abs(p.r - q.r) < 1e-6 && Math.abs(p.z - q.z) < 1e-6;

function spreadDuplicates(rings: { r: number; z: number }[]): void {
  for (let a = 0; a < rings.length - 1; a++) {
    let b = a + 1;
    while (b < rings.length && same(rings[a], rings[b])) b++;
    if (b === a + 1 || b >= rings.length) continue;
    const from = rings[a];
    const to = rings[b];
    for (let k = a + 1; k < b; k++) {
      const t = (k - a) / (b - a);
      rings[k] = { r: from.r + (to.r - from.r) * t, z: from.z + (to.z - from.z) * t };
    }
    a = b - 1;
  }
}

/**
 * Inner geometry of the punch — what the build and the tests both need: radii
 * of the legs and the flange, thicknesses, the reach of the legs. All before
 * shrinkage, in the mold's frame.
 */
export interface PunchLayout {
  /** thickness of the slab: the gap between the punch and the mold */
  slabMm: number;
  /** inner face of a leg's lip: the ear's outer face + clearance */
  lipInMm: number;
  /** bottom of the lip: PUNCH_LIP_MM below the top of the ear */
  lipZ: number;
  /** outer radius of the flange and the legs */
  flangeMm: number;
  /** thickness of the flange */
  flangeT: number;
  /** bottom of the flange over the table = the mold's rim + the slab */
  flangeZ: number;
  /** angular reach of a leg: vertices with legDistance ≤ reach are lowered */
  legReach: number;
}

export function punchLayout(source: PressSource, options: PressOptions, fit: SlumpFit): PunchLayout {
  const slabMm = slabThickness(options.slabMm, source.heightMm);
  const lipInMm = fit.ear.outerMm + PUNCH_CLEARANCE_MM;
  return {
    slabMm,
    lipInMm,
    lipZ: fit.ear.topZ - PUNCH_LIP_MM,
    flangeMm: lipInMm + PUNCH_STEP_MM + PUNCH_LIP_T_MM,
    flangeT: Math.max(options.shellMm, PUNCH_FLANGE_MIN_MM),
    flangeZ: fit.rimZ + slabMm,
    legReach: fit.ear.legReach,
  };
}

/** Angular distance to the centre of the nearest leg; leg 0 is at −y. */
export function legDistance(u: number): number {
  const pitch = (2 * Math.PI) / PUNCH_LEGS;
  const t = (((u + Math.PI / 2) % pitch) + pitch) % pitch;
  return Math.min(t, pitch - t);
}

/**
 * The screw clamps — a lug on the mold and a tab on the punch beside each
 * ear — in the mm of the print (after the shrinkage: the screws and stops
 * do not shrink) and in the mold's frame with the punch pressed down.
 *
 * Both are prisms of the convex hull, in plan, of a boss round the screw's
 * axis and of the side of the ear (the leg) they lean on. The lug leans on the
 * ear's cheek, its boss BOSS_IN_CHEEK_MM into it, and touches the wall only
 * by the ear; the cheek is cut down to the seat round the stop. The lug is
 * cut back off the cavity (`cavity`: the relief plus half a shell, so its
 * face lies inside the wall) and off the clay hanging over the rim (inside
 * `seatInMm` above the ears' top, `shelfZ`). Its underside leans on the ear
 * at 45° (`footZ`, `support`): the mold prints standing without supports.
 * Its seat is exactly PAD_GAP_MM
 * under the tab, the tab TAB_T_MM thick, the thread under the seat
 * LUG_THREAD_MM long: one set of screws and stops fits every mold.
 */
export interface ScrewLayout {
  /** centres of the ears the lugs lean on, radians */
  ears: number[];
  /** the screws' axes: their angles and radius */
  angles: number[];
  axisMm: number;
  /** inside it the clay hangs over the rim */
  seatInMm: number;
  /** the ears' top: the clay may lie on what is no higher */
  shelfZ: number;
  /**
   * The lug's top (the stop stands on it); LUG_THREAD_MM under it the
   * landing, the flat bottom of its boss round the hole's exit (a steel nut,
   * a clamp's jaw), with NUT_ROOM kept free under it. The thread is whole
   * between the two.
   */
  seatZ: number;
  landingZ: number;
  /** radial clearance of the threaded hole, mm */
  fitMm: number;
  /**
   * The lug's underside past its boss, so that it prints without supports:
   * it rises at 45° away from the ear's side — from `footZ` at the side's
   * plane — and stays within `support`, the ear's outline widened upwards at
   * 45°. The boss itself comes down to the landing and prints on supports.
   */
  footZ: number;
  support: RZ[];
  /** the lug leans on the ear this angle inside its side */
  inCheek: number;
  /** the tab: its top is the punch's flange top, flat on the bed in print */
  tabTopZ: number;
  tabBottomZ: number;
  /** underside of the punch's flange over the clay */
  flangeZ: number;
  /** the slot's cheeks reach this high: the tab clears them */
  cheekZ: number;
  /** angles from an ear's centre: the leg's side, the slot's edge, the cheek's outer side */
  legSide: number;
  slotSide: number;
  earSide: number;
  /** outer radius of the ear and of the leg's flange */
  earOuterMm: number;
  legOuterMm: number;
  /** radius inside the punch's flange ring the tab holds on to */
  bodyMm: number;
  /** a lug reaches this deep in plan before the cavity is cut off it */
  innerMm: number;
  /** the region a lug keeps out of, as an axial section from the axis: the cavity with its relief, half a shell more */
  cavity: RZ[];
}

/** Radius of the boss round a screw's axis — the lug's and the tab's; the stop stands on it whole. */
export const BOSS_R_MM = PAD.d / 2;
/** How far a lug's boss goes into the ear's cheek, mm: the lug leans on the ear, not on the wall. */
export const BOSS_IN_CHEEK_MM = 2;
/** Step in height of the lug's support envelope, mm. */
const SUPPORT_STEP_MM = 0.25;

export function screwLayout(source: PressSource, options: PressOptions, fit: SlumpFit): ScrewLayout {
  const grow = 1 + options.shrinkPct / 100;
  const pitch = (2 * Math.PI) / PUNCH_LEGS;
  const { ear } = fit;
  const outer = fit.outer.map(({ r, z }) => ({ r: r * grow, z: z * grow }));
  const punch = punchLayout(source, options, fit);

  const tabTopZ = (punch.flangeZ + punch.flangeT) * grow;
  const tabBottomZ = tabTopZ - TAB_T_MM;
  const seatZ = tabBottomZ - PAD_GAP_MM;
  const landingZ = seatZ - LUG_THREAD_MM;
  const seatInMm = ear.seatInMm * grow;
  let below = 0;
  for (const ring of outer) if (ring.z <= seatZ) below = Math.max(below, ring.r);
  // the stop outside the clay; a screw turned in from below passes the mold's wall with its head
  const axisMm = Math.max(seatInMm + BOSS_R_MM, below + SCREW.headD / 2 + 1);
  // beside the ear, the boss a little into its cheek: the cheek is cut round the stop
  // (lugSolids), and the head of a screw from below passes far under the ear
  const ears = Array.from({ length: PUNCH_LEGS }, (_, i) => -Math.PI / 2 + i * pitch);
  const angles = ears.map((c) => c + ear.reach + Math.asin(Math.min(1, (BOSS_R_MM - BOSS_IN_CHEEK_MM) / axisMm)));

  const sink = (options.shellMm * grow) / 2;
  const cavity: RZ[] = [{ r: 0, z: -1 }];
  for (let i = 0; i <= INSET_SAMPLES; i++) {
    const v = i / INSET_SAMPLES;
    const r = (source.radiusAt(v) + source.outwardMm) * grow + sink;
    const z = (v * source.heightMm + options.shellMm) * grow;
    if (i === 0) cavity.push({ r, z: -1 });
    cavity.push({ r, z });
  }
  const high = tabTopZ + 100;
  cavity.push({ r: cavity[cavity.length - 1].r, z: high }, { r: 0, z: high });
  // Past the boss the underside rises at 45° away from the ear's side, from
  // footZ at the side's plane, and stays within `support`: the ear's outline
  // (under its face a 45° chamfer, on a gentle wall a rib along it,
  // slumpEars) widened upwards at 45°. Whatever lies in it leans on the ear.
  // The boss comes down to the landing whatever the ear holds: it prints on
  // supports, so the ear never grows for it.
  const inCheek = (ear.reach - ear.slotReach) / 2;
  const wallAt = (z: number): number => {
    let r = fit.outer[0].r;
    for (let j = 1; j < fit.outer.length; j++) {
      const a = fit.outer[j - 1];
      const b = fit.outer[j];
      if (z < a.z || z > b.z) continue;
      r = b.z > a.z ? a.r + ((b.r - a.r) * (z - a.z)) / (b.z - a.z) : Math.max(a.r, b.r);
    }
    return r;
  };
  const earAt = (z: number): number => Math.min(ear.outerMm - Math.max(0, ear.faceZ - z), wallAt(z) + ear.depthMm) * grow;
  const toAxis = BOSS_R_MM - BOSS_IN_CHEEK_MM;
  const { fitMm } = options;
  const from = Math.max(0, landingZ - toAxis - THREAD.d / 2 - fitMm - 2);
  const support: RZ[] = [{ r: 0, z: from }];
  let widest = 0;
  for (let z = from; z <= seatZ + 1 + 1e-9; z += SUPPORT_STEP_MM) {
    widest = Math.max(support.length === 1 ? 0 : widest + SUPPORT_STEP_MM, earAt(z / grow));
    support.push({ r: widest, z });
  }
  support.push({ r: 0, z: support[support.length - 1].z });
  // the slope meets the landing at the hole's far edge: the hole leaves the lug through the landing
  const footZ = landingZ - toAxis - THREAD.d / 2 - fitMm;

  let innerMm = Infinity;
  for (const p of cavity) if (p.r > 0 && p.z >= footZ && p.z <= seatZ) innerMm = Math.min(innerMm, p.r);
  if (!Number.isFinite(innerMm)) innerMm = seatInMm - 2;

  return {
    ears,
    angles,
    axisMm,
    seatInMm,
    shelfZ: ear.topZ * grow,
    seatZ,
    landingZ,
    fitMm,
    footZ,
    support,
    inCheek,
    tabTopZ,
    tabBottomZ,
    flangeZ: punch.flangeZ * grow,
    cheekZ: ear.cheekZ * grow,
    legSide: ear.legReach,
    slotSide: ear.slotReach,
    earSide: ear.reach,
    earOuterMm: ear.outerMm * grow,
    legOuterMm: punch.flangeMm * grow,
    bodyMm: fit.rimMm * grow,
    innerMm: innerMm - 1,
    cavity,
  };
}

/**
 * A polyline moved into the material (to the left going up) by `d`, with the
 * same limits a cavity has: not below the floor (a point under it is dropped
 * and the crossing with the floor interpolated), not below the previous one
 * and not above `zMax` (the polyline ends there).
 */
function offsetPolyline(points: readonly { r: number; z: number }[], d: number, floorZ: number, zMax: number): { r: number; z: number }[] {
  const out: { r: number; z: number }[] = [];
  let previous = floorZ;
  let below: { r: number; z: number } | null = null;
  for (let k = 0; k < points.length; k++) {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(points.length - 1, k + 1)];
    const dr = b.r - a.r;
    const dz = b.z - a.z;
    const len = Math.hypot(dr, dz) || 1;
    // the outward normal of a polyline going up with the material on the left: (dz, −dr)
    const raw = { r: points[k].r - (d * dz) / len, z: points[k].z + (d * dr) / len };
    // a loop of the offset where the polyline bends tighter than d: dropped
    if (raw.z >= floorZ && tooNear(points, raw, d)) continue;
    if (raw.z < floorZ) {
      below = raw;
      continue;
    }
    if (out.length === 0 && below) {
      const t = (floorZ - below.z) / (raw.z - below.z);
      out.push({ r: below.r + (raw.r - below.r) * t, z: floorZ });
    }
    const z = Math.max(raw.z, previous);
    if (z >= zMax) {
      const last = out[out.length - 1] ?? raw;
      const t = z > last.z ? (zMax - last.z) / (z - last.z) : 1;
      out.push({ r: last.r + (raw.r - last.r) * t, z: zMax });
      return out;
    }
    previous = z;
    if (out.length > 0 && coincide(out[out.length - 1], { r: raw.r, z })) continue;
    out.push({ r: raw.r, z });
  }
  return out;
}

type RZ = { r: number; z: number };

/**
 * Two points of an offset this close are one: a pair a hair apart (a point
 * held at the previous height next to its neighbour) made needle triangles.
 */
const coincide = (a: RZ, b: RZ): boolean => Math.hypot(a.r - b.r, a.z - b.z) < 1e-4;

/** A point of an offset by `d` that came nearer than `d` to the curve it was moved from. */
function tooNear(curve: readonly RZ[], p: RZ, d: number): boolean {
  return nearestOn(curve, p).distance < d * (1 - 1e-3) - 1e-6;
}

/** Distance from a point to a polyline in the axial section and the nearest point on it. */
function nearestOn(points: readonly RZ[], p: RZ): { distance: number; point: RZ; segment: number } {
  let best = { distance: Infinity, point: points[0], segment: 0 };
  for (let k = 0; k + 1 < points.length; k++) {
    const a = points[k];
    const b = points[k + 1];
    const dr = b.r - a.r;
    const dz = b.z - a.z;
    const len2 = dr * dr + dz * dz;
    const t = len2 > 0 ? clamp(((p.r - a.r) * dr + (p.z - a.z) * dz) / len2, 0, 1) : 0;
    const q = { r: a.r + dr * t, z: a.z + dz * t };
    const distance = Math.hypot(p.r - q.r, p.z - q.z);
    if (distance < best.distance) best = { distance, point: q, segment: k };
  }
  return best;
}

/**
 * Rounding of the punch's bottom with a rolling circle touching the floor and
 * the wall of the working surface. `fraction` is the share of the largest
 * radius, at which the centre of the circle reaches the axis: then no floor
 * is left and the bottom is a cap, for a bowl nearly a hemisphere. The slab
 * gets thicker in the corner (like a bowl with a heavy foot), but never
 * thinner than set: the circle lies entirely inside the offset. `wall`
 * starts on the floor at (floorR, floorZ); the result goes from where the
 * circle touches the floor (or from the edge of the vent, if the cap reached
 * it) up the arc and on along the wall.
 */
function roundBottom(wall: readonly RZ[], floorZ: number, fraction: number, ventMm: number): RZ[] {
  if (!(fraction > 0) || wall.length < 2) return [...wall];
  const gap = (r: number, radius: number): number => nearestOn(wall, { r, z: floorZ + radius }).distance - radius;

  // the largest radius: a circle centred on the axis touches the wall;
  // for a conical wall it is more than the height: ~ r·sin α / (1 − cos α)
  let lo = 0;
  let hi = 4 * wall.reduce((max, p) => Math.max(max, p.r, p.z - floorZ), 0);
  if (gap(0, hi) >= 0) lo = hi;
  for (let i = 0; i < 48 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (gap(0, mid) >= 0) lo = mid;
    else hi = mid;
  }
  const radius = lo * Math.min(1, fraction);
  if (radius < 0.05) return [...wall];

  // the centre — the farthest from the axis at which the circle does not cut the wall yet
  let near = 0;
  let far = wall[0].r;
  for (let i = 0; i < 48 && far - near > 1e-6; i++) {
    const mid = (near + far) / 2;
    if (gap(mid, radius) >= 0) near = mid;
    else far = mid;
  }
  const center = { r: near, z: floorZ + radius };
  const touch = nearestOn(wall, center);
  // a point of the arc: center + radius·(sin θ, −cos θ); θ = 0 touches the floor
  const end = Math.atan2(touch.point.r - center.r, center.z - touch.point.z);
  const start = center.r < ventMm ? Math.asin(Math.min(1, (ventMm - center.r) / radius)) : 0;
  const steps = Math.max(4, Math.ceil((end - start) / (Math.PI / 64)));
  const arc: RZ[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = start + ((end - start) * k) / steps;
    arc.push({ r: center.r + radius * Math.sin(t), z: center.z - radius * Math.cos(t) });
  }
  return [...arc, ...wall.slice(touch.segment + 1)];
}

/**
 * The inner shell starts at the edge of the vent: if the offset did not reach
 * it — a horizontal floor up to it; if it went past — cut there.
 */
function fromVent(points: RZ[], ventMm: number): RZ[] {
  if (points.length === 0 || points[0].r >= ventMm) {
    return points.length === 0 ? points : [{ r: ventMm, z: points[0].z }, ...points];
  }
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    if (b.r < ventMm) continue;
    const t = (ventMm - a.r) / (b.r - a.r);
    return [{ r: ventMm, z: a.z + (b.z - a.z) * t }, ...points.slice(k)];
  }
  return points;
}

/**
 * The punch's axial section in the mold's frame, before the shrinkage: the
 * working surface from the vent (or the edge of the rounded bottom) up, the
 * arc round the mold's rim to the flange, and the inner shell from the vent
 * up to the rim.
 */
export function punchSection(source: PressSource, options: PressOptions, fit: SlumpFit): { surface: RZ[]; arc: RZ[]; inner: RZ[] } {
  const { heightMm, radiusAt } = source;
  const { shellMm, roundPct } = options;
  const { slabMm, flangeZ } = punchLayout(source, options, fit);
  const vent = fit.ventMm / 2;

  // The working surface in the piece's frame, without a cap at the rim: for
  // a flared rim its end is above the mold's rim, and an arc goes from there round the rim.
  const work = offsetSamples(radiusAt, heightMm, slabMm, slabMm, Infinity);
  const lift = (p: RZ): RZ => ({ r: p.r, z: p.z + shellMm });
  const wall = [{ r: work.floorR, z: slabMm }, ...work.samples].map(lift);
  const floorZ = shellMm + slabMm;
  // the rounding's arc ends where it touches the wall — at times right on a wall's point
  const surface = roundBottom(wall, floorZ, roundPct / 100, vent).filter((p, k, all) => k === 0 || !coincide(all[k - 1], p));

  // An arc of the slab's radius round the mold's rim: an honest offset of the
  // wall–rim corner, the clay in the corner as thick as everywhere. It goes
  // over the inside of the rim: when the working surface ends below the rim
  // (a rounded lip curls in), the angle is below −90° and the plain way to
  // +90° went round the outside, through the mold's wall — a torus.
  const top = surface[surface.length - 1];
  let from = Math.atan2(top.z - fit.rimZ, top.r - fit.rimMm);
  if (from < -Math.PI / 2) from += 2 * Math.PI;
  const arc: RZ[] = [];
  const to = Math.PI / 2;
  for (let k = 1; k <= PUNCH_ARC_STEPS; k++) {
    const a = from + ((to - from) * k) / PUNCH_ARC_STEPS;
    arc.push({ r: fit.rimMm + slabMm * Math.cos(a), z: fit.rimZ + slabMm * Math.sin(a) });
  }
  arc[arc.length - 1] = { r: fit.rimMm, z: flangeZ };

  // The inner shell — the working surface moved by one more shell up to the
  // rim; above it a vertical up to the flange's top.
  const inner = fromVent(offsetPolyline(surface, shellMm, floorZ + shellMm, fit.rimZ), vent);
  return { surface, arc, inner };
}

/**
 * The punch for the dished mold: goes into the mold from above and presses
 * the slab against its working surface so that there is exactly the slab
 * between them everywhere.
 *
 * Its working surface is the inner surface of the piece (the silhouette moved
 * in by the slab), smooth: the relief lies on the mold. Over the mold's rim
 * — a flat flange hanging a slab above it; from the flange outside the mold
 * three short hooked legs go down to the ears. The sole of a leg lands on the
 * top of the ear — that is the depth stop, and it sets the slab's thickness;
 * the lip goes lower and holds the ear from outside with a clearance — three
 * lips centre the punch. A leg keeps the slab and a gap from the wall: the
 * clay over the rim lies between them.
 *
 * All of it is one body of revolution (lathe), the legs too: the points of
 * the flange's underside carry an angular offset (`LathePoint.offset`) —
 * down to the ear in the legs' sectors, in towards the mold's top between
 * them, so the flange is wide only over the legs. The punch is hollow, a
 * shell as thick as the mold's, with a vent along the axis — the contour
 * never touches the axis, the body is a torus. Printed flange down — turned
 * over, not mirrored (`turnOver`); grown by the shrinkage, as the mold is.
 */
export function buildPunch(source: PressSource, options: PressOptions, fit: SlumpFit): SurfaceMesh {
  const { nu } = source.grid;
  const { shrinkPct } = options;
  const layout = punchLayout(source, options, fit);
  const { slabMm, lipInMm, lipZ, flangeMm, flangeZ, legReach: reach } = layout;
  const { ear } = fit;
  const flangeTop = flangeZ + layout.flangeT;
  const vent = fit.ventMm / 2;
  const floorZ = options.shellMm + slabMm;

  const { surface, arc, inner } = punchSection(source, options, fit);
  const shellTop = inner[inner.length - 1];

  // The flange and the legs. In the legs' sectors the points of the flange's
  // underside go down: the sole onto the top of the ear (the same line as
  // its top — a plane contact), the lip lower, along the ear's outer face.
  // Between the legs the same points squeeze towards the mold's rim: there
  // the flange only presses the clay on the top, and a wide ring would be
  // plastic for nothing. One grid step past a leg's edge they stay wide and
  // at the flange's height: the face across that step rises straight up
  // outside the ear's face, the next one runs in flat over the cheeks. Down
  // and in at once, one face slanted through the ear's outer corner
  // (plans/TODO-PUNCH-LEGS.md).
  const narrowMm = Math.min(fit.topOuterMm + FLANGE_OVER_RIM_MM, ear.seatInMm - PUNCH_STEP_MM);
  const edge = reach + (2 * Math.PI) / nu;
  const flangePoint = (r: number, z: number, k: number, drop: number): LathePoint => ({
    r,
    z,
    offset: (u) => {
      const d = legDistance(u);
      if (d <= reach) return { dr: 0, dz: -drop };
      if (d <= edge + 1e-9) return { dr: 0, dz: 0 };
      return { dr: narrowMm + k * FLANGE_PACK_MM - r, dz: 0 };
    },
  });
  const contour: LathePoint[] = [
    // the vent below; the floor of the working surface, if the rounding left one
    ...(surface[0].r > vent ? [{ r: vent, z: floorZ }] : []),
    ...surface,
    ...arc,
    flangePoint(ear.seatInMm - PUNCH_STEP_MM, flangeZ, 0, 0),
    flangePoint(ear.seatInMm, flangeZ, 1, flangeZ - earTopAt(ear, ear.seatInMm)),
    flangePoint(lipInMm, flangeZ, 2, flangeZ - earTopAt(ear, lipInMm)),
    flangePoint(lipInMm + PUNCH_STEP_MM, flangeZ, 3, flangeZ - lipZ),
    flangePoint(flangeMm, flangeZ, 4, flangeZ - lipZ),
    // the flange's edge — also the outer face of a leg
    flangePoint(flangeMm, flangeTop, 4, 0),
    { r: shellTop.r, z: flangeTop },
    // the inner shell top-down to the vent
    ...inner.toReversed(),
  ];
  const raw = lathe(contour, nu);
  const mesh = { ...raw, normals: meshNormals(raw.positions, raw.indices) };
  return turnOver(scaleMesh(mesh, 1 + shrinkPct / 100));
}
