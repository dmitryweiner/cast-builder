// Where the visual guides go — the print bed under the tooling, the axes in
// the model thumbnail. Pure numbers without Three.js, so they are tested in
// node; the views turn them into lines.

export interface BedGrid {
  /** the side of the square bed, mm */
  sizeMm: number;
  /** the side of a cell, mm */
  cellMm: number;
}

/** No bed is drawn smaller than a small printer's. */
const MIN_BED_MM = 200;
/** room round the tooling, a share of its footprint */
const BED_MARGIN = 0.3;
/** more lines than this per side merge into a grey plane from afar */
const MAX_CELLS = 60;
const CELLS_MM = [10, 20, 50, 100];

/** A square bed under a footprint of the given size: whole decimetres, the finest cells that stay apart. */
export function bedGrid(widthMm: number, depthMm: number): BedGrid {
  const sizeMm = Math.max(MIN_BED_MM, Math.ceil((Math.max(widthMm, depthMm) * (1 + BED_MARGIN)) / 100) * 100);
  const cellMm = CELLS_MM.find((cell) => sizeMm / cell <= MAX_CELLS) ?? 100;
  return { sizeMm, cellMm };
}

export type Vec3 = [number, number, number];

export interface AxisGuide {
  name: 'x' | 'y' | 'z';
  from: Vec3;
  /** the positive end, where the label goes */
  to: Vec3;
}

/** how far the axes reach past the piece, a share of its largest size */
const AXIS_OVERHANG = 0.15;

/**
 * The axes of a placed model (its axis through the origin, the bottom on
 * z = 0), given its bounding box: X and Y on the floor through the axis, out
 * past the piece both ways — X is the trace of the parting plane; Z up the
 * axis from the floor to above the top.
 */
export function thumbAxes(min: Vec3, max: Vec3): AxisGuide[] {
  const reach = AXIS_OVERHANG * Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return [
    { name: 'x', from: [min[0] - reach, 0, 0], to: [max[0] + reach, 0, 0] },
    { name: 'y', from: [0, min[1] - reach, 0], to: [0, max[1] + reach, 0] },
    { name: 'z', from: [0, 0, 0], to: [0, 0, max[2] + reach] },
  ];
}
