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

import type { Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from './csg';

export type SolidStatus = 'solid' | 'filled' | 'open';

export interface Solidified {
  solid: Manifold;
  /** solid as it came, filled here, or open: the fill did not close the inside */
  status: SolidStatus;
  /** the rim of the opening that was filled: the mouth of the piece */
  rim?: { zMm: number; radiusMm: number };
}

/** How far below the top the opening is measured, mm. */
const PROBE_MM = 0.3;
/** How far below the top the outer radius of the rim is measured as well, mm. */
const RIM_BAND_MM = 2;
/** How far the lid reaches into the wall, mm: overlap, not contact. */
const OVERLAP_MM = 0.3;
/** Thickness of the lid, mm. */
const LID_MM = 1;
/** An opening smaller than this, mm², is noise of the slice. */
const MIN_HOLE_MM2 = 1;

export function solidify(csg: CsgApi, scope: CsgScope, model: Manifold): Solidified {
  const closed = dropVoids(csg, scope, model);
  const status: SolidStatus = closed === model ? 'solid' : 'filled';
  const box = closed.boundingBox();
  const probeZ = box.max[2] - Math.min(PROBE_MM, (box.max[2] - box.min[2]) / 4);
  const slice = scope.keep(closed.slice(probeZ));
  const polygons = slice.toPolygons();
  const outer = polygons.filter((polygon) => signedArea(polygon) > 0);
  if (outer.length === 0) return { solid: closed, status };
  const filledSlice = scope.keep(new csg.CrossSection(outer, 'Positive'));
  const holes = scope.keep(filledSlice.subtract(slice));
  if (holes.area() < MIN_HOLE_MM2) return { solid: closed, status };

  const lid = scope.keep(
    scope.keep(scope.keep(holes.offset(OVERLAP_MM, 'Round')).extrude(LID_MM)).translate([0, 0, probeZ + PROBE_MM / 2 - LID_MM]),
  );
  const capped = scope.keep(csg.Manifold.union([closed, lid]));
  const filled = dropVoids(csg, scope, capped);
  // a rounded rim is narrower at the very top: its outer radius is measured lower too
  const lower = scope.keep(closed.slice(box.max[2] - Math.min(RIM_BAND_MM, (box.max[2] - box.min[2]) / 4)));
  const rim = { zMm: box.max[2], radiusMm: Math.max(maxRadius(outer), maxRadius(lower.toPolygons())) };
  if (filled === capped) return { solid: closed, status: 'open', rim };
  return { solid: filled, status: 'filled', rim };
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

function maxRadius(polygons: readonly Polygon[]): number {
  let radius = 0;
  for (const polygon of polygons) for (const [x, y] of polygon) radius = Math.max(radius, Math.hypot(x, y));
  return radius;
}
