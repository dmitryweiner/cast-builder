import { describe, expect, it } from 'vitest';
import { encodeSTL, parseSTL, weld } from './stl';
import { fixture, revolveMesh, withNormals } from './testing';
import { validateMesh } from './validate';

const ascii = (text: string) => new TextEncoder().encode(text).buffer;

describe('parseSTL', () => {
  it('reads back what encodeSTL wrote, with shared vertices', () => {
    const solid = revolveMesh((v) => 10 + 5 * v, { height: 20 });
    const back = parseSTL(encodeSTL(solid));
    expect(back.indices.length).toBe(solid.indices.length);
    expect(back.positions.length).toBe(solid.positions.length);
    expect(validateMesh(withNormals(back)).watertight).toBe(true);
  });

  it('reads ASCII STL', () => {
    const mesh = parseSTL(
      ascii(`solid t
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 1 0
      vertex 1 0 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 0 1
    endloop
  endfacet
endsolid t`),
    );
    expect(mesh.indices.length).toBe(6);
    expect(mesh.positions.length).toBe(4 * 3);
  });

  it('takes a binary file whose header starts with "solid" as binary', () => {
    const solid = revolveMesh((v) => 10 + v, { height: 5 });
    const data = encodeSTL(solid);
    new TextEncoder().encodeInto('solid exported by some CAD', new Uint8Array(data, 0, 80));
    expect(parseSTL(data).indices.length).toBe(solid.indices.length);
  });

  it('refuses what is not STL', () => {
    expect(() => parseSTL(ascii('hello'))).toThrow('neither binary nor ASCII');
    expect(() => parseSTL(new ArrayBuffer(10))).toThrow('neither binary nor ASCII');
    expect(() => parseSTL(ascii('solid empty\nendsolid'))).toThrow('no triangles');
  });

  it('reads the fixtures as closed solids', () => {
    for (const name of ['bowl', 'pot-handle', 'teapot', 'lid-upside-down', 'cup-hollow']) {
      const report = validateMesh(withNormals(fixture(name)));
      expect(report.watertight, name).toBe(true);
      expect(report.volume, name).toBeGreaterThan(0);
    }
  });
});

describe('weld', () => {
  it('merges equal corners, +0 and −0 included, and drops collapsed triangles', () => {
    const soup = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, -0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1]);
    const mesh = weld(soup);
    expect(mesh.positions.length / 3).toBe(4);
    expect(mesh.indices.length).toBe(6);
  });
});
