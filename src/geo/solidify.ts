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
// The lid is the opening as it is a little below the top, grown by a hair so
// it overlaps the wall instead of touching it (coincident surfaces are the
// worst input for a boolean operation). It works when the top opening is
// the only one. A teapot printed hollow has a second one at the tip of the
// spout, the inside stays connected to the outside, and the model is
// reported as open: such a model has to come solid.

import type { CrossSection, Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from './csg';

export type SolidStatus = 'solid' | 'filled' | 'open';

export interface Solidified {
  solid: Manifold;
  /** solid as it came, filled here, or open: the fill did not close the inside */
  status: SolidStatus;
  /** the rim of the opening that was filled: the mouth of the piece */
  rim?: { zMm: number; radiusMm: number };
}

/** How far below the crest of the rim the opening is measured, mm. */
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

export function solidify(csg: CsgApi, scope: CsgScope, model: Manifold): Solidified {
  const closed = dropVoids(csg, scope, model);
  const status: SolidStatus = closed === model ? 'solid' : 'filled';
  const top = topOpening(csg, scope, closed);
  if (!top) return { solid: closed, status };
  const capped = scope.keep(csg.Manifold.union([closed, top.lid]));
  const filled = dropVoids(csg, scope, capped);
  if (filled === capped) return { solid: closed, status: 'open', rim: top.rim };
  return { solid: filled, status: 'filled', rim: top.rim };
}

interface Opening {
  /** a thin slab across the opening, overlapping the wall */
  lid: Manifold;
  rim: { zMm: number; radiusMm: number };
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
function aroundAxis(polygons: Polygon[]): Polygon[] {
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
