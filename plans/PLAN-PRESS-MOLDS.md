# PLAN-PRESS-MOLDS — a tile mold and a two-part press mold

Branch `press-molds` (from `main`), one PR, a commit per milestone.
Status: **approved** (2026-11-05), in progress.

## What is asked (2026-11-05)

1. **A tile mold** — for flat plates with relief (example:
   `~/Downloads/keychain.stl`): only the lower part, the mold, with no ears
   and no punch.
2. **A two-part press mold** — for hollow pieces that are not bodies of
   revolution (examples: a slightly deformed ball with waves on its surface,
   an asymmetric vase; `~/Downloads/marble-flow.stl`). Two halves, no punch:
   the user presses clay into each half and evens the slab with the fingers,
   then takes the halves out and joins them. The piece must come out of the
   mold, or the app refuses to build. The user picks the axis of the cut
   (x / y / z) and the position of the plane, in % of the piece's size.

## The samples, measured

`keychain.stl` (Plate Builder): 55 × 33 × 4.5 mm, 5.3k triangles, one
closed shell, **genus 1** (the hole for the ring, Ø3.5). A flat plate 3 mm
thick, the bottom flat (down-facing area = footprint, 1415 mm²); on top a
frame 1 mm wide and letters, both 1.5 mm high.

- Read as it is (no fill), turned over and pulled up: **0 % undercut** — it
  comes out of a one-part mold.
- `solidify` takes the frame for a rim and "fills" the field inside it
  (status `filled`, volume 4777 → 5667 mm³). **The tile mode must not
  solidify**: a recess inside a raised border is relief, not an opening.

`marble-flow.stl` (MathSculpt): 77 × 79 × 120 mm, 263k triangles, closed,
genus 0. A hollow vase, wall ~2 mm, closed bottom ~3 mm, open at the top
with a **wavy rim**: the troughs at z ≈ 112, the crests up to 120.
`toManifold` + `solidify` 0.66 s: `filled`, the rim found at z = 112.1
(the troughs), outer radius 37.5.

How deep it catches, split by a plane. Measured on voxels of 0.5 mm: the
mold material locked behind the piece (outside it, beyond the plane, with
clay further along the pull), its largest distance to the clay = how deep
the catch is; below the rim only (above it the mold is cut away, §2.3).

| Plane  | half +, max / p99 | half −, max / p99 |
| ------ | ----------------- | ----------------- |
| x 40 % | 6.9 / 5.3 mm      | 1.5 / 1.2 mm      |
| x 50 % | 4.5 / 3.5 mm      | 3.4 / 2.5 mm      |
| x 55 % | 3.6 / 2.7 mm      | 3.8 / 3.2 mm      |
| y 50 % | 3.8 / 2.7 mm      | 4.6 / 3.7 mm      |
| y 55 % | 2.9 / 2.1 mm      | 5.4 / 4.1 mm      |
| z 50 % | 14.6 mm           | 15.5 mm           |

A scan over the spin (0…165° by 15°) and the x position (35…65 % by 5 %),
1 mm voxels: **the best is 3.6 mm** (spin 30°, x 50 %). The catches sit
right at the seam: the waves cross the plane, and where the surface runs
along the pull they hide under one another. No plane releases this vase
cleanly — see **Q2**.

The area share of faces looking against the pull (`pullUndercut`, as the
plaster mold measures it) says 15–16 % at the best x / y plane: of no use
for a soft clay slab, it counts every gentle wave. The release check here
measures depth in mm (§3).

## Decisions (2026-11-05)

- **Q1** — where in the interface: the slump tab gets a switch of its
  kind — _bowl with a punch_ / _tile_ / _two halves_; still three tabs.
  Inside they are modes of their own (`tile`, `split`): another job,
  other controls.
- **Q2** — undercuts: an **"Allowed undercut"** slider, 0…6 mm, default
  1 mm. The panel shows the depth of each half always; above the limit
  the build is blocked. The user knows their clay: leather-hard it bends
  a few mm, soft it tears. The vase builds at 4 mm. (Rejected: a fixed
  1 mm — the vase is refused at every plane; the mold filling the
  undercuts itself — the waves at the seam smoothed out, can come later.)
- **Q3** — the rim of an open piece: the mold's edge **follows the rim**,
  the wavy one included: the clay is cut along the mold's edge.
- **Q4** — **no keys** between the halves: the clay halves are taken out
  and joined by hand.
- **Q5** — a **"Find"** button: scans the position of the plane **and the
  spin** (for a vertical plane) and sets both.
- **Q6** — the half is a **shell** following the piece, printed parting
  face up with supports under its back and its land (supports accepted).
  No general 3D offset is needed — see §2.2.
- **Q7** — `keychain.stl` goes to `fixtures/`; `marble-flow.stl`
  (12.5 MB) stays out: the tests use an analytic wavy body, the numbers
  above are kept here.

## Design

### 1. Tile mold (`mode: 'tile'`)

The model as placed is the tile as it lies on the table: the face (relief)
up, **the back down on z = 0**. The mold is the negative: the tile turned
over (half a turn about x, `turnOver` — never mirrored: letters must read
right on the fired tile) sunk into a block.

- The model is read **as it is**: a closed solid (`toManifold`), no
  `solidify`. Scaled by the shrinkage.
- The block: the tile's shadow on the bed (`Manifold.project()`, a
  `CrossSection`), grown by the land `TILE_LAND_MM` = 10 (round offset)
  — the rim a scraper rides on; extruded to the tile's thickness plus the
  floor (`bathWallMm`, the wall setting the printed molds share).
- The cavity: the turned-over tile, its back **0.2 mm over the block's
  top** (`TILE_PROUD_MM`): no coincident faces, the back is scraped
  0.2 mm thinner. A through hole becomes a post up to the rim.
- Printed as it stands: the flat bottom on the bed, the cavity up; a mold
  that releases has no overhangs in its cavity.
- The release check (§3), pull up out of the turned-over cavity, the
  plane = the rim. A back that is not flat (a recess under it) is a catch
  touching the rim plane — refused with its own message ("the back of the
  tile must be flat; turn the model over if its face is down").
- No vents: on the tile's face they would leave nubs. The slab is lifted
  by turning the mold over and tapping (docs).
- One part, `id: 'tile'`. Nothing of the slump settings applies (slab,
  ears, punch, vents, clamps); the controls: shrinkage, wall, the bed.

### 2. Two-part press mold (`mode: 'split'`)

#### 2.1 The setup

`Setup.split: { axis: 'x' | 'y' | 'z'; pct: number }` — per model, like
the orientation: the plane is square to `axis` at `pct` % (5…95, default 50) of the filled piece's extent along it, in the placed frame. The spin
(already in the setup) turns the piece under a vertical plane.

#### 2.2 The halves: shells as height fields

- The model is filled (`solidify`): the mold sees only the outside. `open`
  and `openBottom` are refused as in the other modes. Scaled by the
  shrinkage; everything below is in the mm of the print.
- Half `A` lies on the − side of the plane and is pulled along −axis, `B`
  on the + side, along +axis.
- A half that releases along its pull is a **height field over the
  plane**: every ray along the pull leaves the piece's outside once. So
  the shell is 2.5D, on the grid of the release check (§3) over the plane:
  - `H(p)` — how far the piece reaches from the plane at p: the last exit
    of the ray (over a catch the Q2 limit lets through that is the hull,
    so the shell always covers the piece);
  - the back: `B(p) = max over |q − p| ≤ w of H(q) + w`, w the wall
    (`bathWallMm`) — a disc max-filter plus w along the pull. Every point
    of the back is then at least w from the piece, the steep walls by the
    seam included (along the pull alone the shell would thin to nothing
    there);
  - **the land**: a flat flange in the plane round the cavity, `SPLIT_LAND_MM`
    = 12 wide, `2w` thick (B is at least that over it) — the clay is cut
    flush with it. Its outline: the shadow of the half on the plane
    (`project()` of the half turned to its pull), round offset by the land,
    extruded — the shell's height field intersected with it, so the edge
    is smooth, not a staircase of cells;
  - the half = that solid minus the piece (exact, CSG) minus the rim
    cutter (§2.3). The plane cuts the piece transversally and the back
    keeps w off it — no coincident faces.
- For the print each half is turned (never mirrored) so its pull points
  **down**: the parting face up, the back and the land on supports. Two
  parts, `split-A` and `split-B`; in one STL when "in one file" is on, as
  the pour boxes.
- Plastic: the vase's half ~50 cm³ against ~330 cm³ of a block.

#### 2.3 The rim and the mouth (Q3)

An open piece (`filled` with a `rim`) has its mouth at the top. The
filled solid's lid stands at the rim's lowest point (the troughs); a wavy
rim's crests stand over it as bare wall. A shell built from the hull
alone would fill the mouth over the lid and hold the crests from inside
as well as outside. So one **rim cutter**, in polar coordinates round the
axis, read by rays from the axis (as `revolve.ts` reads the outside) in
the band from the lid to the top, takes away:

- everything over **z = H(θ) − 0.2 mm**, H(θ) the top of the wall at the
  angle θ (the highest row with a hit, within the rim's radius plus a
  margin — a spout over the rim is not followed): the mold's edge is the
  rim; a flat rim gives a plane;
- **the inside of the mouth** over the lid: r < r_core(θ), r_core the
  widest the inside of the wall gets in that band (the nearest hits),
  kept 0.2 mm inside the outside's narrowest. A crest that leans in loses
  a little of the mold over its outer face, never gets mold inside.

The release check ignores what the cutter takes. A closed piece (a ball)
or a solid one has no cutter: the mouth is cut in the clay by hand.

#### 2.4 Refusal

Both halves pass the release check (§3) in an export **and** a preview;
a half over the limit (Q2) blocks the job with the depth, the half and
the height of the deepest catch: "Half B: the piece catches 3.8 mm deep
at 97 mm — move the plane or spin the model". The panel shows both depths
always, so the slider can be tuned against them.

### 3. The release check (`geo/release.ts`, pure)

One check for both modes: a solid (positions, indices), a pull axis and
sign, a plane, an optional cutter (where it takes the mold away, no
catch is counted), a cell. The rays it casts are kept: the shell (§2.2)
is built on the same grid.

- Rays along the pull on a grid over the plane; every crossing of a face
  recorded (the triangle rasterised in the plane's coordinates).
- Voxels along each ray: clay (odd crossings), **locked** (beyond the
  plane, outside the clay, before the last exit), free.
- The distance of every locked voxel to the clay (a separable squared EDT,
  Felzenszwalb) — the depth of the catch; the result: the deepest, its
  point, the locked volume.
- Cell 0.5 mm in an export, 1 mm in a preview. The cost on the vase:
  ~0.1 s per half at 1 mm, ~1 s at 0.5 mm (to measure in M0).

Tests: a sphere split at its equator releases (depth ≤ a cell); split at
30 % the bigger half catches as deep as the bulge over the plane's circle
(analytic); a box with a dimple on its side catches the dimple's depth; a
tile with a recessed back catches at the rim plane; the keychain releases
when turned over.

### 4. State, storage, UI, i18n

- `MODES` += `tile`, `split`. `Setup.split: { axis, pct }` with its
  sanitizer (never throws, idempotent). `MoldState.allowedCatchMm` (Q2).
  The stored record stays version 2: the sanitizers fill the new fields,
  and a test reads an old record with the defaults.
- The panel (Q1): the kind switch inside the slump tab; for `split` — the
  axis (x / y / z), the position slider, "Find" (Q5), the allowed
  undercut, the depths of the halves; for `tile` — the allowed undercut
  and the depth. The settings that do not apply are hidden, as now per
  mode.
- Every text in `en.ts` / `ru.ts`; messages as codes.
- The view: the tooling on the bed, as laid out by `arrangeOnBed`.

### 5. The worker

`runJob` dispatches `tile` → `tileJob`, `split` → `splitJob` in
`worker/tooling.ts`; CSG stays in the worker. The job carries the split
setup. A preview builds the same parts if they are cheap enough (M0); the
export checks the meshes as now.

### 6. "Find" (Q5)

A job of its own kind, `find`, not replaced by a preview (as an export).
The filled, scaled piece is spun about z by Δ (0…165° by 15°, a vertical
plane only; a z plane scans the position alone); per spin the rays are
cast once and every position (5…95 % by 2.5 %) only reclassifies them.
Coarse at 2 mm voxels, then refined round the best (±15° by 5°, ±5 % by
1 %) at 1 mm. The result — Δ, the position, the depth — goes into the
setup: the spin becomes the user's spin + Δ (the placement keeps the axis
through the origin, so a spin about z in the worker is the same thing).

## Milestones

- **M0 — measure.** On the vase and the keychain in node: the halves' CSG,
  the rim cutter, the release check at 1 / 0.5 mm. If a preview of the vase
  is over ~3 s — a coarser preview (the check at 2 mm, the model
  simplified).
- **M1 — `geo/release.ts`** with its tests (§3).
- **M2 — tile**: `tileJob`, tests on the keychain (one closed part, the
  cavity's depth = 4.5 × shrinkage, the post, a back proud by 0.2 mm,
  refusals: undercut, recessed back, more pieces).
- **M3 — split**: the shells, the rim cutter, the turn for the print;
  tests on an analytic wavy body (releases at its plane, refused off it),
  `cup-hollow` (a body of revolution: releases at x 50 %), a closed
  hollow ball (no cutter).
- **M4 — state, UI, i18n**: sanitizers, storage, the panel (jsdom tests).
- **M5 — "Find"** (Q5).
- **M6 — smoke, docs, AGENTS.md**: the tile from the keychain fixture
  (Q7), the split of a sample, the refusal shown; `docs/tooling.md`,
  `docs/slip-casting-workflow.ru.md`; AGENTS.md layout, invariants,
  timings, "what is not there".

## What will not be there

- A parting surface that is not a plane (following the silhouette) — what
  the vase really wants; a plane at an angle other than square to x, y, z
  (the spin covers the vertical ones).
- Undercuts filled by the mold itself (rejected in Q2 for now).
- More than two parts, a bottom plate of a split mold.
- A tile with relief on both faces; a draft added to vertical walls;
  vents in the tile mold.
- A block-shaped half with a flat back (printed with no supports).
- Keys between the halves.
