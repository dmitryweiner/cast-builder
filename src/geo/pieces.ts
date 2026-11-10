// How many separate pieces are in one file.
//
// Clayform's "Lid beside" puts the piece and its lid into one STL, side by
// side, to print them in one go. A mold is made for one piece, and both
// would come out as one strange model: the axis between them, the slump
// mold reading the lid as part of the wall. So two pieces are refused before
// any tooling. A closed void is a separate shell too, but turned inside out:
// its signed volume is negative, and it is not a piece.

import type { IndexedMesh } from 'maker-kit/3d/mesh';

/** The connected parts of the welded mesh that enclose a positive volume. */
export function bodies({ positions, indices }: IndexedMesh): number {
  const parent = new Uint32Array(positions.length / 3);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const root = (v: number): number => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]];
      v = parent[v];
    }
    return v;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = root(indices[t]);
    parent[root(indices[t + 1])] = a;
    parent[root(indices[t + 2])] = a;
  }

  const volume = new Map<number, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    // six times the signed volume of the tetrahedron with the origin
    const v =
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) -
      positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
    const key = root(indices[t]);
    volume.set(key, (volume.get(key) ?? 0) + v);
  }
  let count = 0;
  for (const v of volume.values()) if (v > 0) count++;
  return count;
}
