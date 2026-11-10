// Where the visual guides go — the axes in the model thumbnail (the print
// bed under the tooling is maker-kit's viewer's). Pure numbers without
// Three.js, so they are tested in node; the thumbnail turns them into lines.

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
