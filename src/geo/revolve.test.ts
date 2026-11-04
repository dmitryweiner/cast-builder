import { describe, expect, it } from 'vitest';
import { defaultOrientation, placeModel } from './model';
import { farthestHit, meshSource, MIN_RADIUS_MM } from './revolve';
import { fixture, revolveMesh } from './testing';
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

  it('the silhouette is smooth: rings of relief stay on the surface, not in the mean radius', () => {
    // throwing rings outside, 0.5 mm deep every 4.5 mm, and a rounded lip: the last millimetre comes in by 1.2 mm
    const H = 50;
    const shape = (v: number): number => 30 + 12 * v - 1.2 * Math.max(0, 1 - (1 - v) * H) ** 2;
    const ringed = (v: number): number => shape(v) + 0.5 * Math.max(0, Math.sin((2 * Math.PI * v * H) / 4.5));
    const source = meshSource(revolveMesh(ringed, { nu: 64, nv: 500, height: H }), 32, 384);
    // away from the lip: within 3σ of it the smoothing rounds the lip itself
    let ripple = 0;
    for (let i = 1; i < 200; i++) {
      const v = 0.05 + (0.8 * i) / 200;
      // the rings' mean over a period is a quarter of their depth over the bare shape
      ripple = Math.max(ripple, Math.abs(source.radiusAt(v) - shape(v) - 0.5 / Math.PI));
    }
    expect(ripple).toBeLessThan(0.03);
    // the ends stay where they are: the rim and the foot are not pulled in by the smoothing
    // (the end rows are sampled 0.05 mm inside, on the lip that is 0.1 mm)
    expect(Math.abs(source.radiusAt(1) - ringed(1))).toBeLessThan(0.15);
    expect(Math.abs(source.radiusAt(0) - ringed(0))).toBeLessThan(0.15);
    // the relief is measured from the smooth silhouette (by the lip that is rounded off a little too)
    expect(source.outwardMm).toBeGreaterThan(0.3);
    expect(source.outwardMm).toBeLessThan(0.8);
  });

  it('a ray through the common end of two segments hits them', () => {
    // a slice of a real bowl from clayform: a point on the ray's line, the end
    // of both segments, which rounding put a hair outside each of them
    const segments = [
      -7.43557018604289e-15, -40.367006817366, -1.1600088284884242, -40.121933114095526, 1.0603201951561783, -40.61589459097371,
      -7.43557018604289e-15, -40.367006817366,
    ];
    const u = (3 * Math.PI) / 2;
    expect(farthestHit(segments, Math.cos(u), Math.sin(u))).toBeCloseTo(40.367, 3);
  });

  it('measures how deep the outside catches: how much narrower it is above its widest point below', () => {
    // a pot: a straight wall 40 mm, then a shoulder in to a neck 10 mm narrower
    const pot = (v: number) => (v < 0.5 ? 40 : Math.max(30, 40 - 40 * (v - 0.5)));
    expect(meshSource(revolveMesh(pot, { nu: 64, nv: 32, height: 80 }), 64, 40).catchMm).toBeCloseTo(10, 0);
    expect(meshSource(revolveMesh(cone, { nu: 64, nv: 32, height: 80 }), 64, 40).catchMm).toBeLessThan(0.05);
  });

  it('a hollow piece catches by its outside only, and the rounding of its rim is no catch', () => {
    // the printable cup: its inside looks up, its rim is rounded off by half the wall
    const source = meshSource(placeModel(fixture('cup-hollow'), defaultOrientation()), 128, 128);
    expect(source.catchMm).toBeLessThan(0.5);
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
