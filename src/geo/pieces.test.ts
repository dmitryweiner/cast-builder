import { describe, expect, it } from 'vitest';
import { bodies } from './pieces';
import type { IndexedMesh } from './stl';
import { fixture } from './testing';

/** A closed box of side `size` about the origin; `inside` turns its faces in, as a void's are. */
function box(size: number, inside = false, offset = 0): IndexedMesh {
  const h = size / 2;
  const positions: number[] = [];
  for (let i = 0; i < 8; i++) positions.push((i & 1 ? h : -h) + offset, i & 2 ? h : -h, i & 4 ? h : -h);
  // outward, counter-clockwise from outside
  const quads = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const indices: number[] = [];
  for (const [a, b, c, d] of quads) indices.push(a, b, c, a, c, d);
  if (inside) for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function merge(...meshes: IndexedMesh[]): IndexedMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const mesh of meshes) {
    const base = positions.length / 3;
    positions.push(...mesh.positions);
    for (const index of mesh.indices) indices.push(base + index);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

describe('bodies', () => {
  it('one piece is one body', () => {
    expect(bodies(box(10))).toBe(1);
    expect(bodies(fixture('pot-handle'))).toBe(1);
    expect(bodies(fixture('teapot-hollow'))).toBe(1);
  });

  it('a closed void is not a body', () => {
    expect(bodies(merge(box(40), box(20, true)))).toBe(1);
  });

  it('the piece and its lid side by side are two', () => {
    expect(bodies(merge(box(10), box(10, false, 30)))).toBe(2);
    expect(bodies(fixture('teapot-lid-beside'))).toBe(2);
  });
});
