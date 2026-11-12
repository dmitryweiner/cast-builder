// A hollow model made solid.
//
// The plaster sees only the outside of the piece: the slip itself makes the
// inside when the mold is drained. So the tooling wants a SOLID master,
// while an STL printed as a vessel is hollow and open at the top. Filling it
// is a trick with one boolean operation: a thin lid across the opening,
// fused with the walls, turns the inside into a closed void — and a closed
// void is a separate shell of negative volume, which `decompose` hands out
// on its own and we simply drop.
//
// The lid is the opening as it is a little below the rim, grown by a hair so
// it overlaps the wall instead of touching it (coincident surfaces are the
// worst input for a boolean operation). The top opening is the one around
// the axis. A teapot printed hollow has a second one at the tip of the
// spout; that one is a planar cut, and every planar cut with a hole gets a
// lid of its own. With all openings capped the cavity and the channel of the
// spout are one closed void — as the master must be: the slip makes the
// inside of the spout, and the hole through the wall is cut leather-hard.
// An opening that is not a planar cut leaves the model open: such a model
// has to come solid.

import type { CrossSection, Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from 'maker-kit/csg/manifold';

export type SolidStatus = 'solid' | 'filled' | 'open' | 'openBottom';

export interface Solidified {
  solid: Manifold;
  /**
   * solid as it came, filled here, open: the fill did not close the inside,
   * or open at the bottom and closed at the top — a lid as it is printed,
   * which has to be turned over; the last two are left as they came
   */
  status: SolidStatus;
  /** the rim of the opening that was filled: the mouth of the piece */
  rim?: Rim;
}

export interface Rim {
  /** the crest of the rim */
  zMm: number;
  /** the outer radius of the rim */
  radiusMm: number;
}

/** How far below the crest of the rim (or a planar cut) the lid stands, mm. */
const PROBE_MM = 0.3;
/** How far below the crest the outer radius of the rim is measured as well, mm. */
const RIM_BAND_MM = 2;
/** How far the lid reaches into the wall, mm: overlap, not contact. */
const OVERLAP_MM = 0.3;
/** Thickness of the lid, mm. */
const LID_MM = 1;
/** An opening smaller than this, mm², is noise of the slice. */
const MIN_HOLE_MM2 = 1;
/** The top opening is looked for in this upper share of the height... */
const UPPER_SHARE = 0.5;
/** ...by slices this share of the height apart... */
const SCAN_STEP = 1 / 64;
/** ...and then its crest is narrowed down to this, mm. */
const CREST_MM = 0.01;
/** Faces of one plane: all their corners this close to it, mm. */
const PLANE_MM = 0.01;
/** A planar cut looking down more steeply than this (z of its normal) is not an opening. */
const DOWN_Z = -0.5;

export function solidify(csg: CsgApi, scope: CsgScope, model: Manifold): Solidified {
  const closed = dropVoids(csg, scope, model);
  const status: SolidStatus = closed === model ? 'solid' : 'filled';
  const top = topOpening(csg, scope, closed);
  if (!top) return { solid: closed, status: openAtBottom(csg, scope, closed) ? 'openBottom' : status };
  let capped = scope.keep(csg.Manifold.union([closed, top.lid]));
  let filled = dropVoids(csg, scope, capped);
  if (filled === capped) {
    // more openings: a spout's tip, for one
    const lids = planarOpenings(csg, scope, closed, top.lid);
    if (lids.length > 0) {
      capped = scope.keep(csg.Manifold.union([capped, ...lids]));
      filled = dropVoids(csg, scope, capped);
    }
  }
  if (filled === capped) return { solid: closed, status: 'open', rim: top.rim };
  return { solid: filled, status: 'filled', rim: top.rim };
}

/**
 * Whether the model is hollow and open at the bottom, like a lid as it is
 * printed: the bottom's opening, capped, closes more void than there is
 * material. A recess under a solid foot closes far less.
 */
function openAtBottom(csg: CsgApi, scope: CsgScope, solid: Manifold): boolean {
  const mirrored = scope.keep(solid.mirror([0, 0, 1]));
  const bottom = topOpening(csg, scope, mirrored);
  if (!bottom) return false;
  const filled = dropVoids(csg, scope, scope.keep(csg.Manifold.union([mirrored, bottom.lid])));
  return filled.volume() > 2 * solid.volume();
}

interface Opening {
  /** a thin slab across the opening, overlapping the wall */
  lid: Manifold;
  rim: Rim;
}

/**
 * The opening at the top: the highest slice with a hole around the axis.
 * Not simply the top of the mesh — the tip of a teapot's spout is higher
 * than its rim, and its hole is off the axis. The scan goes down from the
 * top, then the crest of the rim is narrowed down between the last slice
 * without the hole and the first one with it.
 */
function topOpening(csg: CsgApi, scope: CsgScope, solid: Manifold): Opening | null {
  const box = solid.boundingBox();
  const height = box.max[2] - box.min[2];
  const probe = Math.min(PROBE_MM, height / 4);
  const step = height * SCAN_STEP;
  let hit = Number.NaN;
  for (let z = box.max[2] - probe; z > box.max[2] - height * UPPER_SHARE; z -= step) {
    if (axisHole(csg, scope, solid, z)) {
      hit = z;
      break;
    }
  }
  if (Number.isNaN(hit)) return null;
  let lo = hit;
  let hi = Math.min(hit + step, box.max[2]);
  while (hi - lo > CREST_MM) {
    const mid = (lo + hi) / 2;
    if (axisHole(csg, scope, solid, mid)) lo = mid;
    else hi = mid;
  }
  const crest = hi;
  const probeZ = crest - probe;
  const at = axisHole(csg, scope, solid, probeZ);
  if (!at) return null;
  const lid = scope.keep(
    scope.keep(scope.keep(at.holes.offset(OVERLAP_MM, 'Round')).extrude(LID_MM)).translate([0, 0, probeZ + probe / 2 - LID_MM]),
  );
  // a rounded rim is narrower at the very top: its outer radius is measured lower too
  const lower = aroundAxis(scope.keep(solid.slice(crest - Math.min(RIM_BAND_MM, height / 4))).toPolygons());
  return { lid, rim: { zMm: crest, radiusMm: Math.max(maxRadius(at.outer), maxRadius(lower)) } };
}

/**
 * The slice at `z` when it has a hole around the axis: the outlines around
 * the axis and every hole inside them. The axis is where `placeModel` put
 * the middle of the foot, and the mouth of a vessel is over its foot.
 */
function axisHole(csg: CsgApi, scope: CsgScope, solid: Manifold, z: number): { outer: Polygon[]; holes: CrossSection } | null {
  const slice = scope.keep(solid.slice(z));
  const outer = aroundAxis(slice.toPolygons());
  if (outer.length === 0) return null;
  const holes = scope.keep(scope.keep(new csg.CrossSection(outer, 'Positive')).subtract(slice));
  if (holes.area() < MIN_HOLE_MM2 || winding(holes.toPolygons(), 0, 0) === 0) return null;
  return { outer, holes };
}

/**
 * Lids for the planar cuts: a planar patch of faces whose outline has a hole
 * is a tube cut off by a plane — clayform's spout tip. Each hole gets a lid
 * like the top one: grown into the wall, sunk a hair under the plane.
 *
 * A patch looking down is left alone: the bottom of a foot ring is an
 * annulus too, but the recess in it is the outside of the piece. A flat
 * rim is a planar annulus as well, but its opening has the top lid already:
 * a lid that meets the top one is left out, as two lids a hair apart would
 * leave slivers. Lids that fall inside the cavity (the ledge of a lid seat)
 * do no harm: what they close off is cavity as well and is dropped with it.
 */
function planarOpenings(csg: CsgApi, scope: CsgScope, solid: Manifold, topLid: Manifold): Manifold[] {
  const lids: Manifold[] = [];
  for (const patch of planarPatches(solid)) {
    const [nx, ny, nz] = patch.normal;
    if (nz < DOWN_Z || patch.triangles.length < 3) continue;
    // a frame in the plane: u × v = n, so the faces stay counter-clockwise
    const a = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = normalize([a[1] * nz - a[2] * ny, a[2] * nx - a[0] * nz, a[0] * ny - a[1] * nx]);
    const v = [ny * u[2] - nz * u[1], nz * u[0] - nx * u[2], nx * u[1] - ny * u[0]];
    const flat = patch.triangles.map((triangle) =>
      triangle.map(([x, y, z]): [number, number] => [x * u[0] + y * u[1] + z * u[2], x * v[0] + y * v[1] + z * v[2]]),
    );
    const region = scope.keep(new csg.CrossSection(flat, 'Positive'));
    const outer = region.toPolygons().filter((polygon) => signedArea(polygon) > 0);
    const holes = scope.keep(scope.keep(new csg.CrossSection(outer, 'Positive')).subtract(region));
    if (holes.area() < MIN_HOLE_MM2) continue;
    const slab = scope.keep(
      scope.keep(scope.keep(holes.offset(OVERLAP_MM, 'Round')).extrude(LID_MM)).translate([0, 0, -PROBE_MM / 2 - LID_MM]),
    );
    const d = patch.offset;
    // column-major: the frame's axes, then its origin on the plane
    const lid = scope.keep(slab.transform([u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, nx, ny, nz, 0, nx * d, ny * d, nz * d, 1]));
    if (scope.keep(lid.intersect(topLid)).isEmpty()) lids.push(lid);
  }
  return lids;
}

type Point = [number, number, number];

interface Patch {
  /** unit normal of the plane */
  normal: Point;
  /** the plane is normal · p = offset */
  offset: number;
  triangles: [Point, Point, Point][];
}

/**
 * The faces of the solid grouped into planar patches: neighbours across an
 * edge whose corners all lie on the seed's plane. Corners, not normals: the
 * cut of a boolean operation leaves slivers, and the normal of a sliver in
 * float32 can be degrees off. Compared with the seed, not with the
 * neighbour, so a fine curved surface does not creep into a patch; the
 * largest faces seed first, as their normals are the surest.
 */
function planarPatches(solid: Manifold): Patch[] {
  const { numProp, vertProperties, triVerts } = solid.getMesh();
  const count = triVerts.length / 3;
  const vertices = vertProperties.length / numProp;
  const point = (v: number): Point => [vertProperties[v * numProp], vertProperties[v * numProp + 1], vertProperties[v * numProp + 2]];
  const corners = (t: number): [Point, Point, Point] => [point(triVerts[t * 3]), point(triVerts[t * 3 + 1]), point(triVerts[t * 3 + 2])];
  const normals: Point[] = [];
  const areas = new Float64Array(count);
  const across = new Map<number, number>();
  for (let t = 0; t < count; t++) {
    const [a, b, c] = corners(t);
    const n = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    areas[t] = Math.hypot(n[0], n[1], n[2]);
    normals.push(normalize(n));
    for (let k = 0; k < 3; k++) across.set(triVerts[t * 3 + k] * vertices + triVerts[t * 3 + ((k + 1) % 3)], t);
  }

  const order = Array.from({ length: count }, (_, t) => t).toSorted((a, b) => areas[b] - areas[a]);
  const seen = new Uint8Array(count);
  const patches: Patch[] = [];
  for (const seed of order) {
    if (seen[seed] || areas[seed] === 0) continue;
    seen[seed] = 1;
    const normal = normals[seed];
    const [corner] = corners(seed);
    const offset = normal[0] * corner[0] + normal[1] * corner[1] + normal[2] * corner[2];
    const onPlane = (v: number): boolean =>
      Math.abs(
        normal[0] * vertProperties[v * numProp] +
          normal[1] * vertProperties[v * numProp + 1] +
          normal[2] * vertProperties[v * numProp + 2] -
          offset,
      ) <= PLANE_MM;
    const members = [seed];
    for (let i = 0; i < members.length; i++) {
      const t = members[i];
      for (let k = 0; k < 3; k++) {
        // the neighbour has the same edge the other way round
        const next = across.get(triVerts[t * 3 + ((k + 1) % 3)] * vertices + triVerts[t * 3 + k]);
        if (next === undefined || seen[next]) continue;
        if (!onPlane(triVerts[next * 3]) || !onPlane(triVerts[next * 3 + 1]) || !onPlane(triVerts[next * 3 + 2])) continue;
        seen[next] = 1;
        members.push(next);
      }
    }
    if (members.length >= 3) patches.push({ normal, offset, triangles: members.map(corners) });
  }
  return patches;
}

function normalize([x, y, z]: readonly number[]): Point {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/**
 * The solid without its closed voids: the union of its shells of positive
 * volume. Returns the same object when there were none.
 */
export function dropVoids(csg: CsgApi, scope: CsgScope, solid: Manifold): Manifold {
  const shells = solid.decompose().map((shell) => scope.keep(shell));
  const kept = shells.filter((shell) => shell.volume() > 0);
  if (kept.length === shells.length) return solid;
  return scope.keep(csg.Manifold.union(kept));
}

type Polygon = readonly (readonly [number, number])[];

function signedArea(polygon: Polygon): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

/** The outer outlines that go round the axis. */
function aroundAxis<P extends Polygon>(polygons: P[]): P[] {
  return polygons.filter((polygon) => signedArea(polygon) > 0 && winding([polygon], 0, 0) !== 0);
}

/** How many times the outlines go round the point, counter-clockwise positive. */
function winding(polygons: readonly Polygon[], x: number, y: number): number {
  let turns = 0;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % polygon.length];
      const side = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
      if (y1 <= y && y2 > y && side > 0) turns++;
      else if (y1 > y && y2 <= y && side < 0) turns--;
    }
  }
  return turns;
}

function maxRadius(polygons: readonly Polygon[]): number {
  let radius = 0;
  for (const polygon of polygons) for (const [x, y] of polygon) radius = Math.max(radius, Math.hypot(x, y));
  return radius;
}
