# PLAN-SCREWS — screw clamps for the slump mold

Press the punch into the slump mold with screws instead of a press, and
push it back off with the same screws. Branch `slump-screws`, one PR, a
commit per milestone. Status: **questions answered, waiting for the
user's approval of the plan.**

## Decided with the user

2026-11-03, every open question below answered with the recommended option:

- **Q1:** variant A — three lugs of their own halfway between the legs; the
  legs and the ears stay as they are.
- **Q2:** M10 × 2, frozen.
- **Q3:** two checkboxes — "Screw clamps" and, under it, "Print screws and
  stops".
- **Q4:** a knurled thumb head with a slot.

## What is asked

- The punch gets plain holes in its side "petals", the mold threaded holes
  under them. The user drives screws through the punch into the mold and
  pulls the punch down without a press.
- The screws are ours: printed M10, the pitch picked for FDM, laid into the
  same STL. A checkbox says whether they are added — they are reusable,
  printed once and used with later molds.
- Stops (pads) go into the gap between the punch's petal and the mold's
  petal. To part the two, the user turns the screws in from below through
  the mold's thread; the tip pushes the pad, the pad pushes the punch. A
  small boss on top centres the pad in the punch's hole, a dimple below
  takes the screw's tip. Printed with the screws, under the same checkbox.

## Before

- The punch (`buildPunch`, a lathe) has a flange over the rim that is wide
  only in the three leg sectors; there short hooked legs go down to three
  ears under the mold's rim (`slumpEars`). The sole of a leg lands on the
  top of its ear — the depth stop that sets the slab; the lip holds the ear
  from outside and centres the punch; cheeks of a slot guide the leg.
- In a leg sector the space between the flange and the ear is the leg
  itself: there is no gap where a pad could go. The ear's seat is 4–12 mm
  radially and the leg 14 mm along the arc — too small for an M10 hole
  with walls round it.
- No CSG in the slump job: the mold and the punch are grids and a lathe,
  both grown by the shrinkage, ~1M triangles at the export grid 384.

## Proposed design (variant A, see Q1)

The legs and the ears stay as they are: they still guide the punch and stop
it at the slab's depth. The screws get **lugs of their own, halfway between
the legs** (where the vent grooves of the sole are), three of them:

```
   section through a lug, the punch pressed down

        screw head
        ┌──────┐
   ═════╧══╤╤══╧══════════  punch petal, PETAL_T = 8 mm, clearance hole Ø11
   flange  ││
           ││   ← gap PAD_H = 10 mm: the pad goes here when parting
   clay    ││┌───────┐
   ╲       ││        │  ← the lug's seat, flat
    ╲ shelf└┤ thread │
  mold ─────┤ M10    │  ← threaded through hole, ≥ 16 mm of thread
  wall      │        │
            ╲        │
             ╲───────┘  ← 45° chamfer to the wall (prints standing)
                ↑
          a screw from below when parting
```

- **Mold lug.** A sector of a profile revolved round the axis (manifold's
  `CrossSection.revolve` with an angle) fused onto the shell. Its inner
  edge follows the mold's outer rings, sunk into the wall by half a shell.
  Near the wall it is a low shelf at the height of the ears' top (the clay
  hanging over the rim lies on it, as on the ears); past `seatIn` (wall +
  slab + gap, the same rule as the ears) it rises to a flat **seat**
  exactly `PAD_H` below the petal of the pressed punch. Under the seat a
  vertical face long enough for 16 mm of thread, then a 45° chamfer back to
  the wall, so the mold still prints standing without supports.
- **Screw axis.** Radius `max(seatIn + pad radius, the widest outer ring
  below the lug + head radius + 1)`: the pad lies wholly outside the clay
  zone, and a screw turned in from below — its head too — passes the mold's
  wall on a belly-shaped model. The lug grows outwards as needed.
- **Threaded hole.** Through, along the whole lug: the clamping screw's tip
  comes out below, the parting screw goes in from below.
- **Punch petal.** A sector of the flange, flat, from the flange ring out
  past the lug's seat, with a plain Ø11 hole. In screw mode the flange is
  `PETAL_T` thick (it is ≥ 3 mm now) — the petal is a cantilever and the
  screw pulls hard on it.
- **Reusable means fixed sizes.** The pad's height cannot be "the distance
  between the petals" of each model: the slab and the ear's height change
  it, and last month's pads would not fit. So the distance is made a
  constant instead: the seat is put `PAD_H` under the petal, the petal is
  `PETAL_T` thick. The screw's length, the gap and the pad are then the
  same for every mold.
- **Shrinkage.** The mold and the punch grow by it, the screws do not: the
  lugs, petals and holes are built after the scaling, in the mm of the
  print (the flange is built `PETAL_T / (1 + s)` thick, so it prints
  `PETAL_T`). The holes are never scaled.

### The screw, the thread, the pad

- **Thread: M10 × 2** (recommended, Q2). The profile is case-constructor's:
  60°, half a pitch deep, flat crests and roots, right-hand, the section
  extruded with a twist (`thread.ts`, `screwSolids.ts` there); the radial
  fit 0.35 mm, the one its test print chose. Why 2 and not ISO 1.5: with
  both parts printed the hole is grown by the fit, so the flanks overlap by
  `pitch / 2 − fit` — 0.40 mm at 1.5, 0.65 mm at 2, 0.90 mm at 2.5. 0.4 mm
  is one bad layer from stripping under the pressing force; 2.0 gives 60 %
  more bite and still 10 layers per pitch at 0.2 mm; the core loses 6 %
  of its diameter (8.0 against 8.5 mm). 2.5 is coarser than needed and
  thins the core to 7.5. The price: a steel M10 bolt (1.5) does not fit.
- **Screw:** a knurled thumb head Ø24 × 10 mm with a slot (Q4), shank
  45 mm = petal 8 + gap 10 + 16 of thread + ~10 of travel while the clay is
  still being pressed; the tip chamfered 45°. Printed standing on its head.
- **Pad:** Ø18 × `PAD_H − 0.3` disc; on top a boss Ø10.4 × 2 mm that enters
  the petal's Ø11 hole; below a 45° conical dimple for the screw's tip.
  Printed dimple down — the cone is a 45° overhang, no supports.
- **How many:** 3 screws, 3 pads (one per lug).

### The workflow (goes to `docs/tooling.md`)

1. Slab in the mold, punch on top, three screws from above through the
   petals into the lugs; tighten them in turn until the legs stand on the
   ears.
2. To part: screws out, a pad into each gap (boss up into the petal's
   hole), screws in from below through the lugs; tighten in turn — the
   punch comes off evenly. The mold needs room under the lugs for the
   screws' heads: on a low mold stand it on a ring or two blocks.

## Open questions

- **Q1. Where the screws go.**
  A (recommended) — lugs of their own between the legs, as above. The legs
  and ears keep their job; the gap and the sizes are free.
  B — through the existing legs and ears. The ear's seat and the leg grow
  to ~18–20 mm; to make a gap for the pad the leg becomes a frame (an inner
  sole strip and the lip with a window between them under the petal), and
  the cheeks of the slot go, otherwise the pad cannot be slid into the
  window. The force goes straight into the stop (no cantilever), but the
  guiding gets worse and the leg weaker.
- **Q2. Pitch.** M10 × 2 (recommended) or ISO M10 × 1.5 (a steel bolt fits
  too, the printed thread is weaker). Whatever is picked is frozen: a later
  change makes the printed screws useless with new molds.
- **Q3. Controls.** The screws are reusable, so the next molds need the
  lugs and holes without the screws themselves. Recommended: two
  checkboxes in the slump card — "Screw clamps" (lugs, petals, holes) and,
  under it, "Print screws and stops". Or one checkbox for everything (then
  a second mold either comes with new screws or without holes).
- **Q4. The head.** A knurled thumb head with a slot, as case-constructor's
  (recommended), or wings (more torque by hand, a wider footprint).

## Milestones

### M0. Measure

- In node: `toManifold` of the export-grid (384) mold and punch, a union
  with three sectors and a subtraction of three threaded rods; the thread at
  16 / 48 points per turn. Decide from the numbers whether the preview cuts
  real threads or plain cylinders. Into "What costs what".

### M1. Thread and screw (pure + worker solids)

- `src/geo/thread.ts` — the form (M10 × pitch, depth, flanks), the section,
  points per turn by resolution, the screw and pad sizes, `PAD_H`,
  `PETAL_T`, the fit. Ported from case-constructor, trimmed to one size.
  Tests: the section's radii between minor and major (+ grow), right-hand,
  the overlap `pitch / 2 − fit` positive.
- `src/geo/screwSolids.ts` (worker only, imports `csg.ts`) — `threadSolid`,
  `screwSolid`, `threadHole`, `padSolid`. Tests with the real WASM: one
  shell each, the screw placed in a hole intersects the holed block in
  ~0 volume, the pad's boss passes the Ø11 hole.

### M2. Lugs and petals (pure layout)

- `press.ts`: `SlumpFit` gets `lugs` (angles, the screw radius, the shelf,
  seat and bottom heights, the profile following the wall) — measured by
  the mold like the ears, so the punch's petals and the mold's holes come
  from one measure. `PressOptions.screws: boolean`; in screw mode the
  flange is `PETAL_T` (after shrinkage). Pure, no CSG.
- Tests: the lugs halfway between the ears and clear of their cheeks; the
  screw axis clears every outer ring below the lug by the head's radius;
  the seat is exactly `PAD_H` under the petal of the pressed punch, for
  several slabs and shrinkages; the shelf is no higher than the ears' top;
  the thread under the seat ≥ 16 mm.

### M3. The slump job with screws

- `tooling.ts` `slumpJob`: with screws on — mold and punch to Manifold
  (in a `CsgScope`), the lugs fused on, threaded holes and clearance holes
  cut, the punch then mirrored as now; with "print" on, 3 screws and 3 pads
  after the punch in the row (`placeInRow`), screws on their heads, pads
  dimple down. A progress stage `progress.screws`.
- Tests (node, real WASM, fixtures): the STL has 2 / 8 bodies (`bodies`);
  the mold's genus grows by 3 (three through holes, no hole into the
  cavity); the cavity is untouched (its surface vertices are the same);
  each lug's hole and the petal's hole are coaxial when the punch is put
  back over the mold; the pad between seat and petal intersects neither; the
  screw and pad meshes are byte-equal for two different models and
  shrinkages (reusable). Without screws the result is exactly today's.

### M4. Settings and UI

- `MoldState`: `screws: boolean` and `printScrews: boolean` (per Q3), both
  off by default; `sanitizeMold`, idempotence tests. Additive: v1 data
  without the fields loads with the defaults and keeps the rest (a test), no
  `VERSION` bump.
- Checkboxes in the slump card (hidden in other modes), `data-i18n`, en and
  ru. jsdom tests: present only in the slump mode, the second disabled
  while the first is off, a toggle reaches the settings and the job.

### M5. Smoke, docs, AGENTS.md

- `scripts/smoke.mjs`: the slump mode with screws and print on — the
  preview arrives, the export downloads, the STL has 8 bodies.
- `docs/tooling.md`: screws and stops — sizes, the workflow above, print
  advice (screws standing on their heads, 100 % infill or 5+ walls; the
  pitch and the fit are fixed for compatibility).
- `AGENTS.md`: the layout (`thread.ts`, `screwSolids.ts`), an invariant
  ("screws, pads and holes are never scaled; their sizes are constants so
  one set serves every mold"), timings, "What is not there" (no other
  sizes, no adjustable fit, one screw per lug).

## Not in this plan

- Other screw sizes or an adjustable fit (it would break reuse).
- Screws for the pour boxes or the master.
- Heat-set inserts or steel nuts instead of a printed thread.
