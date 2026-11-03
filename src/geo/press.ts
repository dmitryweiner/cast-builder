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
import { assembleHollowMesh, mirrorZ, scaleMesh } from './surface';
import type { CapSpec } from './bottom';
import { meshNormals } from './normals';
import type { PressSource } from './revolve';
import { FLOOR_CELL_MM, MIN_RADIUS_MM } from './revolve';
import type { LathePoint } from './lathe';
import { lathe } from './lathe';
import { LUG_THREAD_MM, PAD, PAD_GAP_MM, PETAL_T_MM, SCREW } from './thread';

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
  /** screw clamps: lugs on the mold, petals on the punch (geo/thread.ts) */
  screws: boolean;
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
  for (let i = 0; i <= INSET_SAMPLES; i++) {
    const point = offsetPoint(radiusAt, heightMm, wall, i / INSET_SAMPLES);
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
    samples.push({ r: Math.max(MIN_RADIUS_MM, point.r), z });
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
  const ears = slumpEars(rings, nu, slabThickness(options.slabMm, heightMm), heightMm, options.earMm);
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
  // a vent no wider than a third of the bottom: the bottom must stay a bottom
  const vent = clamp(options.ventMm, 0.5, radiusAt(0) * 0.66);
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
  return {
    mesh: scaleMesh(mesh, 1 + shrinkPct / 100),
    fit: {
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
        cheekZ: ears.fit.cheekZ + shellMm,
      },
    },
  };
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
function slumpEars(
  rings: readonly { r: number; z: number }[],
  nu: number,
  slabMm: number,
  heightMm: number,
  seatMm: number,
): { radiusAt: (j: number, z: number, angle: number) => number; fit: EarFit } {
  const nv = rings.length - 1;
  let ring = 1;
  for (let j = 1; j < nv; j++) if (rings[j].z <= heightMm - EAR_DROP_MM) ring = j;
  let cheekRing = ring;
  for (let j = ring + 1; j < nv; j++) if (rings[j].z <= heightMm - CHEEK_BELOW_RIM_MM) cheekRing = j;
  const topZ = rings[ring].z;
  const faceZ = topZ - PUNCH_LIP_MM - EAR_FACE_SPARE_MM;

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
    // with screws the petals are a part of the flange and pull on it: it prints PETAL_T_MM after the shrinkage
    flangeT: options.screws ? PETAL_T_MM / (1 + options.shrinkPct / 100) : Math.max(options.shellMm, PUNCH_FLANGE_MIN_MM),
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

/** Angular distance from `u` to the nearest of `angles`. */
export function lugDistance(u: number, angles: readonly number[]): number {
  let best = Math.PI;
  for (const angle of angles) {
    const d = Math.abs(((((u - angle) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    best = Math.min(best, d);
  }
  return best;
}

/**
 * The screw clamps — three lugs on the mold, three petals of the punch's
 * flange over them — in the mm of the print (after
 * the shrinkage: the screws and stops do not shrink) and in the mold's frame
 * with the punch pressed down.
 *
 * A lug is a sector of `profile` revolved round the axis and fused onto the
 * shell. By the wall it is a low shelf at the height of the ears' top — the
 * clay hanging over the rim lies on it as on the ears; past `seatInMm` (the
 * ears' rule: the wall, the slab, a gap) it rises to a flat seat exactly
 * PAD_GAP_MM under the petal, so one stop fits every mold. Under the seat a
 * vertical face LUG_THREAD_MM long, then a 45° chamfer back to the wall:
 * the mold still prints standing without supports; on a wall gentler than
 * that the chamfer may reach the table. So a lug is not halfway between the
 * ears, where the grooves of the sole come out, but halfway between the
 * ear's cheeks and the groove. The inner edge follows
 * the wall sunk into it by half a shell — inside the material, never at its
 * surface, never into the cavity.
 */
export interface ScrewLayout {
  /** centres of the lugs, radians */
  angles: number[];
  /** half the angle of a lug's sector: the stop fits in it with a millimetre to spare */
  halfAngle: number;
  /** radius of the screws' axes */
  axisMm: number;
  /** outer radius of a lug and of a petal */
  outerMm: number;
  /** where the seat begins: inside it the clay hangs over the rim */
  seatInMm: number;
  shelfZ: number;
  seatZ: number;
  /** bottom of the lug's vertical face */
  faceZ: number;
  /** underside of the petal of the pressed punch */
  petalZ: number;
  /** the lug's axial section (r, z), counter-clockwise */
  profile: { r: number; z: number }[];
}

export function screwLayout(source: PressSource, options: PressOptions, fit: SlumpFit): ScrewLayout {
  const grow = 1 + options.shrinkPct / 100;
  const pitch = (2 * Math.PI) / PUNCH_LEGS;
  // the legs are at −90° + k·pitch, the grooves half a pitch from them (ventGrooves)
  const offset = (fit.ear.reach + pitch / 2) / 2;
  const angles = Array.from({ length: PUNCH_LEGS }, (_, i) => -Math.PI / 2 + offset + i * pitch);
  const outer = fit.outer.map(({ r, z }) => ({ r: r * grow, z: z * grow }));
  const sink = (options.shellMm * grow) / 2;
  /** the outer surface of the mold at height z: the widest of the segments of the silhouette that hold it */
  const wallAt = (z: number): number => {
    let r = outer[0].r;
    for (let j = 1; j < outer.length; j++) {
      const a = outer[j - 1];
      const b = outer[j];
      if (z < a.z || z > b.z) continue;
      r = b.z > a.z ? a.r + ((b.r - a.r) * (z - a.z)) / (b.z - a.z) : Math.max(a.r, b.r);
    }
    return r;
  };
  const inner = (z: number): number => wallAt(z) - sink;

  const petalZ = punchLayout(source, options, fit).flangeZ * grow;
  const seatZ = petalZ - PAD_GAP_MM;
  const shelfZ = fit.ear.topZ * grow;
  const seatInMm = Math.max(fit.ear.seatInMm * grow, wallAt(shelfZ) + 1);
  let below = 0;
  for (const ring of outer) if (ring.z <= seatZ) below = Math.max(below, ring.r);
  // the stop outside the clay; a screw turned in from below passes the mold's wall with its head
  const axisMm = Math.max(seatInMm + PAD.d / 2, below + SCREW.headD / 2 + 1);
  const outerMm = axisMm + PAD.d / 2;
  const halfAngle = Math.asin(Math.min(1, (PAD.d / 2 + 1) / axisMm));
  const faceZ = seatZ - LUG_THREAD_MM;

  // The chamfer r = outerMm − (faceZ − z) goes down and in until it meets the
  // sunk wall; on a low mold it may reach the table first.
  const chamfer = (z: number): number => outerMm - (faceZ - z);
  const top = Math.min(faceZ, shelfZ);
  const levels = [top, ...outer.map((ring) => ring.z).filter((z) => z < top)].toSorted((a, b) => b - a);
  let meetZ = levels[levels.length - 1];
  for (let i = 1; i < levels.length; i++) {
    const hi = levels[i - 1];
    const lo = levels[i];
    const fLo = chamfer(lo) - inner(lo);
    if (fLo > 0) continue;
    const fHi = chamfer(hi) - inner(hi);
    meetZ = fHi > fLo ? hi - ((hi - lo) * fHi) / (fHi - fLo) : lo;
    break;
  }
  const bottom =
    chamfer(meetZ) - inner(meetZ) > 1e-6
      ? [
          { r: inner(meetZ), z: meetZ },
          { r: chamfer(meetZ), z: meetZ },
        ]
      : [{ r: inner(meetZ), z: meetZ }];
  // The sunk wall, thinned to within half the sink: still inside the
  // material, and a few long faces instead of one per row of the shell —
  // hundreds of thin strips along a dense wall made the export's union
  // several times slower (plans/PLAN-SCREWS.md, M3).
  const wall = simplify(
    [
      { r: inner(shelfZ), z: shelfZ },
      ...outer
        .filter((ring) => ring.z > meetZ + 1e-6 && ring.z < shelfZ - 1e-6)
        .map((ring) => ({ r: ring.r - sink, z: ring.z }))
        .toReversed(),
      { r: inner(meetZ), z: meetZ },
    ],
    sink / 2,
  ).slice(1, -1);
  const profile = [
    ...bottom,
    { r: outerMm, z: faceZ },
    { r: outerMm, z: seatZ },
    { r: seatInMm, z: seatZ },
    { r: seatInMm, z: shelfZ },
    { r: inner(shelfZ), z: shelfZ },
    ...wall,
  ].filter((p, i, all) => i === 0 || Math.hypot(p.r - all[i - 1].r, p.z - all[i - 1].z) > 1e-6);
  return { angles, halfAngle, axisMm, outerMm, seatInMm, shelfZ, seatZ, faceZ, petalZ, profile };
}

/** Douglas–Peucker: the polyline with no point farther than `tolerance` from it dropped; the ends stay. */
function simplify(points: readonly RZ[], tolerance: number): RZ[] {
  if (points.length < 3) return [...points];
  const a = points[0];
  const b = points[points.length - 1];
  const dr = b.r - a.r;
  const dz = b.z - a.z;
  const length = Math.hypot(dr, dz) || 1;
  let worst = -1;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs((points[i].r - a.r) * dz - (points[i].z - a.z) * dr) / length;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolerance) return [a, b];
  return [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
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
    out.push({ r: raw.r, z });
  }
  return out;
}

type RZ = { r: number; z: number };

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
 * never touches the axis, the body is a torus. Printed flange down; grown by
 * the shrinkage, as the mold is.
 */
export function buildPunch(source: PressSource, options: PressOptions, fit: SlumpFit): SurfaceMesh {
  const { heightMm, radiusAt } = source;
  const { nu } = source.grid;
  const { shellMm, shrinkPct, roundPct } = options;
  const layout = punchLayout(source, options, fit);
  const { slabMm, lipInMm, lipZ, flangeMm, flangeZ, legReach: reach } = layout;
  const { ear } = fit;
  const flangeTop = flangeZ + layout.flangeT;
  const vent = fit.ventMm / 2;

  // The working surface in the piece's frame, without a cap at the rim: for
  // a flared rim its end is above the mold's rim, and an arc goes from there round the rim.
  const work = offsetSamples(radiusAt, heightMm, slabMm, slabMm, Infinity);
  const lift = (p: { r: number; z: number }): { r: number; z: number } => ({ r: p.r, z: p.z + shellMm });
  const wall = [{ r: work.floorR, z: slabMm }, ...work.samples].map(lift);
  const floorZ = shellMm + slabMm;
  const surface = roundBottom(wall, floorZ, roundPct / 100, vent);

  // An arc of the slab's radius round the mold's rim: an honest offset of the
  // wall–rim corner, the clay in the corner as thick as everywhere.
  const top = surface[surface.length - 1];
  const from = Math.atan2(top.z - fit.rimZ, top.r - fit.rimMm);
  const arc: { r: number; z: number }[] = [];
  const to = Math.PI / 2;
  for (let k = 1; k <= PUNCH_ARC_STEPS; k++) {
    const a = from + ((to - from) * k) / PUNCH_ARC_STEPS;
    arc.push({ r: fit.rimMm + slabMm * Math.cos(a), z: fit.rimZ + slabMm * Math.sin(a) });
  }
  arc[arc.length - 1] = { r: fit.rimMm, z: flangeZ };

  // The inner shell — the working surface moved by one more shell up to the
  // rim; above it a vertical up to the flange's top.
  const inner = fromVent(offsetPolyline(surface, shellMm, floorZ + shellMm, fit.rimZ), vent);
  const shellTop = inner[inner.length - 1];

  // The flange and the legs. In the legs' sectors the points of the flange's
  // underside go down: the sole onto the top of the ear (the same line as
  // its top — a plane contact), the lip lower, along the ear's outer face.
  // Between the legs the same points squeeze towards the mold's rim: there
  // the flange only presses the clay on the top, and a wide ring would be
  // plastic for nothing.
  const narrowMm = Math.min(fit.topOuterMm + FLANGE_OVER_RIM_MM, ear.seatInMm - PUNCH_STEP_MM);
  // With screws the flange stays wide over the lugs too, flat, out to their
  // outer radius: the petals (before the shrinkage, as the rest is here).
  const petals = options.screws ? screwLayout(source, options, fit) : null;
  const petalReach = petals ? petals.halfAngle + (2 * Math.PI) / nu : -1;
  const petalMm = petals ? petals.outerMm / (1 + shrinkPct / 100) : 0;
  const flangePoint = (r: number, z: number, k: number, drop: number): LathePoint => ({
    r,
    z,
    offset: (u) => {
      if (legDistance(u) <= reach) return { dr: 0, dz: -drop };
      if (petals && lugDistance(u, petals.angles) <= petalReach) return { dr: k === 4 ? petalMm - r : 0, dz: 0 };
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
  return mirrorZ(scaleMesh(mesh, 1 + shrinkPct / 100));
}
