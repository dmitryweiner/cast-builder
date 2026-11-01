// STL in and out.
//
// Binary STL (little-endian): an 80-byte header, a uint32 triangle count,
// per triangle a normal (3×f32), three vertices (9×f32) and a uint16
// attribute. ASCII STL is the same data as text. The file carries no units;
// we take them as millimetres, as slicers do.
//
// STL repeats every vertex in each triangle that uses it. A solid for CSG
// needs shared vertices, so the reader welds equal positions (bit for bit:
// an exporter writes the same float for the same vertex) into one.

import type { SurfaceMesh } from './surface';

export interface StlOptions {
  /** goes into the 80-byte header after the app name */
  name?: string;
}

export function encodeSTL(mesh: Pick<SurfaceMesh, 'positions' | 'indices'>, o: StlOptions = {}): ArrayBuffer {
  const { positions, indices } = mesh;
  const triCount = indices.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = `cast-builder ${o.name ?? ''}`.slice(0, 80);
  new TextEncoder().encodeInto(header, new Uint8Array(buf, 0, 80));
  dv.setUint32(80, triCount, true);
  let off = 84;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-30) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    dv.setFloat32(off, nx, true);
    dv.setFloat32(off + 4, ny, true);
    dv.setFloat32(off + 8, nz, true);
    off += 12;
    for (const v of [a, b, c]) {
      dv.setFloat32(off, positions[v], true);
      dv.setFloat32(off + 4, positions[v + 1], true);
      dv.setFloat32(off + 8, positions[v + 2], true);
      off += 12;
    }
    dv.setUint16(off, 0, true);
    off += 2;
  }
  return buf;
}

/** An indexed mesh without normals: what the reader gives and the CSG takes. */
export interface IndexedMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Reads binary or ASCII STL and welds its vertices. Throws on a file that is
 * neither (the message is for the developer; the interface says it its own
 * way). Triangles with two equal corners are dropped: they carry no surface
 * and a manifold check would reject them.
 */
export function parseSTL(data: ArrayBuffer): IndexedMesh {
  const soup = isBinary(data) ? binarySoup(data) : asciiSoup(data);
  if (soup.length === 0) throw new Error('parseSTL: no triangles');
  return weld(soup);
}

/**
 * A binary file has exactly 84 + 50·n bytes. The header may start with
 * "solid" too (many exporters write it), so the size is the test, not the
 * first word.
 */
function isBinary(data: ArrayBuffer): boolean {
  if (data.byteLength < 84) return false;
  const count = new DataView(data).getUint32(80, true);
  return data.byteLength === 84 + count * 50;
}

function binarySoup(data: ArrayBuffer): Float32Array {
  const dv = new DataView(data);
  const count = dv.getUint32(80, true);
  const soup = new Float32Array(count * 9);
  for (let t = 0; t < count; t++) {
    const off = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k++) soup[t * 9 + k] = dv.getFloat32(off + k * 4, true);
  }
  return soup;
}

const VERTEX = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;

function asciiSoup(data: ArrayBuffer): Float32Array {
  const text = new TextDecoder().decode(data);
  if (!/^\s*solid/.test(text)) throw new Error('parseSTL: neither binary nor ASCII STL');
  const values: number[] = [];
  for (const match of text.matchAll(VERTEX)) {
    for (let k = 1; k <= 3; k++) values.push(Number(match[k]));
  }
  if (values.length % 9 !== 0) throw new Error('parseSTL: a facet without three vertices');
  if (values.some((value) => !Number.isFinite(value))) throw new Error('parseSTL: a vertex is not a number');
  return new Float32Array(values);
}

/**
 * Welds a triangle soup (9 floats per triangle) into an indexed mesh: equal
 * positions get one index. An open-addressing hash table on the bit patterns
 * of the three floats — a Map with string keys would take seconds on a
 * million triangles.
 */
export function weld(soup: Float32Array): IndexedMesh {
  const bits = new Uint32Array(soup.buffer, soup.byteOffset, soup.length);
  const corners = soup.length / 3;
  let size = 1;
  while (size < corners * 2) size *= 2;
  const mask = size - 1;
  const table = new Int32Array(size).fill(-1);
  const out = new Float32Array(soup.length);
  const outBits = new Uint32Array(out.buffer);
  const ids = new Uint32Array(corners);
  let count = 0;

  for (let c = 0; c < corners; c++) {
    // −0 and +0 are the same point but different bits
    const x = soup[c * 3] === 0 ? 0 : bits[c * 3];
    const y = soup[c * 3 + 1] === 0 ? 0 : bits[c * 3 + 1];
    const z = soup[c * 3 + 2] === 0 ? 0 : bits[c * 3 + 2];
    let h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
    for (;;) {
      const slot = h & mask;
      const id = table[slot];
      if (id < 0) {
        table[slot] = count;
        out[count * 3] = soup[c * 3] === 0 ? 0 : soup[c * 3];
        out[count * 3 + 1] = soup[c * 3 + 1] === 0 ? 0 : soup[c * 3 + 1];
        out[count * 3 + 2] = soup[c * 3 + 2] === 0 ? 0 : soup[c * 3 + 2];
        ids[c] = count++;
        break;
      }
      if (outBits[id * 3] === x && outBits[id * 3 + 1] === y && outBits[id * 3 + 2] === z) {
        ids[c] = id;
        break;
      }
      h++;
    }
  }

  const indices: number[] = [];
  for (let t = 0; t < corners; t += 3) {
    const a = ids[t];
    const b = ids[t + 1];
    const c = ids[t + 2];
    if (a === b || b === c || c === a) continue;
    indices.push(a, b, c);
  }
  return { positions: out.slice(0, count * 3), indices: new Uint32Array(indices) };
}
