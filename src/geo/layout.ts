// Laying finished meshes out on the bed: mold parts side by side in the
// preview, the punch next to its slump mold in one STL. A pure function
// without Three.js — the main thread and the worker both need it.

import type { SurfaceMesh } from './surface';

/** Gap between parts printed in one go: the nozzle does not touch the neighbour. */
export const BESIDE_GAP_MM = 15;

/** Extent of a group along x. */
function spanX(group: readonly SurfaceMesh[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const mesh of group) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (mesh.positions[i] < min) min = mesh.positions[i];
      if (mesh.positions[i] > max) max = mesh.positions[i];
    }
  }
  return { min, max };
}

function shiftX(mesh: SurfaceMesh, dx: number): SurfaceMesh {
  if (dx === 0) return mesh;
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) positions[i] += dx;
  return { ...mesh, positions };
}

/**
 * Puts groups in a row along x with `gapMm` between their extents. A group
 * moves as a whole. The first group stays where it is.
 */
export function placeInRow(groups: readonly (readonly SurfaceMesh[])[], gapMm: number): SurfaceMesh[][] {
  const placed: SurfaceMesh[][] = [];
  let cursor = 0;
  groups.forEach((group, index) => {
    const { min, max } = spanX(group);
    if (!Number.isFinite(min)) {
      placed.push([...group]);
      return;
    }
    const dx = index === 0 ? 0 : cursor - min;
    placed.push(group.map((mesh) => shiftX(mesh, dx)));
    cursor = max + dx + gapMm;
  });
  return placed;
}
