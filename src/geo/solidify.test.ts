import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from './csg';
import { CsgScope, initCSG, toManifold } from './csg';
import { IDENTITY_TURN, defaultOrientation, flip, placeModel } from './model';
import { guessMouth } from './mouth';
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

  it('finds the mouth of a hollow teapot at the rim, not at the higher tip of the spout', () => {
    const result = solidify(csg, scope, solidOf('teapot-hollow'));
    expect(solidOf('teapot-hollow').boundingBox().max[2]).toBeGreaterThan(124);
    expect(result.rim?.zMm).toBeCloseTo(120, 1);
    // the outer radius of the rim: the body's vertices near the top, the spout left out
    const { positions } = placeModel(fixture('teapot-hollow'), defaultOrientation());
    let rim = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i], positions[i + 1]);
      if (positions[i + 2] > 118 && r < 80) rim = Math.max(rim, r);
    }
    expect(result.rim?.radiusMm).toBeCloseTo(rim, 0);
  });

  it('fills a hollow teapot: the spout tip, a planar cut, is capped too', () => {
    const teapot = solidOf('teapot-hollow');
    expect(teapot.genus()).toBe(1);
    const result = solidify(csg, scope, teapot);
    expect(result.status).toBe('filled');
    expect(result.solid.genus()).toBe(0);
    expect(result.solid.decompose().map((shell) => scope.keep(shell))).toHaveLength(1);
    // The solid twin of the fixture (clayform 710c979, buildSolidVessel with
    // the parameters of scripts/fixtures.mjs) weighs 1 904 740 mm³; the
    // rounded rim takes a little off.
    expect(result.solid.volume()).toBeGreaterThan(1904740 * 0.99);
    expect(result.solid.volume()).toBeLessThan(1904740 * 1.01);
    // the outside stays where it was
    const before = teapot.boundingBox();
    const after = result.solid.boundingBox();
    for (let axis = 0; axis < 3; axis++) {
      expect(after.min[axis]).toBeCloseTo(before.min[axis], 3);
      expect(after.max[axis]).toBeCloseTo(before.max[axis], 3);
    }
  });

  it('caps a planar side opening, but leaves a recess under the foot', () => {
    // a box open at the top, a hole through its side, a recess in the bottom
    const box = scope.keep(csg.Manifold.cube([60, 60, 60]).translate([-30, -30, 0]));
    const cavity = scope.keep(csg.Manifold.cube([52, 52, 70]).translate([-26, -26, 6]));
    const side = scope.keep(csg.Manifold.cylinder(20, 5, 5, 32).rotate([0, 90, 0]).translate([20, 0, 30]));
    const recess = scope.keep(csg.Manifold.cylinder(4, 20, 20, 64).translate([0, 0, -1]));
    const model = scope.keep(csg.Manifold.difference([box, cavity, side, recess]));
    const result = solidify(csg, scope, model);
    expect(result.status).toBe('filled');
    const recessMm3 = scope.keep(box.intersect(recess)).volume();
    // the lids stand a hair (0.15 mm) under the rims and leave dents that deep
    const dentsMm3 = 0.15 * (52 * 52 + scope.keep(csg.CrossSection.circle(5, 32)).area());
    expect(result.solid.volume()).toBeCloseTo(60 ** 3 - recessMm3 - dentsMm3, -1);
  });

  it('fills a printed lid turned over into the solid lid, its skirt end the mouth', () => {
    const upsideDown = { turn: flip(IDENTITY_TURN), spinDeg: 0 };
    const lid = scope.keep(toManifold(csg, placeModel(fixture('lid-printed'), upsideDown)));
    const result = solidify(csg, scope, lid);
    expect(result.status).toBe('filled');
    const solidLid = solidOf('lid-upside-down');
    expect(result.solid.volume()).toBeGreaterThan(solidLid.volume() * 0.99);
    expect(result.solid.volume()).toBeLessThan(solidLid.volume() * 1.01);
    const skirt = guessMouth(placeModel(fixture('lid-upside-down'), defaultOrientation()));
    expect(result.rim?.zMm).toBeCloseTo(skirt.zMm, 1);
    expect(result.rim?.radiusMm).toBeCloseTo(skirt.radiusMm, 0);
  });

  it('tells a lid as printed, open at the bottom, from a solid foot with a recess', () => {
    expect(solidify(csg, scope, solidOf('lid-printed')).status).toBe('openBottom');
    const body = scope.keep(csg.Manifold.cylinder(30, 40, 40, 64));
    const recess = scope.keep(csg.Manifold.cylinder(4, 30, 30, 64).translate([0, 0, -1]));
    expect(solidify(csg, scope, scope.keep(body.subtract(recess))).status).toBe('solid');
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
