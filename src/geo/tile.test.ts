import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import type { CsgApi } from './csg';
import { CsgScope, fromManifold, initCSG, toManifold } from './csg';
import { defaultOrientation, placeModel } from './model';
import { fixture } from './testing';
import { validateMesh } from './validate';
import { TILE_KEY_R_MM, TILE_PROUD_MM, TILE_SKIRT_LIFT_MM, buildTileMold, buildTileParts, tileCutZ } from './tile';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

const FLOOR = 3;
const LAND = 6;
const WALL = 3;
const FIT = 0.2;

/** A plate 40 × 30, `thick` mm, with a block of relief `relief` mm high on its face: two flat faces over the back. */
function steppedTile(scope: CsgScope, thick: number, relief: number): Manifold {
  const plate = scope.keep(csg.Manifold.cube([40, 30, thick]));
  const boss = scope.keep(csg.Manifold.cube([10, 10, relief]).translate([15, 10, thick]));
  return scope.keep(plate.add(boss));
}

describe('tileCutZ', () => {
  it('cuts the cavity at its share of the depth: 0 % at the face, 100 % at the rim', () => {
    const scope = new CsgScope();
    try {
      // a plain plate 4 mm: the cavity from the face at the floor to the rim, 0.2 under the back
      const mesh = fromManifold(scope.keep(csg.Manifold.cube([40, 30, 4])));
      const rim = FLOOR + 4 - TILE_PROUD_MM;
      expect(tileCutZ(mesh, FLOOR, 50)).toBeCloseTo((FLOOR + rim) / 2, 6);
      expect(tileCutZ(mesh, FLOOR, 25)).toBeCloseTo(FLOOR + 0.25 * (rim - FLOOR), 6);
    } finally {
      scope.dispose();
    }
  });

  it('moves the cut up off a flat face of the tile lying in it', () => {
    const scope = new CsgScope();
    try {
      // the plate 3 mm and a boss 2 mm: turned over, the face of the plate stands 2 mm over the boss's top
      const mesh = fromManifold(steppedTile(scope, 3, 2));
      const rim = FLOOR + 5 - TILE_PROUD_MM;
      const plateFace = FLOOR + 2;
      // the share that would put the cut right on the plate's face
      const pct = (100 * (plateFace - FLOOR)) / (rim - FLOOR);
      const z = tileCutZ(mesh, FLOOR, pct);
      expect(z).toBeGreaterThan(plateFace + 0.05);
      expect(z).toBeLessThan(plateFace + 0.2);
      // a share clear of every flat face is kept as it is
      expect(tileCutZ(mesh, FLOOR, 70)).toBeCloseTo(FLOOR + 0.7 * (rim - FLOOR), 6);
    } finally {
      scope.dispose();
    }
  });
});

describe('buildTileParts', () => {
  /** The keychain as placed, its mold whole and cut at the middle of the cavity. */
  function keychain(scope: CsgScope) {
    const model = placeModel(fixture('keychain'), defaultOrientation());
    const tile = scope.keep(toManifold(csg, model, { merge: true }));
    const cutZ = tileCutZ(model, FLOOR, 50);
    const whole = buildTileMold(csg, scope, tile, FLOOR, LAND);
    const { base, frame } = buildTileParts(csg, scope, tile, FLOOR, LAND, { zMm: cutZ, wallMm: WALL, fitMm: FIT });
    return { tile, cutZ, whole, base, frame, rim: tile.boundingBox().max[2] + FLOOR - TILE_PROUD_MM };
  }

  it('two closed parts of one piece each: the base up to the cut, the frame from the skirt’s edge to the rim', () => {
    const scope = new CsgScope();
    try {
      const { cutZ, base, frame, rim } = keychain(scope);
      for (const part of [base, frame]) {
        expect(validateMesh(fromManifold(part)).watertight).toBe(true);
        expect(part.decompose().map((piece) => scope.keep(piece)).length).toBe(1);
      }
      expect(frame.boundingBox().min[2]).toBeCloseTo(TILE_SKIRT_LIFT_MM, 4);
      expect(frame.boundingBox().max[2]).toBeCloseTo(rim, 4);
      expect(base.boundingBox().min[2]).toBeCloseTo(0, 4);
      // the ring's post goes with the base, up to the rim: a loose piece of the frame would fall off
      expect(base.boundingBox().max[2]).toBeCloseTo(rim, 4);
      expect(scope.keep(base.slice(cutZ + 0.5)).area()).toBeGreaterThan(5);
    } finally {
      scope.dispose();
    }
  });

  it('together they are the whole mold, the skirt round the base with its fit, no overlap', () => {
    const scope = new CsgScope();
    try {
      const { cutZ, whole, base, frame } = keychain(scope);
      expect(scope.keep(base.intersect(frame)).volume()).toBeLessThan(0.01);
      const both = scope.keep(base.add(frame));
      // nothing of the mold is missing: the cavity is the same
      expect(scope.keep(whole.subtract(both)).volume()).toBeLessThan(0.01);
      // the skirt stands off the base's side by the fit, all round
      const outline = scope.keep(base.project());
      const near = scope.keep(scope.keep(outline.offset(FIT - 0.05, 'Round')).extrude(cutZ));
      const far = scope.keep(scope.keep(outline.offset(FIT + 0.05, 'Round')).extrude(cutZ));
      expect(scope.keep(near.intersect(frame)).volume()).toBeLessThan(0.01);
      expect(scope.keep(far.intersect(frame)).volume()).toBeGreaterThan(1);
      // and is the wall thick
      const [w] = validateMesh(fromManifold(frame)).extents;
      const [baseW] = validateMesh(fromManifold(base)).extents;
      expect(w).toBeCloseTo(baseW + 2 * (FIT + WALL), 1);
    } finally {
      scope.dispose();
    }
  });

  it('the fit is the one asked: the skirt stands that far off the base', () => {
    const scope = new CsgScope();
    try {
      const medallion = scope.keep(csg.Manifold.cylinder(4, 20, 20, 96));
      const zMm = tileCutZ(fromManifold(medallion), FLOOR, 50);
      for (const fitMm of [0.1, 0.5]) {
        const { base, frame } = buildTileParts(csg, scope, medallion, FLOOR, LAND, { zMm, wallMm: WALL, fitMm });
        const outline = scope.keep(base.project());
        const grown = (by: number): Manifold => scope.keep(scope.keep(outline.offset(by, 'Round')).extrude(zMm));
        expect(scope.keep(grown(fitMm - 0.03).intersect(frame)).volume(), `${fitMm}`).toBeLessThan(0.01);
        expect(scope.keep(grown(fitMm + 0.03).intersect(frame)).volume(), `${fitMm}`).toBeGreaterThan(0.5);
      }
    } finally {
      scope.dispose();
    }
  });

  it('a round medallion: the key lets the frame on one way only', () => {
    const scope = new CsgScope();
    try {
      const medallion = scope.keep(csg.Manifold.cylinder(4, 20, 20, 96));
      const zMm = tileCutZ(fromManifold(medallion), FLOOR, 50);
      const { base, frame } = buildTileParts(csg, scope, medallion, FLOOR, LAND, { zMm, wallMm: WALL, fitMm: FIT });
      const overlap = (deg: number): number => scope.keep(base.intersect(scope.keep(frame.rotate([0, 0, deg])))).volume();
      expect(overlap(0)).toBeLessThan(0.01);
      for (const deg of [10, 90, 180]) expect(overlap(deg), `${deg}°`).toBeGreaterThan(1);
      // the lobe stands out of the round outline on one side only
      const box = base.boundingBox();
      expect(box.max[0]).toBeGreaterThan(20 + LAND + TILE_KEY_R_MM - 0.5);
      expect(box.min[0]).toBeCloseTo(-(20 + LAND), 0);
    } finally {
      scope.dispose();
    }
  });

  it('the cut through a flat face is moved off it and both parts stay closed', () => {
    const scope = new CsgScope();
    try {
      const tile = steppedTile(scope, 3, 2);
      const mesh = fromManifold(tile);
      const rim = FLOOR + 5 - TILE_PROUD_MM;
      const zMm = tileCutZ(mesh, FLOOR, (100 * 2) / (rim - FLOOR));
      const { base, frame } = buildTileParts(csg, scope, tile, FLOOR, LAND, { zMm, wallMm: WALL, fitMm: FIT });
      for (const part of [base, frame]) expect(validateMesh(fromManifold(part)).watertight).toBe(true);
      expect(base.boundingBox().max[2]).toBeCloseTo(zMm, 4);
    } finally {
      scope.dispose();
    }
  });
});
