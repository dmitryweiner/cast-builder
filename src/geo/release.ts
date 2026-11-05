// Whether a piece comes out of a press mold, and how deep it catches.
//
// A press mold is pulled off the clay along one direction. A face looking
// against the pull is not yet a catch: a gentle wave a millimetre deep lets
// go of a slab that gives, a bulge over the parting plane holds it. So the
// check measures depth, in mm. Rays along the pull cross the piece on a
// grid over the plane; along each ray the space beyond the plane is cut
// into voxels: clay (inside the piece), free (past the last exit — the mold
// leaves there), and **locked**: mold outside the clay with clay further
// along the pull, which runs into the piece when the mold moves. How far a
// locked voxel is from the clay is how deep that catch is; the deepest one
// is the answer.
//
// The rays are kept: a shell of the mold built on the same grid
// (geo/split/shell.ts) needs how far the piece reaches from the plane at
// every node.
//
// Pure: no CSG, no DOM.

/** Positions and triangles of a closed mesh. */
export interface RayMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export type Axis = 0 | 1 | 2;

/** Crossings of a closed mesh by rays along `axis` through the nodes of a grid. */
export interface RayGrid {
  axis: Axis;
  /** the two coordinates across the rays, indices into (x, y, z) */
  across: [Axis, Axis];
  cell: number;
  /** nodes along the first and the second coordinate across */
  n0: number;
  n1: number;
  /** node (0, 0) */
  o0: number;
  o1: number;
  /** node k = i·n1 + j: its crossings are values[start[k] … start[k + 1]), ascending; none for a ray hit an odd number of times */
  start: Uint32Array;
  values: Float64Array;
  /** the node nearest to a point across the rays */
  nodeAt(a: number, b: number): number;
}

/**
 * The grid is moved off round numbers by this share of a cell: a ray through
 * a vertex or an edge of two faces would count it twice or not at all. A
 * ray that still sees an odd number of crossings is dropped.
 */
const NODE_SHIFT = 0.5137;

/** The rays through a grid over the mesh's extent across them, `marginMm` wider on every side. */
export function castRays(mesh: RayMesh, axis: Axis, cell: number, marginMm = 0): RayGrid {
  const { positions, indices } = mesh;
  const [p, q] = acrossOf(axis);
  let pMin = Infinity,
    pMax = -Infinity,
    qMin = Infinity,
    qMax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    pMin = Math.min(pMin, positions[i + p]);
    pMax = Math.max(pMax, positions[i + p]);
    qMin = Math.min(qMin, positions[i + q]);
    qMax = Math.max(qMax, positions[i + q]);
  }
  const o0 = (Math.floor((pMin - marginMm) / cell) - 1 + NODE_SHIFT) * cell;
  const o1 = (Math.floor((qMin - marginMm) / cell) - 1 + NODE_SHIFT) * cell;
  const n0 = Math.ceil((pMax + marginMm - o0) / cell) + 2;
  const n1 = Math.ceil((qMax + marginMm - o1) / cell) + 2;

  // two passes: count the crossings per node, then write them
  const counts = new Uint32Array(n0 * n1 + 1);
  const visit = (write: (node: number, value: number) => void): void => {
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3,
        b = indices[t + 1] * 3,
        c = indices[t + 2] * 3;
      const ap = (positions[a + p] - o0) / cell,
        aq = (positions[a + q] - o1) / cell;
      const bp = (positions[b + p] - o0) / cell,
        bq = (positions[b + q] - o1) / cell;
      const cp = (positions[c + p] - o0) / cell,
        cq = (positions[c + q] - o1) / cell;
      const area = (bp - ap) * (cq - aq) - (cp - ap) * (bq - aq);
      // a face along the rays: its neighbours give the crossing
      if (Math.abs(area) < 1e-12) continue;
      const i0 = Math.max(0, Math.ceil(Math.min(ap, bp, cp)));
      const i1 = Math.min(n0 - 1, Math.floor(Math.max(ap, bp, cp)));
      const j0 = Math.max(0, Math.ceil(Math.min(aq, bq, cq)));
      const j1 = Math.min(n1 - 1, Math.floor(Math.max(aq, bq, cq)));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const wa = ((bp - i) * (cq - j) - (cp - i) * (bq - j)) / area;
          const wb = ((cp - i) * (aq - j) - (ap - i) * (cq - j)) / area;
          const wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          write(i * n1 + j, wa * positions[a + axis] + wb * positions[b + axis] + wc * positions[c + axis]);
        }
      }
    }
  };
  visit((node) => counts[node + 1]++);
  const start = new Uint32Array(n0 * n1 + 1);
  for (let k = 0; k < n0 * n1; k++) start[k + 1] = start[k] + counts[k + 1];
  const values = new Float64Array(start[n0 * n1]);
  const filled = new Uint32Array(n0 * n1);
  visit((node, value) => {
    values[start[node] + filled[node]++] = value;
  });
  for (let k = 0; k < n0 * n1; k++) {
    const from = start[k],
      to = start[k + 1];
    if (to - from > 1) values.subarray(from, to).sort();
  }
  // an odd ray is dropped: its crossings become NaN and `crossings` sees none
  for (let k = 0; k < n0 * n1; k++) {
    if ((start[k + 1] - start[k]) % 2 === 1) values.fill(NaN, start[k], start[k + 1]);
  }

  return {
    axis,
    across: [p, q],
    cell,
    n0,
    n1,
    o0,
    o1,
    start,
    values,
    nodeAt: (a, b) => {
      const i = Math.min(n0 - 1, Math.max(0, Math.round((a - o0) / cell)));
      const j = Math.min(n1 - 1, Math.max(0, Math.round((b - o1) / cell)));
      return i * n1 + j;
    },
  };
}

function acrossOf(axis: Axis): [Axis, Axis] {
  if (axis === 0) return [1, 2];
  if (axis === 1) return [2, 0];
  return [0, 1];
}

/** The crossings of one node; an odd ray has none. */
function crossings(rays: RayGrid, node: number): Float64Array {
  const from = rays.start[node],
    to = rays.start[node + 1];
  if (to === from || Number.isNaN(rays.values[from])) return rays.values.subarray(0, 0);
  return rays.values.subarray(from, to);
}

/**
 * How far the piece reaches from the plane at every node, along the pull
 * (`side` · axis): the last exit. NaN where nothing of it lies beyond the
 * plane. Over a catch it is the hull — the mold's shell must cover that.
 */
export function reachOf(rays: RayGrid, plane: number, side: 1 | -1): Float64Array {
  const out = new Float64Array(rays.n0 * rays.n1).fill(NaN);
  for (let node = 0; node < out.length; node++) {
    const hits = crossings(rays, node);
    if (hits.length === 0) continue;
    const reach = side * ((side > 0 ? hits[hits.length - 1] : hits[0]) - plane);
    if (reach > 0) out[node] = reach;
  }
  return out;
}

/**
 * A locked voxel no farther from the clay than this, in cells squared (a
 * diagonal), is noise: facets along the pull leave such voxels with no catch
 * at all. The check does not see catches under about a cell and a half.
 */
const NOISE_CELLS2 = 2;

export interface ReleaseOptions {
  /** the parting plane: the coordinate along the rays' axis */
  plane: number;
  /** the half beyond the plane on this side, pulled off this way */
  side: 1 | -1;
  /** where the mold is taken away (over a rim, inside a mouth) nothing is locked; world coordinates */
  cut?: (x: number, y: number, z: number) => boolean;
}

export interface Release {
  /** how deep the deepest catch is, mm; 0 — the half comes off clean */
  depthMm: number;
  /** where it is, world coordinates; null when nothing catches */
  at: [number, number, number] | null;
  /** how much mold is locked, mm³ */
  lockedMm3: number;
}

export function releaseDepth(rays: RayGrid, { plane, side, cut }: ReleaseOptions): Release {
  const { n0, n1, cell, axis, across, o0, o1 } = rays;
  const nodes = n0 * n1;
  const reach = reachOf(rays, plane, side);
  let deepest = 0;
  for (let k = 0; k < nodes; k++) if (reach[k] > deepest) deepest = reach[k];
  const nw = Math.ceil(deepest / cell) + 1;
  // voxel (node, k) is centred at plane + side·(k + ½)·cell
  const along = (k: number): number => plane + side * (k + 0.5) * cell;
  const point = (node: number, k: number): [number, number, number] => {
    const out: [number, number, number] = [0, 0, 0];
    out[across[0]] = o0 + Math.floor(node / n1) * cell;
    out[across[1]] = o1 + (node % n1) * cell;
    out[axis] = along(k);
    return out;
  };

  const distance = new Float32Array(nodes * nw).fill(Infinity);
  const locked: number[] = [];
  for (let node = 0; node < nodes; node++) {
    const hits = crossings(rays, node);
    if (hits.length === 0) continue;
    const last = reach[node];
    // crossings behind the voxel, counted the way the voxels go: odd — inside (a ray has an even number)
    let passed = 0;
    let next = side > 0 ? 0 : hits.length - 1;
    for (let k = 0; k < nw; k++) {
      const w = along(k);
      while (next >= 0 && next < hits.length && side * (hits[next] - w) < 0) {
        passed++;
        next += side;
      }
      if (passed % 2 === 1) distance[node * nw + k] = 0;
      else if ((k + 0.5) * cell < last) {
        if (!cut) locked.push(node, k);
        else {
          const [x, y, z] = point(node, k);
          if (!cut(x, y, z)) locked.push(node, k);
        }
      }
    }
  }
  if (locked.length === 0) return { depthMm: 0, at: null, lockedMm3: 0 };

  squaredDistances(distance, n0, n1, nw);
  // a voxel beside the clay, even across a corner, is the grid's own step: a facet running along the pull
  let best = NOISE_CELLS2;
  let bestAt: [number, number, number] | null = null;
  let count = 0;
  for (let i = 0; i < locked.length; i += 2) {
    const d = distance[locked[i] * nw + locked[i + 1]];
    if (d <= NOISE_CELLS2) continue;
    count++;
    if (d > best) {
      best = d;
      bestAt = point(locked[i], locked[i + 1]);
    }
  }
  if (!bestAt) return { depthMm: 0, at: null, lockedMm3: 0 };
  return { depthMm: Math.sqrt(best) * cell, at: bestAt, lockedMm3: count * cell ** 3 };
}

/**
 * The squared Euclidean distance transform in place, in cells: 0 at the
 * seeds, Infinity elsewhere on the way in. Separable, one axis after
 * another (Felzenszwalb & Huttenlocher), exact.
 */
function squaredDistances(grid: Float32Array, n0: number, n1: number, n2: number): void {
  const longest = Math.max(n0, n1, n2);
  const f = new Float64Array(longest);
  const d = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  const pass = (n: number, stride: number, lines: number, base: (line: number) => number): void => {
    for (let line = 0; line < lines; line++) {
      const at = base(line);
      for (let s = 0; s < n; s++) f[s] = grid[at + s * stride];
      lowerEnvelope(f, n, d, v, z);
      for (let s = 0; s < n; s++) grid[at + s * stride] = d[s];
    }
  };
  // layout (i·n1 + j)·n2 + k
  pass(n2, 1, n0 * n1, (line) => line * n2);
  pass(n1, n2, n0 * n2, (line) => Math.floor(line / n2) * n1 * n2 + (line % n2));
  pass(n0, n1 * n2, n1 * n2, (line) => line);
}

/** One line of the transform: d[q] = min over p of (q − p)² + f[p]. */
function lowerEnvelope(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = -1;
  for (let q = 0; q < n; q++) {
    if (f[q] === Infinity) continue;
    if (k < 0) {
      k = 0;
      v[0] = q;
      z[0] = -Infinity;
      z[1] = Infinity;
      continue;
    }
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    while (s <= z[k]) {
      k--;
      if (k < 0) break;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    }
    k++;
    v[k] = q;
    z[k] = k === 0 ? -Infinity : s;
    z[k + 1] = Infinity;
  }
  if (k < 0) {
    d.fill(Infinity, 0, n);
    return;
  }
  let j = 0;
  for (let q = 0; q < n; q++) {
    while (z[j + 1] < q) j++;
    d[q] = (q - v[j]) * (q - v[j]) + f[v[j]];
  }
}
