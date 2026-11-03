// The slump mold's screw clamps as solids: the threaded rod (a screw's
// thread, or grown by the fit, the core of a threaded hole), the printed
// screw and the stop. Worker only; the sizes come from thread.ts.

import type { Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from './csg';
import type { ScrewLayout } from './press';
import type { ThreadForm } from './thread';
import { CLEAR_HOLE_MM, PAD, SCREW, THREAD, THREAD_FIT_MM, THREAD_SLICES, threadSection } from './thread';

/** Segments of a full turn for the plain holes. */
const ROUND_SEGMENTS = 360;
/** A lug's sector is turned in steps of this many degrees: its faces along a dense wall cost the union time. */
const SECTOR_STEP_DEG = 3;

/**
 * A threaded rod from z0 to z1 along z: the thread's section extruded with
 * a twist of 360° per pitch, THREAD_SLICES slices per turn — its vertices
 * run along the helix. The section at z0 is the section of `threadSection`:
 * rods started a whole number of pitches apart are in phase.
 */
export function threadRod(csg: CsgApi, scope: CsgScope, form: ThreadForm, grow: number, z0: number, z1: number, n: number): Manifold {
  const turns = (z1 - z0) / form.pitch;
  const section = scope.keep(new csg.CrossSection([threadSection(form, grow, n)], 'Positive'));
  const rod = scope.keep(section.extrude(z1 - z0, Math.max(1, Math.round(turns * THREAD_SLICES)), 360 * turns));
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

/**
 * The lugs of the mold, each a sector of the layout's section revolved round
 * the axis, with a threaded hole through it along the screw's axis — the
 * clamping screw's tip comes out below, a parting screw goes in from below.
 * The axis is clear of the shell (screwLayout), so a hole only ever cuts its
 * own lug: they are holed here, before they meet the shell.
 */
export function lugSolids(csg: CsgApi, scope: CsgScope, layout: ScrewLayout, n: number): Manifold {
  const section = scope.keep(new csg.CrossSection([layout.profile.map(({ r, z }): [number, number] => [r, z])], 'Positive'));
  // The section extruded along a unit "t" and bent round the axis — not
  // CrossSection.revolve: a partial revolve came out with thirty times the
  // triangles, and every boolean on the lug that much slower. The angle runs
  // from the far side so the bend keeps the orientation (normals out).
  const span = 2 * layout.halfAngle;
  const steps = Math.max(4, Math.ceil((span * 180) / Math.PI / SECTOR_STEP_DEG));
  const sector = scope.keep(
    scope.keep(section.extrude(1, steps)).warp((v) => {
      const [r, z, t] = v;
      const a = layout.halfAngle - span * t;
      v[0] = r * Math.cos(a);
      v[1] = r * Math.sin(a);
      v[2] = z;
    }),
  );
  // Along the axis the lug ends where its 45° chamfer passes the hole's inner
  // edge; lower down (on a bowl it runs to the table) the rod would only cost time.
  const reach = layout.outerMm - layout.axisMm + THREAD.d / 2 + THREAD_FIT_MM;
  const rod = threadRod(csg, scope, THREAD, THREAD_FIT_MM, layout.faceZ - reach - 1, layout.seatZ + 1, n);
  const holed = scope.keep(sector.subtract(scope.keep(rod.translate([layout.axisMm, 0, 0]))));
  const lugs = layout.angles.map((angle) => scope.keep(holed.rotate([0, 0, (angle * 180) / Math.PI])));
  return scope.keep(csg.Manifold.union(lugs));
}

/** The plain holes of the punch's petals: cylinders along the screws' axes through any height. */
export function petalHoles(csg: CsgApi, scope: CsgScope, layout: ScrewLayout): Manifold {
  const r = CLEAR_HOLE_MM / 2;
  const holes = layout.angles.map((angle) =>
    scope.keep(
      csg.Manifold.cylinder(2000, r, r, Math.round(ROUND_SEGMENTS / 6)).translate([
        layout.axisMm * Math.cos(angle),
        layout.axisMm * Math.sin(angle),
        -1000,
      ]),
    ),
  );
  return scope.keep(csg.Manifold.union(holes));
}
