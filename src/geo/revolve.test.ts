import { describe, expect, it } from 'vitest';
import { defaultOrientation, placeModel } from './model';
import { meshSource, MIN_RADIUS_MM } from './revolve';
import { revolveMesh } from './testing';
import type { IndexedMesh } from './stl';
import { assembleMesh, sampleGrid } from './surface';

const cone = (v: number) => 30 + 20 * v;

describe('meshSource', () => {
  it('reads the radius of a body of revolution back', () => {
    const source = meshSource(revolveMesh(cone, { nu: 128, nv: 64, height: 80 }), 64, 40);
    expect(source.heightMm).toBeCloseTo(80, 4);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      // a polygon of 128 sides is a hair inside its circle
      expect(source.radiusAt(v)).toBeCloseTo(cone(v), 0);
      expect(Math.abs(source.radiusAt(v) - cone(v))).toBeLessThan(0.05);
    }
    expect(source.outOfRoundMm).toBeLessThan(0.05);
    expect(source.floorAt).toBeUndefined();
  });

  it('lays the grid rows evenly in height, from the bottom to the top', () => {
    const source = meshSource(revolveMesh(cone, { height: 50 }), 32, 10);
    const { positions, nu, nv } = source.grid;
    for (let j = 0; j <= nv; j++) expect(positions[j * nu * 3 + 2]).toBeCloseTo((j / nv) * 50, 4);
  });

  it('takes the outermost face: a hollow piece reads as its outside', () => {
    // a cup: the outer wall plus an inner one 4 mm in, joined at the rim — an open shell is enough to sample
    const outer = sampleGrid(64, 20, (u, v, out) => {
      out[0] = 40 * Math.cos(u);
      out[1] = 40 * Math.sin(u);
      out[2] = v * 60;
    });
    const inner = sampleGrid(64, 20, (u, v, out) => {
      out[0] = 36 * Math.cos(u);
      out[1] = 36 * Math.sin(u);
      out[2] = 4 + v * 56;
    });
    const merge = (a: IndexedMesh, b: IndexedMesh): IndexedMesh => {
      const positions = new Float32Array([...a.positions, ...b.positions]);
      const offset = a.positions.length / 3;
      return { positions, indices: new Uint32Array([...a.indices, ...Array.from(b.indices, (i) => i + offset)]) };
    };
    const source = meshSource(merge(assembleMesh(outer, 'both'), assembleMesh(inner, 'none')), 32, 12);
    for (const v of [0.2, 0.5, 0.9]) expect(source.radiusAt(v)).toBeCloseTo(40, 0);
  });

  it('measures the relief and how far the piece is from round', () => {
    const wavy = sampleGrid(96, 24, (u, v, out) => {
      const r = 40 + 3 * Math.sin(6 * u);
      out[0] = r * Math.cos(u);
      out[1] = r * Math.sin(u);
      out[2] = v * 60;
    });
    const source = meshSource(placeModel(assembleMesh(wavy, 'both'), defaultOrientation()), 96, 24);
    expect(source.outwardMm).toBeGreaterThan(2.5);
    expect(source.outwardMm).toBeLessThan(3.2);
    expect(source.outOfRoundMm).toBeGreaterThan(5);
  });

  it('reads a recessed mark under the bottom as relief of the floor', () => {
    // a cylinder whose bottom has a 1 mm dimple round (10, 0)
    const grid = sampleGrid(96, 16, (u, v, out) => {
      out[0] = 40 * Math.cos(u);
      out[1] = 40 * Math.sin(u);
      out[2] = v * 50;
    });
    const solid = assembleMesh(grid, 'top');
    // the bottom: a fine triangulated disc lifted where the mark is
    const n = 80;
    const bottom: number[] = [];
    const tris: number[] = [];
    const base = solid.positions.length / 3;
    const lift = (x: number, y: number) => (Math.hypot(x - 10, y) < 5 ? 1 : 0);
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = -30 + (60 * i) / n;
        const y = -30 + (60 * j) / n;
        bottom.push(x, y, lift(x, y));
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        // down-facing: clockwise seen from above
        tris.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    }
    const mesh: IndexedMesh = {
      positions: new Float32Array([...solid.positions, ...bottom]),
      indices: new Uint32Array([...solid.indices, ...tris]),
    };
    const source = meshSource(mesh, 96, 16);
    expect(source.floorAt).toBeDefined();
    expect(source.floorAt?.(10, 0)).toBeCloseTo(1, 3);
    expect(source.floorAt?.(-15, 0)).toBeCloseTo(0, 3);
  });

  it('never lets the surface reach the axis', () => {
    const source = meshSource(
      revolveMesh((v) => 20 * (1 - v) + 0.01, { height: 30 }),
      32,
      10,
    );
    const { positions } = source.grid;
    for (let k = 0; k < positions.length; k += 3)
      expect(Math.hypot(positions[k], positions[k + 1])).toBeGreaterThanOrEqual(MIN_RADIUS_MM - 1e-4);
  });
});
