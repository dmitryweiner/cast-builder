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
// The block is the tile's shadow grown by a land a scraper rides on (its
// width the user's). A
// through hole of the tile (the keychain's ring) becomes a post up to the
// rim. The back stands a little proud of the rim: coincident faces are the
// worst input of a boolean operation, and the scraper takes those 0.2 mm off.
//
// Cut in two (plans/PLAN-TILE-CUT.md), the mold is a base — the floor with
// the relief and the cavity up to a plane — and a frame over it, the rest of
// the cavity, with a skirt hanging down round the upper half of the base,
// the lower half bare to take the stack apart by. The frame rests on the
// base, never on the table: the pressing keeps the joint shut. To free
// the tile the stack is turned over, the base lifted off its face, the frame
// off its sides. A lobe on the outline of both parts keys them, unless
// asked not to: the frame goes on one way only.
//
// Only the worker imports this module: it needs the CSG.

import type { CrossSection, Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from './csg';
import { outerOutline } from './csg';
import type { IndexedMesh } from 'maker-kit/3d/mesh';

/** How far the back of the tile stands over the rim, mm. */
export const TILE_PROUD_MM = 0.2;
/** The skirt's lower edge is never nearer the table, mm: the frame bears on the base, not on the table. */
export const TILE_SKIRT_LIFT_MM = 1;
/** The skirt is never shorter while the base allows it, mm: on a low base the key must still hold. */
export const TILE_SKIRT_MIN_MM = 2;
/** How far the cut keeps off a flat face of the tile, mm. */
const FLAT_CLEAR_MM = 0.1;
/** The key against turning: a lobe of this radius on the outline of both parts, mm. */
export const TILE_KEY_R_MM = 5;
/** A post of the base is taken this much wider than its part of the frame, into the clay round it, mm. */
const POST_GROW_MM = 0.2;

/** Where the mold of two parts is cut. */
export interface TileCut {
  /** the plane of the cut in the mold's frame, mm (`tileCutZ`) */
  zMm: number;
  /** the skirt's wall, mm */
  wallMm: number;
  /** the skirt's clearance round the base, mm of the print, radially */
  fitMm: number;
  /** the lobe on the outline that lets the frame on one way only */
  key: boolean;
}

/**
 * The mold of a tile standing back down on z = 0 (scaled already), on the
 * bed: its flat bottom on z = 0, the cavity up, `floorMm` under the face,
 * `landMm` round the cavity.
 */
export function buildTileMold(csg: CsgApi, scope: CsgScope, tile: Manifold, floorMm: number, landMm: number): Manifold {
  const { turned, land, rim } = sunk(csg, scope, tile, floorMm, landMm);
  return scope.keep(scope.keep(land.extrude(rim)).subtract(turned));
}

/**
 * The height of the cut, in the mold's frame: `pct` % of the cavity's depth
 * from the face (the floor) to the rim. `tile` is the tile as `buildTileMold`
 * takes it, back down. A flat face of the tile lying in the plane would make
 * coincident faces: the cut is moved up off it, or down where up would leave
 * the cavity.
 */
export function tileCutZ(tile: IndexedMesh, floorMm: number, pct: number): number {
  const { positions, indices } = tile;
  let top = -Infinity;
  for (let i = 2; i < positions.length; i += 3) top = Math.max(top, positions[i]);
  const rim = top + floorMm - TILE_PROUD_MM;
  // the heights of the flat faces, turned over as the mold has them
  const flats = new Set<number>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = positions[indices[t] * 3 + 2];
    const b = positions[indices[t + 1] * 3 + 2];
    const c = positions[indices[t + 2] * 3 + 2];
    if (Math.max(a, b, c) - Math.min(a, b, c) < 1e-4) flats.add(top + floorMm - a);
  }
  const clear = (start: number, step: number): number => {
    let z = start;
    for (let guard = 0; guard <= flats.size; guard++) {
      const near = [...flats].find((flat) => Math.abs(flat - z) < FLAT_CLEAR_MM);
      if (near === undefined) return z;
      z = near + step;
    }
    return z;
  };
  const z = floorMm + (pct / 100) * (rim - floorMm);
  const up = clear(z, FLAT_CLEAR_MM);
  return up < rim - FLAT_CLEAR_MM ? up : clear(z, -FLAT_CLEAR_MM);
}

/**
 * The mold cut in two at `cut.zMm`, both in the mold's frame. The base: the
 * block under the plane. The frame: the block over it and the skirt round
 * the upper half of the base, `cut.fitMm` off its side (`skirtEdge`). A post over the plane (the ring's hole) would be a loose
 * piece of the frame: it goes with the base, up to the rim.
 */
export function buildTileParts(
  csg: CsgApi,
  scope: CsgScope,
  tile: Manifold,
  floorMm: number,
  landMm: number,
  cut: TileCut,
): { base: Manifold; frame: Manifold } {
  const sunken = sunk(csg, scope, tile, floorMm, landMm);
  const { turned, rim } = sunken;
  const land = cut.key ? keyed(csg, scope, sunken.land) : sunken.land;
  const z = cut.zMm;
  const lift = skirtEdge(z);
  const outer = scope.keep(land.offset(cut.fitMm + cut.wallMm, 'Round'));
  const inner = scope.keep(land.offset(cut.fitMm, 'Round'));
  const body = scope.keep(scope.keep(outer.extrude(rim - lift)).translate([0, 0, lift]));
  // the pocket of the base reaches under the skirt's edge: no coincident faces
  const pocket = scope.keep(scope.keep(inner.extrude(z - lift + 1)).translate([0, 0, lift - 1]));
  const over = scope.keep(scope.keep(body.subtract(pocket)).subtract(turned));
  const pieces = over
    .decompose()
    .map((piece) => scope.keep(piece))
    .toSorted((a, b) => b.volume() - a.volume());
  const [frame, ...posts] = pieces;
  // a post's prism from under the plane to the rim, a little wider than the post: the clay round it takes the excess away
  const prisms = posts.map((post) =>
    scope.keep(
      scope.keep(scope.keep(scope.keep(post.project()).offset(POST_GROW_MM, 'Round')).extrude(rim - z + 1)).translate([0, 0, z - 1]),
    ),
  );
  const block = scope.keep(csg.Manifold.union([scope.keep(land.extrude(z)), ...prisms]));
  return { base: scope.keep(block.subtract(turned)), frame };
}

/**
 * Where the skirt ends, over the table, for a base cut at `cutZ`: half its
 * height, so the lower half is bare for the fingers taking the stack apart
 * — a skirt down to the table hid the whole base. On a low base the skirt
 * keeps `TILE_SKIRT_MIN_MM` for the key, but never comes nearer the table
 * than `TILE_SKIRT_LIFT_MM`.
 */
export function skirtEdge(cutZ: number): number {
  return Math.max(TILE_SKIRT_LIFT_MM, Math.min(cutZ / 2, cutZ - TILE_SKIRT_MIN_MM));
}

/**
 * The outline with the key: a lobe centred on its vertex furthest along +x,
 * half of it outside. The skirt alone lets a round tile turn and a tile
 * symmetric under a half turn go on the wrong way round; one lobe has no
 * symmetry, so the frame goes on one way only.
 */
function keyed(csg: CsgApi, scope: CsgScope, land: CrossSection): CrossSection {
  let far: readonly [number, number] = [-Infinity, 0];
  for (const ring of land.toPolygons()) for (const [x, y] of ring) if (x > far[0]) far = [x, y];
  const lobe = scope.keep(scope.keep(csg.CrossSection.circle(TILE_KEY_R_MM, 48)).translate(far));
  return scope.keep(land.add(lobe));
}

/** The tile turned over and sunk to the floor, the outline of its block and the block's rim. */
function sunk(
  csg: CsgApi,
  scope: CsgScope,
  tile: Manifold,
  floorMm: number,
  landMm: number,
): { turned: Manifold; land: CrossSection; rim: number } {
  const top = tile.boundingBox().max[2];
  // half a turn about x: the face down at z = floor, the back up at z = top + floor
  const turned = scope.keep(scope.keep(tile.rotate([180, 0, 0])).translate([0, 0, top + floorMm]));
  // the outline only: a hole through the tile is a post of the mold, not a hole through it
  const land = scope.keep(outerOutline(csg, scope, scope.keep(turned.project())).offset(landMm, 'Round'));
  return { turned, land, rim: top + floorMm - TILE_PROUD_MM };
}
