import { describe, expect, it } from 'vitest';
import { arrangeOnBed } from './layout';
import type { SurfaceMesh } from 'maker-kit/3d/mesh';

/** A box w × d × 10 standing at (x, y): enough of a mesh for a layout, which reads only positions. */
function box(w: number, d: number, x = 0, y = 0): SurfaceMesh {
  const positions = new Float32Array([x, y, 0, x + w, y, 0, x + w, y + d, 0, x, y + d, 10]);
  return { positions, normals: new Float32Array(positions.length), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) };
}

function bounds(meshes: readonly SurfaceMesh[]): { x0: number; y0: number; x1: number; y1: number } {
  const out = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      out.x0 = Math.min(out.x0, mesh.positions[i]);
      out.x1 = Math.max(out.x1, mesh.positions[i]);
      out.y0 = Math.min(out.y0, mesh.positions[i + 1]);
      out.y1 = Math.max(out.y1, mesh.positions[i + 1]);
    }
  }
  return out;
}

/** Two boxes' extents apart by at least `gap` along x or along y. */
function apart(a: SurfaceMesh[], b: SurfaceMesh[], gap: number): boolean {
  const p = bounds(a);
  const q = bounds(b);
  return p.x1 + gap <= q.x0 + 1e-4 || q.x1 + gap <= p.x0 + 1e-4 || p.y1 + gap <= q.y0 + 1e-4 || q.y1 + gap <= p.y0 + 1e-4;
}

// a slump mold, its punch and two narrow columns of screws and stops
const groups = (): SurfaceMesh[][] => [[box(100, 100, -50, -50)], [box(100, 100, -50, -50)], [box(20, 60)], [box(20, 60, 7, -3)]];

describe('arrangeOnBed', () => {
  it('in a row: along x, a gap apart, fronts aligned', () => {
    const { groups: placed, widthMm, depthMm } = arrangeOnBed(groups(), 'row', 10);
    expect([widthMm, depthMm]).toEqual([270, 100]);
    const fronts = placed.map((group) => bounds(group).y0);
    expect(new Set(fronts).size).toBe(1);
    for (let i = 1; i < placed.length; i++) expect(bounds(placed[i]).x0).toBeCloseTo(bounds(placed[i - 1]).x1 + 10, 4);
  });

  it('in a column: along y, a gap apart, left edges aligned', () => {
    const { groups: placed, widthMm, depthMm } = arrangeOnBed(groups(), 'column', 10);
    expect([widthMm, depthMm]).toEqual([100, 350]);
    for (let i = 1; i < placed.length; i++) {
      expect(bounds(placed[i]).y0).toBeCloseTo(bounds(placed[i - 1]).y1 + 10, 4);
      expect(bounds(placed[i]).x0).toBeCloseTo(bounds(placed[0]).x0, 4);
    }
  });

  it('auto breaks the order into rows the way that keeps the longer side shortest, then the area', () => {
    // [mold] / [punch, screws, stops]: 160 × 210; [mold, punch] / [screws, stops] is 210 × 170 — as long, larger
    const { groups: placed, widthMm, depthMm } = arrangeOnBed(groups(), 'auto', 10);
    expect([widthMm, depthMm]).toEqual([160, 210]);
    expect(bounds(placed[1]).y0).toBeCloseTo(bounds(placed[0]).y1 + 10, 4);
    expect(bounds(placed[2]).y0).toBeCloseTo(bounds(placed[1]).y0, 4);
  });

  it('nothing overlaps, whatever the layout', () => {
    for (const place of ['row', 'column', 'auto'] as const) {
      const { groups: placed } = arrangeOnBed(groups(), place, 5);
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++) expect(apart(placed[i], placed[j], 5), place).toBe(true);
    }
  });

  it('a group moves as a whole, in plan only; the meshes given are not touched', () => {
    const given = [[box(30, 30)], [box(20, 10, 5, 40), box(20, 10, 5, 60)]];
    const { groups: placed } = arrangeOnBed(given, 'row', 10);
    const [a, b] = placed[1];
    expect(b.positions[1] - a.positions[1]).toBeCloseTo(20, 4);
    expect(b.positions[0] - a.positions[0]).toBeCloseTo(0, 4);
    expect(Array.from(a.positions.filter((_, i) => i % 3 === 2))).toEqual([0, 0, 0, 10]);
    expect(given[1][0].positions[0]).toBe(5);
  });

  it('one group stays where it is: a master on its axis', () => {
    const single = [[box(40, 40, -20, -20)]];
    const { groups: placed, widthMm, depthMm } = arrangeOnBed(single, 'auto', 10);
    expect(placed[0][0]).toBe(single[0][0]);
    expect([widthMm, depthMm]).toEqual([40, 40]);
  });
});
