// A tile mold: one part for a flat plate with relief — a keychain, a tile, a
// medallion.
//
// The tile lies on the table as the model is placed: its face (the relief)
// up, its back down on z = 0. The mold is the negative: the tile turned over
// (half a turn about x — never mirrored, the letters must read right on the
// fired piece) and sunk into a block. The clay is pressed in, scraped flush
// with the rim, and the tile is turned out. No punch, no ears, no vents: a
// vent in the floor would leave a nub on the face.
//
// The block is the tile's shadow grown by a land a scraper rides on. A
// through hole of the tile (the keychain's ring) becomes a post up to the
// rim. The back stands a little proud of the rim: coincident faces are the
// worst input of a boolean operation, and the scraper takes those 0.2 mm off.
//
// Only the worker imports this module: it needs the CSG.

import type { Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from './csg';

/** The land round the cavity, mm: a scraper rides on it. */
export const TILE_LAND_MM = 10;
/** How far the back of the tile stands over the rim, mm. */
export const TILE_PROUD_MM = 0.2;

/**
 * The mold of a tile standing back down on z = 0 (scaled already), on the
 * bed: its flat bottom on z = 0, the cavity up, `floorMm` under the face.
 */
export function buildTileMold(csg: CsgApi, scope: CsgScope, tile: Manifold, floorMm: number): Manifold {
  const top = tile.boundingBox().max[2];
  // half a turn about x: the face down at z = floor, the back up at z = top + floor
  const turned = scope.keep(scope.keep(tile.rotate([180, 0, 0])).translate([0, 0, top + floorMm]));
  // the outline only: a hole through the tile is a post of the mold, not a hole through it
  const outer = scope
    .keep(turned.project())
    .toPolygons()
    .filter((ring) => signedArea(ring) > 0);
  const land = scope.keep(scope.keep(new csg.CrossSection(outer, 'Positive')).offset(TILE_LAND_MM, 'Round'));
  const block = scope.keep(land.extrude(top + floorMm - TILE_PROUD_MM));
  return scope.keep(block.subtract(turned));
}

function signedArea(ring: readonly (readonly number[])[]): number {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    twice += ax * by - bx * ay;
  }
  return twice / 2;
}
