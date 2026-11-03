# TODO-PUNCH-LEGS — the punch's legs graze the corners of the ears

Found on 2026-11-03 while testing the screw clamps (`PLAN-SCREWS.md`).
It is in `main` too and has nothing to do with the screws.

## What happens

The punch is a lathe (`buildPunch`, `geo/press.ts`): the points of the
flange's underside carry an offset by angle (`flangePoint`):

- in a leg's sector (`legDistance(u) <= legReach`) they go **down**: the
  sole onto the ear's top, the lip lower, along the ear's outer face (down to
  `lipZ`, `lipInMm`…`flangeMm`);
- between the legs the same points move **in** to the narrow flange over the
  mold's rim (`narrowMm + k · FLANGE_PACK_MM`, at `flangeZ`).

Between the last vertex of a leg and the first vertex of the narrow flange
there is one grid step in angle, and the lathe's faces slant across it. The
lip's points go from "low and out" (at the ear's outer face) to "high and
in" (over the rim), so that slanted face runs diagonally through the top
corner of the ear at the leg's angular edge. The slot (`slotReach`, one free
grid cell between the leg and the cheek) was meant to keep the leg off the
cheeks above the ear's top, but the ear's own body below its top reaches to
`reach` at every angle.

## How much

Measured with CSG: the pressed punch intersected with the mold, the bowl
fixture, grid 96, default settings — about 45 mm³ per ear, up to 1.5 mm deep,
at r ≈ `seatIn`…`ear.outerMm`, z from the ear's top down to about `lipZ`.
The sole itself lies on the ear's top exactly (no overlap there). The
current tests do not see it: `never touches the mold` skips everything past
`fit.outerMaxMm` (the legs and the flange), and no test checks the legs
against the ears.

The screw clamps' test in `src/worker/tooling.test.ts` (`the pressed punch
with its tabs never touches the mold…`) compares the overlap with and
without the clamps for that reason, instead of asking for none.

## Why it matters

A leg may not land on its ear by up to ~1.5 mm, or rubs on the ear's corner:
the slab comes out thicker than set, the punch may tilt.

## To do

- A test first: the pressed punch (no clamps) intersected with the mold has
  no volume, for every fixture, a few slabs, ear sizes and grids (96, 128,
  384). Then the clamps' test above can ask for none as well.
- A fix — options to weigh:
  - an extra flange point per leg edge, so that across the edge step the
    lip first goes **up** in place (to `flangeZ`) and only on the next step
    moves in (the order of points must stay the same at every angle, see
    `LathePoint.offset`);
  - or widen the free cell between the leg and the ear's side to two steps,
    so the slanted face clears the ear (the leg's reach, `legSpan`, and the
    slot, `slotReach`, in `slumpEars`);
  - check the leg's sole still covers its seat and the cheeks still guide it.
- One branch from `main`, its own PR.
