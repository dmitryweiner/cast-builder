import { describe, expect, it } from 'vitest';
import { bedGrid, thumbAxes } from './guides';

describe('bedGrid', () => {
  it('is a square of whole decimetres with a margin round the tooling, 1 cm cells', () => {
    expect(bedGrid(240, 170)).toEqual({ sizeMm: 400, cellMm: 10 });
  });

  it('is never smaller than a small printer', () => {
    expect(bedGrid(30, 20)).toEqual({ sizeMm: 200, cellMm: 10 });
  });

  it('takes larger cells under large tooling, so the lines stay apart', () => {
    // two pour boxes of a teapot side by side
    const grid = bedGrid(900, 256);
    expect(grid.sizeMm).toBeGreaterThanOrEqual(900 * 1.2);
    expect(grid.sizeMm / grid.cellMm).toBeLessThanOrEqual(60);
    expect(grid.sizeMm % grid.cellMm).toBe(0);
    expect([20, 50, 100]).toContain(grid.cellMm);
  });
});

describe('thumbAxes', () => {
  // a teapot: the spout to +x, the axis through the origin, the bottom on z = 0
  const axes = thumbAxes([-90, -85, 0], [150, 85, 154]);
  const byName = Object.fromEntries(axes.map((axis) => [axis.name, axis]));

  it('draws X, Y and Z', () => {
    expect(axes.map((axis) => axis.name)).toEqual(['x', 'y', 'z']);
  });

  it('runs X and Y through the axis of the piece on the floor, beyond the piece both ways', () => {
    const x = byName.x;
    const y = byName.y;
    expect(x?.from[0]).toBeLessThan(-90);
    expect(x?.to[0]).toBeGreaterThan(150);
    expect([x?.from[1], x?.from[2], x?.to[1], x?.to[2]]).toEqual([0, 0, 0, 0]);
    expect(y?.from[1]).toBeLessThan(-85);
    expect(y?.to[1]).toBeGreaterThan(85);
    expect([y?.from[0], y?.from[2], y?.to[0], y?.to[2]]).toEqual([0, 0, 0, 0]);
  });

  it('raises Z from the floor along the axis to above the top', () => {
    const z = byName.z;
    expect(z?.from).toEqual([0, 0, 0]);
    expect(z?.to[0]).toBe(0);
    expect(z?.to[1]).toBe(0);
    expect(z?.to[2]).toBeGreaterThan(154);
  });

  it('reaches as far past the piece on every axis', () => {
    const x = byName.x;
    const z = byName.z;
    if (!x || !z) throw new Error('no axes');
    expect(x.to[0] - 150).toBeCloseTo(z.to[2] - 154);
    expect(-90 - x.from[0]).toBeCloseTo(z.to[2] - 154);
  });
});
