// The slump mold's screw clamps as solids: the threaded rod (a screw's
// thread, or grown by the fit, the core of a threaded hole), the printed
// screw and the stop. Worker only; the sizes come from thread.ts.

import type { CrossSection, Manifold } from 'manifold-3d';
import type { CsgApi, CsgScope } from './csg';
import type { ScrewLayout } from './press';
import { BOSS_R_MM } from './press';
import type { ThreadForm } from './thread';
import { CLEAR_HOLE_MM, PAD, SCREW, THREAD, THREAD_FIT_MM, THREAD_SLICES, threadSection } from './thread';

/** Segments of a full turn for the cavity a lug keeps out of and the columns cut off it. */
const ROUND_SEGMENTS = 192;
/** Segments of a boss. */
const BOSS_SEGMENTS = 48;
/** The plain bore under a lug's thread is this much wider than the thread's hole, mm. */
const BORE_CLEAR_MM = 0.3;

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
 * the gap: the boss up into the tab's hole, the dimple over the lug's
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

const polar = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];

/** In plan: the hull of the boss round the axis at `angle` and of the given points. */
function plan(csg: CsgApi, scope: CsgScope, layout: ScrewLayout, angle: number, points: [number, number][]): CrossSection {
  const boss = scope.keep(scope.keep(csg.CrossSection.circle(BOSS_R_MM, BOSS_SEGMENTS)).translate(polar(layout.axisMm, angle)));
  return scope.keep(csg.CrossSection.hull([boss, [points]]));
}

/** A prism of a plan from z0 to z1. */
function prism(scope: CsgScope, section: CrossSection, z0: number, z1: number): Manifold {
  return scope.keep(scope.keep(section.extrude(z1 - z0)).translate([0, 0, z0]));
}

/** A vertical cylinder round the axis from z0 to z1. */
function column(csg: CsgApi, scope: CsgScope, radius: number, z0: number, z1: number, segments = ROUND_SEGMENTS): Manifold {
  return scope.keep(csg.Manifold.cylinder(z1 - z0, radius, radius, segments).translate([0, 0, z0]));
}

/**
 * The lugs of the mold, one beside each ear (screwLayout): in plan the hull
 * of the boss and of the cheek's side down into the wall; the underside
 * rising at 45° away from the ear and kept within the ear's outline widened
 * at 45°, so it prints without supports; cut back off the cavity and off
 * the clay over the rim, with a threaded hole through it.
 */
export function lugSolids(csg: CsgApi, scope: CsgScope, layout: ScrewLayout, n: number): Manifold {
  const z0 = Math.max(0, layout.footZ - 1);
  const z1 = layout.seatZ + 1;
  // only the heights of the lugs: the whole cavity made every preview twice as slow
  const band = layout.cavity.filter((p) => p.r > 0 && p.z > z0 && p.z < z1);
  const radiusAt = (z: number): number => {
    for (let k = 1; k < layout.cavity.length; k++) {
      const a = layout.cavity[k - 1];
      const b = layout.cavity[k];
      if (a.r === 0 || b.r === 0 || z < a.z || z > b.z) continue;
      return b.z > a.z ? a.r + ((b.r - a.r) * (z - a.z)) / (b.z - a.z) : Math.max(a.r, b.r);
    }
    return layout.cavity[layout.cavity.length - 2].r;
  };
  const section: [number, number][] = [
    [0, z0],
    [radiusAt(z0), z0],
    ...band.map(({ r, z }): [number, number] => [r, z]),
    [radiusAt(z1), z1],
    [0, z1],
  ];
  const cavity = scope.keep(scope.keep(new csg.CrossSection([section], 'Positive')).revolve(ROUND_SEGMENTS));
  const clay = column(csg, scope, layout.seatInMm, layout.shelfZ, z1 + 1);
  // The thread is whole from threadZ up; under it, where the slanted
  // underside opens the hole, a plain bore: a slanted cut through the thread
  // left arches of its teeth hanging over the opening.
  const thread = threadRod(csg, scope, THREAD, THREAD_FIT_MM, layout.threadZ - 0.5, z1, n);
  const bore = column(csg, scope, THREAD.d / 2 + THREAD_FIT_MM + BORE_CLEAR_MM, z0 - 1, layout.threadZ, BOSS_SEGMENTS);
  const rod = scope.keep(thread.add(bore));
  const support = scope.keep(
    scope.keep(new csg.CrossSection([layout.support.map(({ r, z }): [number, number] => [r, z])], 'Positive')).revolve(ROUND_SEGMENTS),
  );
  const lugs = layout.angles.map((angle, i) => {
    const sideAngle = layout.ears[i] + layout.earSide;
    const side = sideAngle - layout.inCheek;
    const footprint = plan(csg, scope, layout, angle, [polar(layout.innerMm, side), polar(layout.earOuterMm - 0.5, side)]);
    // above the plane rising at 45° away from the ear's side: z − d ≥ footZ, d the distance from the side's plane
    const normal: [number, number, number] = [Math.sin(sideAngle) / Math.SQRT2, -Math.cos(sideAngle) / Math.SQRT2, Math.SQRT1_2];
    return scope.keep(prism(scope, footprint, z0, layout.seatZ).trimByPlane(normal, layout.footZ / Math.SQRT2));
  });
  const holes = layout.angles.map((angle) => scope.keep(rod.translate([...polar(layout.axisMm, angle), 0])));
  const leaning = scope.keep(scope.keep(csg.Manifold.union(lugs)).intersect(support));
  return scope.keep(csg.Manifold.difference([leaning, cavity, clay, ...holes]));
}

/**
 * What is cut off the mold round each stop: the ear's cheek rises above the
 * seat, and the boss stands in it. null when the cheeks end below the seat.
 */
export function cheekCuts(csg: CsgApi, scope: CsgScope, layout: ScrewLayout): Manifold | null {
  const top = layout.cheekZ + 2;
  if (top <= layout.seatZ) return null;
  const r = PAD.d / 2 + 0.5;
  return scope.keep(
    csg.Manifold.union(
      layout.angles.map((angle) => column(csg, scope, r, layout.seatZ, top).translate([...polar(layout.axisMm, angle), 0])),
    ),
  );
}

/**
 * The tabs of the punch, as printed (flange down): each the hull of the boss
 * and of points in the leg's side and in the flange's ring, TAB_T_MM thick
 * from the flange's top, with a plain hole. Over the clay it is cut up to the
 * flange's underside; over the slot and the cheeks of the ear — up past the
 * cheeks' top, when a thin slab brings the tab that low.
 */
export function tabSolids(csg: CsgApi, scope: CsgScope, layout: ScrewLayout): Manifold {
  const clay = column(csg, scope, layout.seatInMm, layout.tabBottomZ - 1, layout.flangeZ);
  const hole = column(csg, scope, CLEAR_HOLE_MM / 2, layout.tabBottomZ - 1, layout.tabTopZ + 1, Math.round(ROUND_SEGMENTS / 6));
  const notchTop = layout.cheekZ + 1;
  const inLeg = layout.legSide / 3;
  const tabs = layout.angles.map((angle, i) => {
    const ear = layout.ears[i];
    const side = ear + layout.legSide - inLeg;
    const section = plan(csg, scope, layout, angle, [
      polar(layout.seatInMm + 0.5, side),
      polar(layout.legOuterMm - 0.5, side),
      polar(layout.bodyMm, side),
      polar(layout.bodyMm, angle),
    ]);
    const cuts = [clay, scope.keep(hole.translate([...polar(layout.axisMm, angle), 0]))];
    if (notchTop > layout.tabBottomZ) {
      const from = ear + layout.legSide;
      const to = ear + layout.earSide + 0.02;
      const arc = Array.from({ length: 9 }, (_, k) => polar(layout.earOuterMm + 1, from + ((to - from) * k) / 8));
      const sector = scope.keep(new csg.CrossSection([[[0, 0], ...arc]], 'Positive'));
      cuts.push(prism(scope, sector, layout.tabBottomZ - 1, notchTop));
    }
    return scope.keep(csg.Manifold.difference([prism(scope, section, layout.tabBottomZ, layout.tabTopZ), ...cuts]));
  });
  // the punch is printed flange down, turned over as buildPunch turns it: y → −y, z → top − z
  return scope.keep(scope.keep(scope.keep(csg.Manifold.union(tabs)).rotate([180, 0, 0])).translate([0, 0, layout.tabTopZ]));
}
