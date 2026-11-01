// The void under the positive of a pour box.
//
// The positive of a block inside the pour box is the whole plaster block,
// and there is no point printing it solid: silicone needs only the working
// surface. Under it a void open to the table is left, and of the positive a
// shell of constant thickness. The slicer puts supports into the void, and
// it still takes several times less plastic.
//
// The positive lies working face up, and its top is a single-valued function
// h(x, y): silicone comes off vertically, so there are no undercuts from
// above. The ceiling of the void is the offset of this graph by the shell
// thickness ALONG THE NORMAL, not vertically: the walls of a half's cavity at
// the seam are vertical, and a vertical shift would thin the shell there to
// nothing. The offset of a graph is an erosion by a ball:
//
//     c(p) = min_{|q−p| ≤ t} ( h(q) − √(t² − |q−p|²) )
//
// Where there is no positive (round the block, the plug's gate) h = −∞, and
// the erosion moves the void off the side walls by the same thickness itself.

import type { Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from '../csg';
import { toManifold } from '../csg';

/** Step of the height map, mm: a thinner shell is not needed, a finer step costs more. */
const CELL_MM = 1;
/** Below this over the table no void is cut: a slit in the box's floor is useless. */
const MIN_VOID_MM = 1;
/** How far the void goes under the box's bottom — so the cut is clean. */
const BREAKTHROUGH_MM = 1;

/**
 * The void under a positive standing on z = 0. Below it goes through the
 * box's floor (`floorMm` under zero). null — no void: the positive is too
 * small or thin for a shell.
 */
export function undersideVoid(csg: CsgApi, scope: CsgScope, positive: Manifold, shellMm: number, floorMm: number): Manifold | null {
  const box = positive.boundingBox();
  const field = topHeights(positive, box.min[0], box.min[1], box.max[0], box.max[1]);
  // Room for the grid step. The map knows the surface only at its nodes: a
  // node exactly on the edge of a vertical wall is already "top", and the
  // nearest lower node may be a whole cell diagonal away from the real wall.
  const ceiling = erode(field, shellMm + CELL_MM * Math.SQRT2);
  const mesh = voidMesh(ceiling, -floorMm - BREAKTHROUGH_MM);
  return mesh ? scope.keep(toManifold(csg, mesh)) : null;
}

/** Values at the grid nodes; NaN — the node is outside the positive. */
interface HeightField {
  nx: number;
  ny: number;
  x0: number;
  y0: number;
  cell: number;
  /** (nx+1)·(ny+1), index j·(nx+1) + i */
  z: Float64Array;
}

/**
 * The top of the positive at the grid nodes: triangles rasterised into a
 * z-buffer, the largest z per node. Vertical faces are degenerate in plan and
 * add nothing — their height comes from the neighbouring inclined ones.
 */
function topHeights(solid: Manifold, xMin: number, yMin: number, xMax: number, yMax: number): HeightField {
  const cell = CELL_MM;
  const nx = Math.max(1, Math.ceil((xMax - xMin) / cell));
  const ny = Math.max(1, Math.ceil((yMax - yMin) / cell));
  // the grid is centred on the positive: the edges fall symmetrically
  const x0 = (xMin + xMax - nx * cell) / 2;
  const y0 = (yMin + yMax - ny * cell) / 2;
  const stride = nx + 1;
  const z = new Float64Array(stride * (ny + 1)).fill(NaN);

  const { numProp, vertProperties, triVerts } = solid.getMesh();
  const px = (v: number): number => (vertProperties[v * numProp] - x0) / cell;
  const py = (v: number): number => (vertProperties[v * numProp + 1] - y0) / cell;
  const pz = (v: number): number => vertProperties[v * numProp + 2];
  for (let t = 0; t < triVerts.length; t += 3) {
    const a = triVerts[t],
      b = triVerts[t + 1],
      c = triVerts[t + 2];
    const ax = px(a),
      ay = py(a),
      bx = px(b),
      by = py(b),
      cx = px(c),
      cy = py(c);
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) continue;
    const az = pz(a),
      bz = pz(b),
      cz = pz(c);
    const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 1e-9));
    const i1 = Math.min(nx, Math.floor(Math.max(ax, bx, cx) + 1e-9));
    const j0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 1e-9));
    const j1 = Math.min(ny, Math.floor(Math.max(ay, by, cy) + 1e-9));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        // barycentric coordinates; a node on an edge counts as inside
        const wa = ((bx - i) * (cy - j) - (cx - i) * (by - j)) / area;
        const wb = ((cx - i) * (ay - j) - (ax - i) * (cy - j)) / area;
        const wc = 1 - wa - wb;
        if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
        const height = wa * az + wb * bz + wc * cz;
        const k = j * stride + i;
        if (!(z[k] >= height)) z[k] = height;
      }
    }
  }
  return { nx, ny, x0, y0, cell, z };
}

/**
 * Erosion of the graph by a ball of radius `radius`. A node with an empty
 * neighbour in the ball (outside the positive or the grid) becomes empty
 * itself — so the void keeps off the positive's side walls by the same
 * thickness as off its top. Nodes lower than MIN_VOID_MM over the table are
 * empty too.
 */
function erode(field: HeightField, radius: number): HeightField {
  const { nx, ny, cell, z } = field;
  const stride = nx + 1;
  const reach = Math.ceil(radius / cell);
  const ball: { di: number; dj: number; drop: number }[] = [];
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const d2 = (di * di + dj * dj) * cell * cell;
      if (d2 <= radius * radius) ball.push({ di, dj, drop: Math.sqrt(radius * radius - d2) });
    }
  }
  const out = new Float64Array(z.length).fill(NaN);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      let lowest = Infinity;
      for (const { di, dj, drop } of ball) {
        const qi = i + di,
          qj = j + dj;
        const h = qi < 0 || qj < 0 || qi > nx || qj > ny ? NaN : z[qj * stride + qi];
        if (Number.isNaN(h)) {
          lowest = NaN;
          break;
        }
        lowest = Math.min(lowest, h - drop);
      }
      if (lowest > MIN_VOID_MM) out[j * stride + i] = lowest;
    }
  }
  return { ...field, z: out };
}

/**
 * A closed mesh of the void: the ceiling over the nodes on top, the plane
 * `bottomZ` below, vertical walls round the edge. A cell is in if all four of
 * its nodes are alive. Cells touching only at a corner would make a
 * "bow-tie" vertex the CSG rejects; such pairs are broken by dropping one cell.
 */
function voidMesh(field: HeightField, bottomZ: number): { positions: Float32Array; indices: Uint32Array } | null {
  const { nx, ny, x0, y0, cell, z } = field;
  const stride = nx + 1;
  const alive = (i: number, j: number): boolean => !Number.isNaN(z[j * stride + i]);
  const inside = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      inside[j * nx + i] = alive(i, j) && alive(i + 1, j) && alive(i, j + 1) && alive(i + 1, j + 1) ? 1 : 0;
    }
  }
  const at = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < nx && j < ny && inside[j * nx + i] === 1;
  for (let changed = true; changed;) {
    changed = false;
    for (let j = 0; j + 1 < ny; j++) {
      for (let i = 0; i + 1 < nx; i++) {
        const a = at(i, j),
          b = at(i + 1, j),
          c = at(i, j + 1),
          d = at(i + 1, j + 1);
        if (a && d && !b && !c) {
          inside[j * nx + i] = 0;
          changed = true;
        } else if (b && c && !a && !d) {
          inside[j * nx + i + 1] = 0;
          changed = true;
        }
      }
    }
  }

  // vertices only at nodes some cell touches
  const top = new Int32Array(stride * (ny + 1)).fill(-1);
  const coords: number[] = [];
  const vertex = (i: number, j: number): number => {
    const k = j * stride + i;
    if (top[k] < 0) {
      top[k] = coords.length / 3;
      const x = x0 + i * cell,
        y = y0 + j * cell;
      coords.push(x, y, z[k], x, y, bottomZ);
    }
    return top[k];
  };
  const tris: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      // the cell counter-clockwise seen from above
      const ring = [vertex(i, j), vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1)];
      const [p00, p10, p11, p01] = ring;
      tris.push(p00, p10, p11, p00, p11, p01); // the ceiling, normal up
      // the bottom — the lower vertex follows the upper one (index + 1), normal down
      tris.push(p00 + 1, p11 + 1, p10 + 1, p00 + 1, p01 + 1, p11 + 1);
      const neighbours = [at(i, j - 1), at(i + 1, j), at(i, j + 1), at(i - 1, j)];
      for (let e = 0; e < 4; e++) {
        if (neighbours[e]) continue;
        // outside is to the right of the walking direction
        const a = ring[e],
          b = ring[(e + 1) % 4];
        tris.push(a + 1, b + 1, b, a + 1, b, a);
      }
    }
  }
  if (tris.length === 0) return null;
  return { positions: new Float32Array(coords), indices: new Uint32Array(tris) };
}
