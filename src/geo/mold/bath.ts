// A pour box for silicone.
//
// The printed part is formwork with the POSITIVE of a plaster block already
// built in. Silicone is poured, sets round the positive, comes off — a
// silicone negative of the block. Plaster poured into it gives the working
// part of the mold. Hence a union, not a subtraction: the positive must
// physically stand inside the box, or the silicone has nothing to flow round.
//
// The block lies working surface UP. Silicone poured from above comes off
// vertically, and the imprint of the piece leaves in its own pull direction —
// the one the analyzer chose.

import type { Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from 'maker-kit/csg/manifold';
import type { BlockPart } from './block';
import type { MoldState } from './state';
import { undersideVoid } from './underside';

/** Turns the block so its working surface looks up. */
function faceUp(part: BlockPart, scope: CsgScope): Manifold {
  if (part.pull === 'up') return part.solid;
  if (part.pull === 'down') return scope.keep(part.solid.rotate([180, 0, 0]));
  // the parting plane y = 0 becomes the top: the body goes under it
  return scope.keep(part.solid.rotate([part.pull === '+y' ? -90 : 90, 0, 0]));
}

/** A pour box round one part of the mold; stands with its bottom on z = 0. */
export function buildBath(csg: CsgApi, scope: CsgScope, part: BlockPart, mold: MoldState): Manifold {
  const oriented = faceUp(part, scope);
  const box = oriented.boundingBox();
  const positive = scope.keep(oriented.translate([-(box.min[0] + box.max[0]) / 2, -(box.min[1] + box.max[1]) / 2, -box.min[2]]));

  const width = box.max[0] - box.min[0];
  const depth = box.max[1] - box.min[1];
  const height = box.max[2] - box.min[2];

  const clear = mold.bathClearMm;
  const wall = mold.bathWallMm;
  const innerX = width + 2 * clear;
  const innerY = depth + 2 * clear;
  const innerZ = height + clear;

  const outer = scope.keep(
    csg.Manifold.cube([innerX + 2 * wall, innerY + 2 * wall, innerZ + wall], true).translate([0, 0, (innerZ + wall) / 2 - wall]),
  );
  // the box is open at the top: its cavity is cut through the top face
  const cavity = scope.keep(csg.Manifold.cube([innerX, innerY, innerZ + wall], true).translate([0, 0, (innerZ + wall) / 2]));
  const shell = scope.keep(outer.subtract(cavity));
  const whole = scope.keep(csg.Manifold.union([shell, positive]));
  // under the positive — a void down to the table: silicone needs only the
  // working surface, not a solid block of plastic under it
  const hollow = undersideVoid(csg, scope, positive, wall, wall);
  const bath = hollow ? scope.keep(whole.subtract(hollow)) : whole;

  // after the assembly everything goes down so the box's bottom lies on the table
  return scope.keep(bath.translate([0, 0, wall]));
}
