// Pure mesh checks. The checker reports; the export gate decides what blocks a download.

import type { SurfaceMesh } from './surface';
import type { Message } from './message';

export interface MeshReport {
  /** every position and normal is finite */
  finite: boolean;
  /** indices are complete integer triangles and point at existing vertices */
  indicesValid: boolean;
  /** every edge is in exactly 2 triangles with opposite orientation */
  watertight: boolean;
  /** signed volume; > 0 means the normals point out */
  volume: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  /** triangles with an area below eps */
  degenerateTriangles: number;
  triangleCount: number;
  vertexCount: number;
  extents: [number, number, number];
}

export interface ExportAssessment {
  blocking: Message[];
  warnings: Message[];
}

/**
 * How many degenerate triangles count as the noise of a boolean operation.
 * The share still works: on a small mesh eight of them are percent already,
 * and such a mesh is blocked however few they are.
 */
const SLIVER_NOISE = 8;

/** The export gate shared by the UI and the tests. */
export function assessExport(report: MeshReport, shouldBeClosed: boolean): ExportAssessment {
  const blocking: Message[] = [];
  const warnings: Message[] = [];
  if (!report.finite) blocking.push({ code: 'mesh.nonFinite' });
  if (!report.indicesValid) blocking.push({ code: 'mesh.badIndices' });
  if (report.triangleCount === 0 || report.vertexCount === 0) blocking.push({ code: 'mesh.empty' });
  if (report.extents.some((extent) => !Number.isFinite(extent) || extent <= 1e-9)) {
    blocking.push({ code: 'mesh.flat' });
  }
  if (shouldBeClosed && !report.watertight) blocking.push({ code: 'mesh.open' });
  if (shouldBeClosed && report.volume < 0) blocking.push({ code: 'mesh.inverted' });
  if (report.degenerateTriangles > 0) {
    const ratio = report.triangleCount > 0 ? report.degenerateTriangles / report.triangleCount : 1;
    const message: Message = {
      code: 'mesh.degenerate',
      params: { count: report.degenerateTriangles, pct: (ratio * 100).toFixed(2) },
    };
    // Any boolean operation leaves a few slivers where surfaces meet at a
    // tangent. They do not hurt printing, and warning about them teaches
    // people not to read warnings.
    if (ratio > 0.01) blocking.push(message);
    else if (report.degenerateTriangles > SLIVER_NOISE) warnings.push(message);
  }
  return { blocking, warnings };
}

/** Signed volume of a closed mesh (a sum of tetrahedra from the origin); positive with outward normals. */
export function signedVolume(positions: Float32Array, indices: Uint32Array): number {
  let volume6 = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    volume6 +=
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) -
      positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return volume6 / 6;
}

export function validateMesh(mesh: SurfaceMesh, areaEps = 1e-12): MeshReport {
  const { positions, indices } = mesh;

  let finite = true;
  for (const values of [positions, mesh.normals]) {
    for (let i = 0; i < values.length; i++) {
      if (Number.isFinite(values[i])) continue;
      finite = false;
      break;
    }
    if (!finite) break;
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const x = positions[i + c];
      if (x < min[c]) min[c] = x;
      if (x > max[c]) max[c] = x;
    }
  }

  // Edges: the key is an ordered pair; balance counts the orientation
  // (a→b: +1, b→a: −1). Watertight ⇔ every edge is met twice and balance = 0.
  const edges = new Map<number, { count: number; balance: number }>();
  const nVerts = positions.length / 3;
  let indicesValid = indices.length % 3 === 0;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] >= nVerts) {
      indicesValid = false;
      break;
    }
  }
  const edgeKey = (a: number, b: number): number => (a < b ? a * nVerts + b : b * nVerts + a);
  let degenerate = 0;
  for (let t = 0; t < (indicesValid ? indices.length : 0); t += 3) {
    const ia = indices[t];
    const ib = indices[t + 1];
    const ic = indices[t + 2];
    for (const [a, b] of [
      [ia, ib],
      [ib, ic],
      [ic, ia],
    ]) {
      const key = edgeKey(a, b);
      let e = edges.get(key);
      if (!e) {
        e = { count: 0, balance: 0 };
        edges.set(key, e);
      }
      e.count++;
      e.balance += a < b ? 1 : -1;
    }
    const a = ia * 3;
    const b = ib * 3;
    const c = ic * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const area2 = Math.hypot(nx, ny, nz);
    if (area2 * 0.5 < areaEps) degenerate++;
  }
  let watertight = indicesValid && indices.length > 0;
  for (const e of edges.values()) {
    if (e.count !== 2 || e.balance !== 0) {
      watertight = false;
      break;
    }
  }

  return {
    finite,
    indicesValid,
    watertight,
    volume: indicesValid ? signedVolume(positions, indices) : 0,
    bbox: { min, max },
    degenerateTriangles: degenerate,
    triangleCount: indices.length / 3,
    vertexCount: nVerts,
    extents: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}
