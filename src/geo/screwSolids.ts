// The slump mold's screw clamps as solids: the threaded rod (a screw's
// thread, or grown by the fit, the core of a threaded hole), the printed
// screw and the stop. Worker only; the sizes come from thread.ts.

import type { Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from './csg';
import type { ThreadForm } from './thread';
import { PAD, SCREW, THREAD, threadSection } from './thread';

/**
 * A threaded rod from z0 to z1 along z: the thread's section extruded with
 * a twist of 360° per pitch, a slice per point of the section and turn, so
 * its vertices run along the helix. The section at z0 is the section of
 * `threadSection`: rods started a whole number of pitches apart are in phase.
 */
export function threadRod(csg: CsgApi, scope: CsgScope, form: ThreadForm, grow: number, z0: number, z1: number, n: number): Manifold {
  const turns = (z1 - z0) / form.pitch;
  const section = scope.keep(new csg.CrossSection([threadSection(form, grow, n)], 'Positive'));
  const rod = scope.keep(section.extrude(z1 - z0, Math.max(1, Math.round(turns * n)), 360 * turns));
  return scope.keep(rod.translate([0, 0, z0]));
}

/**
 * The printed screw in its own frame: the head from z = −headH to 0, the
 * shank from 0 to `shank`. The head is knurled for the fingers and slotted
 * for a screwdriver or a coin (the slot is at its outer end, on the bed
 * when it prints standing on its head); the tip is chamfered at 45° to find
 * the thread and to sit in the stop's dimple.
 */
export function screwSolid(csg: CsgApi, scope: CsgScope, n: number): Manifold {
  const R = THREAD.d / 2;
  const headR = SCREW.headD / 2;
  // knurls: half-round grooves round the rim, about 2.5 mm apart
  const knurls = Math.max(8, Math.round((Math.PI * SCREW.headD) / 2.5));
  const disc = scope.keep(csg.CrossSection.circle(headR, Math.max(n, knurls * 4)));
  const grooves = Array.from({ length: knurls }, (_, i) => {
    const a = (2 * Math.PI * i) / knurls;
    return scope.keep(scope.keep(csg.CrossSection.circle(0.8, 12)).translate([headR * Math.cos(a), headR * Math.sin(a)]));
  });
  const knurled = scope.keep(disc.subtract(scope.keep(csg.CrossSection.union(grooves))));
  const headSolid = scope.keep(scope.keep(knurled.extrude(SCREW.headH)).translate([0, 0, -SCREW.headH]));
  const slot = scope.keep(
    csg.Manifold.cube([SCREW.headD + 2, SCREW.slotW, SCREW.slotDepth + 1], true).translate([
      0,
      0,
      -SCREW.headH + (SCREW.slotDepth - 1) / 2,
    ]),
  );
  const head = scope.keep(headSolid.subtract(slot));

  // the thread starts inside the head, so the two never meet on a plane
  const thread = threadRod(csg, scope, THREAD, 0, -0.5, SCREW.shank, n);
  const chamfer = R + 0.5 - SCREW.tipR;
  const outline = scope.keep(
    new csg.CrossSection(
      [
        [
          [0, -1],
          [R + 0.5, -1],
          [R + 0.5, SCREW.shank - chamfer],
          [SCREW.tipR, SCREW.shank],
          [0, SCREW.shank],
        ],
      ],
      'Positive',
    ),
  );
  const shank = scope.keep(thread.intersect(scope.keep(outline.revolve(n))));
  return scope.keep(head.add(shank));
}

/**
 * The stop in its printing position: a disc from z = 0 to `h` with a 45°
 * conical dimple in its underside, a boss on top. Turned over it goes into
 * the gap: the boss up into the petal's hole, the dimple over the lug's
 * thread for the tip of the screw coming from below.
 */
export function padSolid(csg: CsgApi, scope: CsgScope, n: number): Manifold {
  const R = PAD.d / 2;
  const mouth = PAD.dimpleD / 2;
  const bottom = mouth - PAD.dimpleDepth;
  const boss = PAD.bossD / 2;
  const top = PAD.h + PAD.bossH;
  const outline = scope.keep(
    new csg.CrossSection(
      [
        [
          [0, PAD.dimpleDepth],
          [bottom, PAD.dimpleDepth],
          [mouth, 0],
          [R, 0],
          [R, PAD.h],
          [boss, PAD.h],
          [boss, top],
          [0, top],
        ],
      ],
      'Positive',
    ),
  );
  return scope.keep(outline.revolve(Math.max(n, 48)));
}
