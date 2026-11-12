// Plaster blocks of the working mold.
//
// A block is a box of plaster minus the cavity: the piece grown by the
// shrinkage plus the pouring collar over the rim. The block is then split by
// the scheme the analyzer chose, and hemispherical keys are set on the
// parting planes: bumps on one part, matching dimples on the other.

import type { Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from 'maker-kit/csg/manifold';
import { dropVoids } from '../solidify';
import type { MoldScheme } from './analyze';
import type { MoldState } from './state';

export interface BlockPart {
  /** the name is in the interface's dictionary (`part.<id>`) */
  id: string;
  solid: Manifold;
  /**
   * The direction this part leaves the piece in. The pour box lays the block
   * by it, working surface up.
   */
  pull: 'up' | '+y' | '-y' | 'down';
}

/** How far the collar and the punch-through go past the block, so the cut is clean. */
const BREAKTHROUGH_MM = 2;
/**
 * Gap between the plug's flange and its socket in the halves. Needed both
 * physically (the plug is taken out of the plaster) and for the boolean
 * operation: coincident cylinders are its worst input.
 */
const PLUG_GAP_MM = 0.5;
/** A plug flange thinner than this breaks in the hands. */
const PLUG_FLANGE_MIN_MM = 8;
/** How much wider than the rim the flange is — a rest, so the plug does not fall into the mouth. */
const PLUG_FLANGE_OVER_MM = 10;
/** A plug ring narrower than this cannot be cast: the plaster crumbles. */
const PLUG_RING_MIN_MM = 1;
/** The flange comes no closer than this to the outer face of the block. */
const PLUG_EDGE_MM = 3;
/** Segments per turn of the tooling's bodies of revolution. */
const SEGMENTS = 96;

/**
 * The mouth plug — a separate part of the mold for a recessed lid. Its ring
 * goes into the mouth down to the ledge, its flange sits in a socket of the
 * halves, the through hole is the pouring gate. The plaster of the halves
 * cannot reach into the mouth, but the plug can and leaves upwards: only so
 * is the ledge cast.
 */
export interface PlugInfo {
  /** the plug with its key bumps */
  solid: Manifold;
  /** dimples for its keys — subtracted from the block */
  keys: Manifold | null;
  /** radius of the socket in the halves (flange plus gap) */
  socketMm: number;
}

export interface CavityInfo {
  solid: Manifold;
  /** the mouth plug, if there is one; the gate is in it then */
  plug?: PlugInfo;
  /** top of the cavity with the collar (without the punch-through) */
  topZ: number;
  /** the largest radius of the cavity */
  maxRadius: number;
  /** bottom of the cavity */
  bottomZ: number;
}

/**
 * The mouth of the piece: where the rim is and its gate radius, in mm BEFORE
 * shrinkage. The pouring collar stands on it.
 */
export interface Mouth {
  zMm: number;
  /** radius of the gate */
  radiusMm: number;
  /** a recessed lid: a plug replaces the collar (see PlugInfo) */
  plug?: PlugSpec;
}

/** What the plug needs to know about the mouth, in mm BEFORE shrinkage. */
export interface PlugSpec {
  /** how far the ledge is below the rim — the ring goes down to it */
  recessMm: number;
  /** radius of the cavity over the ledge: the outer wall of the ring follows it */
  galleryMm: number;
  /** outer radius of the rim: the flange is wider */
  rimMm: number;
}

/**
 * The cavity of the mold: the piece grown by the shrinkage plus the pouring
 * collar.
 *
 * Only a split mold needs a collar of some height: a one-part mold is poured
 * straight into the open bowl. A punch-through over the collar takes the
 * cavity out through the block's top face — without it the cut would fall on
 * coincident planes, the worst input for a boolean operation.
 *
 * The collar can close small pockets at the top of the piece (a rounded rim
 * of a filled hollow model) into voids; a void inside the cavity is just
 * more cavity, so voids are dropped.
 */
export function buildCavity(
  csg: CsgApi,
  scope: CsgScope,
  vessel: Manifold,
  scheme: MoldScheme,
  mold: MoldState,
  mouth?: Mouth,
): CavityInfo {
  const shrink = 1 + mold.shrinkPct / 100;
  const scaled = scope.keep(vessel.scale(shrink));
  const box = scaled.boundingBox();
  const maxRadius = Math.max(Math.abs(box.min[0]), Math.abs(box.max[0]), Math.abs(box.min[1]), Math.abs(box.max[1]));
  const spareMm = scheme === 'dropout' ? 0 : mold.spareMm;

  // Without a hint the mouth is the very top of the mesh: for a body of
  // revolution that is exactly the rim.
  const rimZ = Math.min(mouth ? mouth.zMm * shrink : box.max[2], box.max[2]);
  const rimRadius = mouth ? mouth.radiusMm * shrink : topRadius(scaled, box.max[2]);
  const plugSpec = mouth?.plug ? plugGeometry(mouth.plug, rimRadius, shrink, maxRadius, mold) : null;

  // the block must cover the whole piece — a spout tip above the rim too;
  // with a plug the flange must also be no thinner than its minimum
  const topZ = plugSpec ? Math.max(box.max[2] + spareMm, rimZ + PLUG_FLANGE_MIN_MM) : box.max[2] + spareMm;

  if (plugSpec) {
    // A socket instead of the collar: a cylinder from the rim up and through.
    // The halves have no gate any more — it lives in the plug.
    const socketMm = plugSpec.flangeMm + PLUG_GAP_MM;
    const socket = scope.keep(
      csg.Manifold.cylinder(topZ + BREAKTHROUGH_MM - rimZ, socketMm, socketMm, SEGMENTS, false).translate([0, 0, rimZ]),
    );
    return {
      solid: dropVoids(csg, scope, scope.keep(csg.Manifold.union([scaled, socket]))),
      plug: buildPlug(csg, scope, plugSpec, rimZ, topZ, mold.keyMm, socketMm),
      topZ,
      maxRadius,
      bottomZ: box.min[2],
    };
  }

  // a cylinder from the rim up: the collar plus the way out through the block's face
  const collarBottom = rimZ - 1;
  const collar = scope.keep(
    csg.Manifold.cylinder(topZ + BREAKTHROUGH_MM - collarBottom, rimRadius, rimRadius, SEGMENTS, false).translate([0, 0, collarBottom]),
  );
  return {
    solid: dropVoids(csg, scope, scope.keep(csg.Manifold.union([scaled, collar]))),
    topZ,
    maxRadius,
    bottomZ: box.min[2],
  };
}

/** The plug in the mold's frame (after shrinkage). */
interface PlugGeometry {
  /** radius of the gate */
  holeMm: number;
  /** outer radius of the ring */
  galleryMm: number;
  /** bottom of the ring — the ledge */
  ringBottomMm: number;
  /** outer radius of the rim */
  rimMm: number;
  /** outer radius of the flange */
  flangeMm: number;
}

/**
 * Sizes of the plug after shrinkage. null — no plug can be made: the ring
 * comes out thinner than the minimum (the gallery nearly met the gate) or
 * the flange has nowhere to lie inside the block. The mold then stays as it
 * was, with a collar.
 */
function plugGeometry(spec: PlugSpec, holeMm: number, shrink: number, maxRadius: number, mold: MoldState): PlugGeometry | null {
  if (spec.recessMm <= 0) return null;
  const galleryMm = spec.galleryMm * shrink;
  const rimMm = spec.rimMm * shrink;
  if (galleryMm - holeMm < PLUG_RING_MIN_MM || rimMm <= galleryMm) return null;
  const edge = maxRadius + mold.plasterMm - PLUG_EDGE_MM - PLUG_GAP_MM;
  const flangeMm = Math.min(rimMm + Math.max(PLUG_FLANGE_OVER_MM, 3 * mold.keyMm), edge);
  if (flangeMm <= rimMm + 1) return null;
  return { holeMm, galleryMm, ringBottomMm: spec.recessMm * shrink, rimMm, flangeMm };
}

/**
 * The plug is a body of revolution with a hole: in the axial section
 *
 *     ring    r ∈ [hole, gallery]   z ∈ [rimZ − recess, rimZ]
 *     flange  r ∈ [hole, flange]    z ∈ [rimZ, topZ]
 *
 * The keys are hemispheres on the flange's underside, a pair per half and
 * none on the seam y = 0: bumps on the plug, dimples in the halves.
 */
function buildPlug(
  csg: CsgApi,
  scope: CsgScope,
  plug: PlugGeometry,
  rimZ: number,
  topZ: number,
  keyMm: number,
  socketMm: number,
): PlugInfo {
  const low = rimZ - plug.ringBottomMm;
  const body = scope.keep(
    csg.Manifold.revolve(
      [
        [
          [plug.holeMm, low],
          [plug.galleryMm, low],
          [plug.galleryMm, rimZ],
          [plug.flangeMm, rimZ],
          [plug.flangeMm, topZ],
          [plug.holeMm, topZ],
        ],
      ],
      SEGMENTS,
    ),
  );
  // keys are measured from the flange, not from the socket: the socket is the flange plus the gap
  const keyRadius = Math.min(keyMm, (plug.flangeMm - plug.rimMm) / 2 - 0.5);
  const ring = (plug.rimMm + plug.flangeMm) / 2;
  const keys = sphereKeys(
    csg,
    scope,
    keyRadius,
    [45, 135, 225, 315].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return [ring * Math.cos(a), ring * Math.sin(a), rimZ];
    }),
  );
  return {
    solid: keys ? scope.keep(csg.Manifold.union([body, keys])) : body,
    keys,
    socketMm,
  };
}

/** Radius of the piece at the very rim — the collar is made by it. */
function topRadius(solid: Manifold, topZ: number): number {
  const mesh = solid.getMesh();
  const { numProp, vertProperties } = mesh;
  const count = vertProperties.length / numProp;
  const band = 2;
  let radius = 0;
  for (let v = 0; v < count; v++) {
    const z = vertProperties[v * numProp + 2];
    if (z < topZ - band) continue;
    const r = Math.hypot(vertProperties[v * numProp], vertProperties[v * numProp + 1]);
    if (r > radius) radius = r;
  }
  return Math.max(radius, 1);
}

/** Parts of the plaster mold in their assembled position. */
export function buildBlockParts(csg: CsgApi, scope: CsgScope, cavity: CavityInfo, scheme: MoldScheme, mold: MoldState): BlockPart[] {
  const half = cavity.maxRadius + mold.plasterMm;
  const bottom = cavity.bottomZ - mold.plasterMm;
  const height = cavity.topZ - bottom;
  const box = scope.keep(csg.Manifold.cube([half * 2, half * 2, height], true).translate([0, 0, bottom + height / 2]));
  const hollowed = scope.keep(box.subtract(cavity.solid));
  const block = cavity.plug?.keys ? scope.keep(hollowed.subtract(cavity.plug.keys)) : hollowed;
  // The plug comes off first and upwards; the piece leaves it downwards —
  // that is how the pour box lays it: ring up.
  const plugParts: BlockPart[] = cavity.plug ? [{ id: 'plug', solid: cavity.plug.solid, pull: 'down' }] : [];

  if (scheme === 'dropout') {
    return [{ id: 'single', solid: block, pull: 'up' }, ...plugParts];
  }

  let upper = block;
  let upperBottom = bottom;
  const parts: BlockPart[] = [];

  if (scheme === 'halves-bottom') {
    // a horizontal cut at the level of the piece's bottom: below it a separate plate
    const cut = splitAt(scope, block, [0, 0, 1], cavity.bottomZ);
    const inset = half * 0.72;
    const keys = sphereKeys(csg, scope, mold.keyMm, [
      [inset, inset, cavity.bottomZ],
      [-inset, inset, cavity.bottomZ],
      [inset, -inset, cavity.bottomZ],
      [-inset, -inset, cavity.bottomZ],
    ]);
    parts.push({
      id: 'bottom',
      solid: keys ? scope.keep(csg.Manifold.union([cut.negative, keys])) : cut.negative,
      pull: 'up',
    });
    upper = keys ? scope.keep(cut.positive.subtract(keys)) : cut.positive;
    upperBottom = cavity.bottomZ;
  }

  const split = splitAt(scope, upper, [0, 1, 0], 0);
  const margin = Math.max(mold.keyMm * 3, mold.plasterMm * 0.5);
  const inset = half * 0.78;
  // The upper keys of the seam must not fall into the plug's socket: they go
  // between the socket and the block's edge, and without room there only the
  // lower ones stay.
  const topInset = cavity.plug ? (cavity.plug.socketMm + half) / 2 : inset;
  const topFits = !cavity.plug || half - cavity.plug.socketMm > 2 * mold.keyMm + 2;
  const keys = sphereKeys(csg, scope, mold.keyMm, [
    [inset, 0, upperBottom + margin],
    [-inset, 0, upperBottom + margin],
    ...(topFits
      ? ([
          [topInset, 0, cavity.topZ - margin],
          [-topInset, 0, cavity.topZ - margin],
        ] satisfies [number, number, number][])
      : []),
  ]);

  parts.unshift(
    {
      id: 'half-A',
      solid: keys ? scope.keep(split.positive.subtract(keys)) : split.positive,
      pull: '+y',
    },
    {
      id: 'half-B',
      solid: keys ? scope.keep(csg.Manifold.union([split.negative, keys])) : split.negative,
      pull: '-y',
    },
  );
  return [...parts, ...plugParts];
}

/**
 * Hemispheres sitting exactly on a parting plane. One part gets them added,
 * the other subtracted — the bump and the dimple are the same surface and
 * match exactly, without fitting tolerances. null means "no keys": the
 * caller skips both operations.
 */
function sphereKeys(csg: CsgApi, scope: CsgScope, radiusMm: number, centres: [number, number, number][]): Manifold | null {
  if (radiusMm <= 0 || centres.length === 0) return null;
  return scope.keep(csg.Manifold.union(centres.map((c) => scope.keep(csg.Manifold.sphere(radiusMm, 32).translate(c)))));
}

/**
 * A split by a plane with an explicit answer which half is which: the order
 * in which splitByPlane returns the pieces is a detail of the library, and we
 * need to know the side for sure.
 */
export function splitAt(
  scope: CsgScope,
  solid: Manifold,
  normal: [number, number, number],
  offset: number,
): { positive: Manifold; negative: Manifold } {
  const [first, second] = solid.splitByPlane(normal, offset);
  scope.keep(first);
  scope.keep(second);
  const axis = normal[0] !== 0 ? 0 : normal[1] !== 0 ? 1 : 2;
  const sign = normal[axis] > 0 ? 1 : -1;
  const box = first.boundingBox();
  const centre = ((box.min[axis] + box.max[axis]) / 2) * sign;
  return centre > offset * sign ? { positive: first, negative: second } : { positive: second, negative: first };
}
