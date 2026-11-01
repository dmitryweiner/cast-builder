import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from './csg';
import { CsgScope, initCSG, toManifold } from './csg';
import { defaultOrientation, placeModel } from './model';
import { solidify } from './solidify';
import { fixture } from './testing';

let csg: CsgApi;
const scope = new CsgScope();
beforeAll(async () => {
  csg = await initCSG();
});
afterAll(() => scope.dispose());

const solidOf = (name: string) => scope.keep(toManifold(csg, placeModel(fixture(name), defaultOrientation())));

describe('solidify', () => {
  it('leaves a solid model as it is', () => {
    const pot = solidOf('pot');
    const result = solidify(csg, scope, pot);
    expect(result.status).toBe('solid');
    expect(result.solid).toBe(pot);
  });

  it('fills a hollow cup up to the rim and reports the rim', () => {
    const cup = solidOf('cup-hollow');
    const result = solidify(csg, scope, cup);
    expect(result.status).toBe('filled');
    // the filled cup weighs about as much as the solid one
    const solidCup = solidOf('cup');
    expect(result.solid.volume()).toBeGreaterThan(solidCup.volume() * 0.97);
    expect(result.solid.volume()).toBeLessThan(solidCup.volume() * 1.03);
    expect(result.solid.decompose().map((shell) => scope.keep(shell))).toHaveLength(1);
    const box = cup.boundingBox();
    expect(result.rim?.zMm).toBeCloseTo(box.max[2], 3);
    const { positions } = placeModel(fixture('cup-hollow'), defaultOrientation());
    let rim = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 2] > box.max[2] - 1) rim = Math.max(rim, Math.hypot(positions[i], positions[i + 1]));
    }
    expect(result.rim?.radiusMm).toBeCloseTo(rim, 0);
  });

  it('drops a closed void inside a model', () => {
    const outer = scope.keep(csg.Manifold.cube([40, 40, 40], true));
    const inner = scope.keep(csg.Manifold.cube([20, 20, 20], true));
    const hollow = scope.keep(outer.subtract(inner));
    const result = solidify(csg, scope, hollow);
    expect(result.status).toBe('filled');
    expect(result.solid.volume()).toBeCloseTo(40 ** 3, 0);
  });

  it('reports a hollow model with a second opening as open', () => {
    // a tube open at both ends: the lid on top cannot close the inside
    const outer = scope.keep(csg.Manifold.cylinder(60, 30, 30, 64));
    const inner = scope.keep(csg.Manifold.cylinder(80, 26, 26, 64).translate([0, 0, -10]));
    const result = solidify(csg, scope, scope.keep(outer.subtract(inner)));
    expect(result.status).toBe('open');
  });
});
