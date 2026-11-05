// A split press mold: two shells parted by a plane, no punch. The clay is
// pressed into each half and evened by the fingers, cut flush with the land
// and the rim; the clay halves are taken out and joined by hand.
//
// A half is built in the world frame of the piece (filled and scaled): the
// slab of its shell (shell.ts) on the release check's grid, cut to the
// outline of the land — the shadow of that half of the piece on the plane,
// grown by the land — with the piece and the rim cutter (rim.ts) taken out.
// The plane cuts the piece transversally and the back keeps the wall off it:
// no coincident faces.
//
// Only the worker imports this module: it needs the CSG.

import type { Manifold, Mat4 } from 'manifold-3d';
import type { CsgApi, CsgScope } from '../csg';
import { outerOutline, toManifold } from '../csg';
import type { Axis, RayGrid } from '../release';
import { reachOf } from '../release';
import { shellHeights, shellMesh } from './shell';

/** The land round the cavity, mm: a flange in the plane the clay is cut flush with. */
export const SPLIT_LAND_MM = 12;

export interface HalfOptions {
  /** the parting plane: the coordinate along the rays' axis */
  plane: number;
  /** the half beyond the plane on this side, pulled off this way */
  side: 1 | -1;
  wallMm: number;
  /** what is taken away over the rim and inside the mouth; null for a closed piece */
  cutter: Manifold | null;
}

/** One half in the world frame; `rays` cast along the plane's axis with the land as their margin. */
export function buildHalf(csg: CsgApi, scope: CsgScope, piece: Manifold, rays: RayGrid, options: HalfOptions): Manifold {
  const { plane, side, wallMm, cutter } = options;
  const heights = shellHeights(rays, reachOf(rays, plane, side), wallMm);
  const slab = scope.keep(toManifold(csg, shellMesh(rays, plane, side, heights)));
  const land = landPrism(csg, scope, piece, rays.axis, plane, side);
  let half = scope.keep(scope.keep(slab.intersect(land)).subtract(piece));
  if (cutter) half = scope.keep(half.subtract(cutter));
  return half;
}

/**
 * The outline of the land as a prism along the axis: the shadow of the
 * piece's half on the plane, holes filled, grown by the land. `project` sees
 * only along z, so the half is turned to look down the axis and back.
 */
function landPrism(csg: CsgApi, scope: CsgScope, piece: Manifold, axis: Axis, plane: number, side: 1 | -1): Manifold {
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = side;
  const half = scope.keep(piece.trimByPlane(normal, side * plane));
  const toLocal = localFrame(axis);
  const shadow = outerOutline(csg, scope, scope.keep(scope.keep(half.transform(toLocal)).project()));
  const outline = scope.keep(shadow.offset(SPLIT_LAND_MM, 'Round'));
  // along the axis far past both ends of the slab, which bounds it anyway
  const box = piece.boundingBox();
  const reach = box.max[axis] - box.min[axis] + 100;
  const prism = scope.keep(scope.keep(outline.extrude(2 * reach)).translate([0, 0, plane - reach]));
  return scope.keep(prism.transform(transpose(toLocal)));
}

/**
 * The turn (world → local) that takes the across coordinates of the rays to
 * x, y and their axis to z — the frame shell.ts builds in, right-handed.
 * Column-major, as Manifold takes it.
 */
function localFrame(axis: Axis): Mat4 {
  const rows: [Axis, Axis, Axis] = axis === 0 ? [1, 2, 0] : axis === 1 ? [2, 0, 1] : [0, 1, 2];
  const m: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
  rows.forEach((column, row) => {
    m[column * 4 + row] = 1;
  });
  return m;
}

function transpose(m: Mat4): Mat4 {
  const out: Mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) out[column * 4 + row] = m[row * 4 + column];
  return out;
}
