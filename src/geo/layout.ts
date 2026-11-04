// Laying finished meshes out on the bed: the pour boxes, the slump mold
// with its punch, screws and stops — in the view and in one STL. A pure
// function without Three.js: the main thread lays out what the worker built,
// so a change of the layout needs no new build.

import type { SurfaceMesh } from './surface';
import { translateMesh } from './surface';

/**
 * How the parts go on the bed:
 *  auto   — in rows, broken where the longer side of the footprint is shortest;
 *  row    — one row along x;
 *  column — one behind another along y.
 */
export const BED_PLACES = ['auto', 'row', 'column'] as const;
export type BedPlace = (typeof BED_PLACES)[number];

/** Gap between parts printed in one go: the nozzle does not touch the neighbour, mm. */
export const BED_GAP_MM = 15;
export const BED_GAP_MIN_MM = 2;
export const BED_GAP_MAX_MM = 50;

export interface Arranged {
  groups: SurfaceMesh[][];
  /** the footprint of them all, mm */
  widthMm: number;
  depthMm: number;
}

interface Box {
  x0: number;
  y0: number;
  w: number;
  d: number;
}

function boxOf(group: readonly SurfaceMesh[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const mesh of group) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      x0 = Math.min(x0, mesh.positions[i]);
      x1 = Math.max(x1, mesh.positions[i]);
      y0 = Math.min(y0, mesh.positions[i + 1]);
      y1 = Math.max(y1, mesh.positions[i + 1]);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, w: x1 - x0, d: y1 - y0 } : { x0: 0, y0: 0, w: 0, d: 0 };
}

/** Corners of the boxes when the order is broken into rows before the given indices, and the footprint. */
function packRows(boxes: readonly Box[], breaks: ReadonlySet<number>, gap: number): { at: [number, number][]; w: number; d: number } {
  const at: [number, number][] = [];
  let x = 0;
  let y = 0;
  let rowDepth = 0;
  let w = 0;
  boxes.forEach((box, i) => {
    if (breaks.has(i)) {
      y += rowDepth + gap;
      x = 0;
      rowDepth = 0;
    }
    at.push([x, y]);
    w = Math.max(w, x + box.w);
    x += box.w + gap;
    rowDepth = Math.max(rowDepth, box.d);
  });
  return { at, w, d: y + rowDepth };
}

/** The rows of a layout: one, one per group, or the best of every way to break the order. */
function bestRows(boxes: readonly Box[], place: BedPlace, gap: number): { at: [number, number][]; w: number; d: number } {
  const n = boxes.length;
  if (place === 'row') return packRows(boxes, new Set(), gap);
  if (place === 'column') return packRows(boxes, new Set([...boxes.keys()].slice(1)), gap);
  let best = packRows(boxes, new Set(), gap);
  // bit k of the mask breaks the row before group k + 1; a handful of groups, so all of them
  for (let mask = 1; mask < 2 ** (n - 1); mask++) {
    const breaks = new Set<number>();
    for (let k = 0; k < n - 1; k++) if (mask & (1 << k)) breaks.add(k + 1);
    const packed = packRows(boxes, breaks, gap);
    const longer = Math.max(packed.w, packed.d);
    const bestLonger = Math.max(best.w, best.d);
    if (longer < bestLonger - 1e-6 || (longer < bestLonger + 1e-6 && packed.w * packed.d < best.w * best.d - 1e-6)) best = packed;
  }
  return best;
}

/**
 * Groups on the bed in rows: a row runs along x, its groups' fronts aligned;
 * the rows go back along y, `gapMm` apart. A group moves as a whole and in
 * plan only. A single group stays where it is.
 */
export function arrangeOnBed(groups: readonly (readonly SurfaceMesh[])[], place: BedPlace, gapMm: number): Arranged {
  const boxes = groups.map(boxOf);
  if (groups.length === 1) return { groups: [[...groups[0]]], widthMm: boxes[0].w, depthMm: boxes[0].d };
  const { at, w, d } = bestRows(boxes, place, gapMm);
  return {
    groups: groups.map((group, i) => group.map((mesh) => translateMesh(mesh, at[i][0] - boxes[i].x0, at[i][1] - boxes[i].y0))),
    widthMm: w,
    depthMm: d,
  };
}
