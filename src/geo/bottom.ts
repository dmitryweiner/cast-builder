// A bottom with a grid of its own.
//
// A plain bottom is a fan from the centroid of the boundary ring: right for a
// smooth bottom, but nothing can be drawn on it — neither a groove nor a
// letter. Here the bottom is built of polar rings: dense where it carries
// relief, with the wall's step elsewhere; rings of different density are
// stitched by a "zipper" around the angle. The outer ring is the ring of the
// wall grid itself; its vertices are left alone.
//
// Relief is a z offset in the plane of the bottom (`heightAt`). The sign is
// the caller's business.

/** A dense band along the radius: the grid step in it is `stepMm`. */
export interface CapBand {
  from: number;
  to: number;
  stepMm: number;
}

export interface CapSpec {
  /** bands of a finer grid; outside them the step is the wall ring's */
  dense?: readonly CapBand[];
  /** radius of a through hole along the axis, mm; 0 or absent — a solid bottom */
  holeMm?: number;
  /**
   * Height of the bottom plane. By default the mean of the wall ring; set it
   * when the ring itself is already lifted by relief.
   */
  planeZ?: number;
  /** z offset, mm, at (x, y) */
  heightAt?: (x: number, y: number) => number;
}

export interface Cap {
  /** new vertices, xyz in a row; their indices start at `firstVertex` */
  positions: Float32Array;
  /** triangles in absolute mesh indices */
  indices: Uint32Array;
  /** the ring of the hole (nu vertices, absolute indices) or null */
  hole: Uint32Array | null;
}

/** The innermost ring keeps this far from the wall: the zipper to it is one band. */
const EDGE_GAP = 0.6;

/**
 * A bottom inside the boundary ring of `nu` vertices lying in `positions`
 * from index `ringStart`. Vertex i of the ring is at angle 2π·i/nu (as any
 * grid of a body of revolution has it). `facing` is where the normal looks:
 * 'down' for an outer bottom, 'up' for the floor of a cavity. New vertices
 * are numbered from `firstVertex`.
 */
export function buildCap(
  positions: ArrayLike<number>,
  ringStart: number,
  nu: number,
  firstVertex: number,
  spec: CapSpec,
  facing: 'up' | 'down',
): Cap {
  let z0 = 0;
  let edge = Infinity;
  for (let i = 0; i < nu; i++) {
    const p = (ringStart + i) * 3;
    z0 += positions[p + 2];
    edge = Math.min(edge, Math.hypot(positions[p], positions[p + 1]));
  }
  z0 = spec.planeZ ?? z0 / nu;
  const wallStep = (2 * Math.PI * edge) / nu;
  const hole = Math.max(0, spec.holeMm ?? 0);
  const bands = spec.dense ?? [];
  const stepAt = (r: number): number => {
    let step = wallStep;
    for (const band of bands) if (r >= band.from - step && r <= band.to + step) step = Math.min(step, band.stepMm);
    return Math.max(step, 0.05);
  };
  const heightAt = spec.heightAt ?? (() => 0);

  // ring radii: from the hole (or the centre) to the wall
  const last = edge - Math.min(EDGE_GAP * wallStep + 0.05, edge * 0.1);
  const radii: number[] = [];
  let r = hole > 0 ? hole : stepAt(0);
  while (r < last) {
    radii.push(r);
    r += stepAt(r);
  }
  if (radii.length === 0 || last - radii[radii.length - 1] > stepAt(last) * 0.3) radii.push(last);
  else radii[radii.length - 1] = last;
  if (hole > 0 && radii[0] !== hole) radii.unshift(hole);

  const coords: number[] = [];
  const tris: number[] = [];
  let next = firstVertex;
  const vertex = (x: number, y: number): number => {
    coords.push(x, y, z0 + heightAt(x, y));
    return next++;
  };

  /** a ring of radius r: indices of its vertices, the first one at angle 0 */
  const ring = (radius: number, count: number): number[] => {
    const out: number[] = [];
    for (let k = 0; k < count; k++) {
      const a = (2 * Math.PI * k) / count;
      out.push(vertex(radius * Math.cos(a), radius * Math.sin(a)));
    }
    return out;
  };
  const countAt = (radius: number, forceNu: boolean): number =>
    forceNu ? nu : Math.max(6, Math.ceil((2 * Math.PI * radius) / stepAt(radius)));

  // a triangle with the normal up; reversed for 'down'
  const tri = (a: number, b: number, c: number): void => {
    if (facing === 'up') tris.push(a, b, c);
    else tris.push(a, c, b);
  };

  const rings: number[][] = radii.map((radius, k) => ring(radius, countAt(radius, hole > 0 && k === 0)));
  if (hole === 0) {
    const centre = vertex(0, 0);
    const first = rings[0];
    for (let k = 0; k < first.length; k++) tri(centre, first[k], first[(k + 1) % first.length]);
  }
  for (let k = 0; k + 1 < rings.length; k++) zip(rings[k], rings[k + 1], tri);
  const boundary: number[] = [];
  for (let i = 0; i < nu; i++) boundary.push(ringStart + i);
  zip(rings[rings.length - 1], boundary, tri);

  return {
    positions: new Float32Array(coords),
    indices: new Uint32Array(tris),
    hole: hole > 0 ? new Uint32Array(rings[0]) : null,
  };
}

/**
 * A zipper between an inner and an outer ring with even angles, both
 * starting at angle 0: at each step the ring whose next vertex comes first by
 * angle moves on. Triangles have the normal up.
 */
function zip(inner: readonly number[], outer: readonly number[], tri: (a: number, b: number, c: number) => void): void {
  const n = inner.length;
  const m = outer.length;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const nextInner = (i + 1) / n;
    const nextOuter = (j + 1) / m;
    if (j < m && (i >= n || nextOuter <= nextInner)) {
      tri(inner[i % n], outer[j], outer[(j + 1) % m]);
      j++;
    } else {
      tri(inner[i], outer[j % m], inner[(i + 1) % n]);
      i++;
    }
  }
}
