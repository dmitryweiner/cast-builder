// A body of revolution from a closed contour: a polyline in the axial
// section (r, z), turned about the z axis. The punch is built this way.
//
// The contour goes counter-clockwise in the (r right, z up) plane: the
// material stays on the left. That makes the normals point out; a clockwise
// contour would give a mesh turned inside out.
//
// Points on the axis (r = 0) collapse into ONE vertex, not a ring of nu
// coincident ones: a ring would give nu degenerate triangles at each pole. A
// segment between two points on the axis gives nothing: it is a piece of the
// axis itself.

import type { SurfaceMesh } from './surface';

export interface LathePoint {
  /** radius, mm; a negative one is pulled to zero */
  r: number;
  /** height, mm */
  z: number;
  /**
   * Offset of the ring by angle: the legs of the punch lower the points of
   * the flange in their sectors, while between the legs the same points move
   * in towards the rim. At every angle the contour points must keep their
   * order, or the surface folds onto itself.
   */
  offset?: (u: number) => { dr: number; dz: number };
}

/** Below this radius a contour point counts as lying on the axis. */
const AXIS_EPS = 1e-6;
/** Shorter than this a contour segment is degenerate: two points in one place. */
const STEP_EPS = 1e-7;

/**
 * Drops repeats of consecutive points, including at the joint of the end and
 * the start: the contour is closed by construction. Two consecutive points on
 * the axis at DIFFERENT heights are not a repeat: they are two poles.
 */
function compact(contour: readonly LathePoint[]): LathePoint[] {
  const points: LathePoint[] = [];
  const same = (a: LathePoint, b: LathePoint): boolean => Math.abs(a.r - b.r) < STEP_EPS && Math.abs(a.z - b.z) < STEP_EPS;

  for (const point of contour) {
    const next = { ...point, r: Math.max(0, point.r) };
    if (points.length > 0 && same(points[points.length - 1], next)) continue;
    points.push(next);
  }
  while (points.length > 1 && same(points[0], points[points.length - 1])) points.pop();
  return points;
}

/** The mesh of a body of revolution. The contour closes itself: the last point joins the first. */
export function lathe(contour: readonly LathePoint[], nu: number): Omit<SurfaceMesh, 'normals'> {
  if (!Number.isFinite(nu) || nu < 3) throw new Error(`lathe: too few segments around: ${nu}`);
  const points = compact(contour);
  if (points.length < 3) throw new Error(`lathe: the contour has ${points.length} points, at least 3 needed`);

  const axis = points.map((point) => point.r <= AXIS_EPS);
  const base: number[] = [];
  let vertexCount = 0;
  for (let m = 0; m < points.length; m++) {
    base.push(vertexCount);
    vertexCount += axis[m] ? 1 : nu;
  }

  const positions = new Float32Array(vertexCount * 3);
  for (let m = 0; m < points.length; m++) {
    const { r, z, offset } = points[m];
    if (axis[m]) {
      positions[base[m] * 3 + 2] = z;
      continue;
    }
    for (let i = 0; i < nu; i++) {
      const u = (2 * Math.PI * i) / nu;
      const k = (base[m] + i) * 3;
      const shift = offset ? offset(u) : { dr: 0, dz: 0 };
      // never past the axis: there the ring would turn inside out
      const radius = Math.max(AXIS_EPS * 10, r + shift.dr);
      positions[k] = radius * Math.cos(u);
      positions[k + 1] = radius * Math.sin(u);
      positions[k + 2] = z + shift.dz;
    }
  }

  let triangles = 0;
  for (let m = 0; m < points.length; m++) {
    const m1 = (m + 1) % points.length;
    if (axis[m] && axis[m1]) continue;
    triangles += axis[m] || axis[m1] ? nu : 2 * nu;
  }

  const indices = new Uint32Array(triangles * 3);
  let k = 0;
  for (let m = 0; m < points.length; m++) {
    const m1 = (m + 1) % points.length;
    if (axis[m] && axis[m1]) continue;
    const from = base[m];
    const to = base[m1];
    for (let i = 0; i < nu; i++) {
      const i1 = (i + 1) % nu;
      if (axis[m]) {
        // a fan from the pole to the ring
        indices[k++] = from;
        indices[k++] = to + i1;
        indices[k++] = to + i;
      } else if (axis[m1]) {
        indices[k++] = from + i;
        indices[k++] = from + i1;
        indices[k++] = to;
      } else {
        indices[k++] = from + i;
        indices[k++] = from + i1;
        indices[k++] = to + i1;
        indices[k++] = from + i;
        indices[k++] = to + i1;
        indices[k++] = to + i;
      }
    }
  }
  return { positions, indices };
}
