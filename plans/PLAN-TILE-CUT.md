# PLAN-TILE-CUT — a tile mold of two parts held by a skirt

Branch `tile-cut` (from `main`), one PR.
Status: **done** (2026-11-08); results at the end.

## What is asked (2026-11-08)

In Press → Tile, the mold optionally **cut in two** (a checkbox, off by
default). The height of the cut is set by the user, the middle by default.
The parts are held together by a **skirt**.

## Decisions (2026-11-08)

- **Q1** — the skirt is on the **upper part** (the frame): it hangs down
  over the lower part (the base) like a lid. The frame is printed turned
  over (its top land on the bed, the skirt up), the base as it stands.
  (Offered: the skirt rising from the base, both printed as they stand; a
  tongue and groove in the cut plane.)
- **Q2** — the height of the cut is in **% of the cavity's depth**: 0 % the
  deepest point of the relief (the tile's face), 100 % the rim; 50 % by
  default, the middle of the tile's thickness. Every value cuts the cavity,
  never the solid floor under it.
- **Q3** — the skirt's sizes are **constants**, no new sliders: radial fit
  0.3 mm, its wall the mold's **Wall**, its lower edge 1 mm over the table.
  Changed after the first print (2026-11-08): 0.3 mm lets the frame wobble.
  The fit is a **slider**, `tileFitMm`, 0.1…0.6 mm by 0.05, **0.2** by
  default — the printer's, like the thread fit; shown with the cut only.

## Design

### 1. The parts

The mold as now (`buildTileMold`): the block is the outline `L` (the tile's
shadow grown by the land), from z = 0 to the rim `R = top + floor − 0.2`;
the cavity, the tile turned over, from the face at z = floor to the rim.
The cut is the plane z = h, `h = floor + pct/100 · (R − floor)`.

- **Base** `tile-base` — the block under the plane, the cavity taken out:
  `extrude(L, h) − tile`. Printed as it stands, the cavity up.
- **Frame** `tile-frame` — the block over the plane and the skirt:
  `extrude(L + fit + wall, from h − skirt to R) − extrude(L + fit, below h)
− tile`, the skirt `h − 1` mm long. The frame rests on the base's top
  (the cut plane), never on the table: the load of the pressing goes
  through the joint and keeps it shut, so no clay creeps into it. The
  skirt's pocket reaches 1 mm under the skirt's edge — no coincident faces.
  Printed **turned over** (`turnOver`, half a turn about x, never
  mirrored): the land on the bed, the skirt up.
- **The skirt's length** (asked after the first print, 2026-11-08): reaching
  to 1 mm over the table it hid the whole base, and the stack was hard to
  take apart. The skirt covers the **upper half** of the base now — its
  edge at h / 2 (`skirtEdge`), the lower half bare for the fingers — but
  never shorter than `TILE_SKIRT_MIN_MM` = 2 mm while the base allows it,
  and never lower than 1 mm over the table: on a thin base the key still
  holds.
- **The key** (asked after the first version, 2026-11-08): the skirt
  alone lets a round tile turn, and a tile with an outline symmetric under
  a half turn go on the wrong way round. The outline of both parts gets a
  **lobe** — a disc `TILE_KEY_R_MM` = 5 centred on the outline's vertex
  furthest along +x, half of it outside; the skirt follows it with its fit.
  One lobe has no symmetry: the frame goes on one way only. Nothing thin
  (a groove in the base's side would cut into a 2 mm land), no new part,
  both still print with no supports. (Rejected: a pin and a socket in the
  cut plane — the land may be 2 mm wide.) The whole mold has no lobe.
- **Coincident faces**: a flat face of the tile (a relief's top, a step)
  lying in the cut plane would be the worst input of the boolean. `h` is
  moved 0.1 mm up off any horizontal face of the tile within 0.1 mm of it
  (`tileCutZ`, pure, tested). The cut crosses every other face
  transversally.

### 2. The release

Nothing new. Both parts leave the tile along the same pull as the whole
mold: turn the stack over (the tile's back on the table), lift the base
off the face, then the frame off the sides. The check of the whole mold
(`releaseDepth`, the pull up out of the cavity) covers both parts. The
frame lifted straight up off a tile still lying in the base would need a
wall that does not widen towards the back — not checked, the docs say to
turn the stack over.

### 3. State, storage, UI, i18n

- `MoldState.tileCut: boolean` (false), `MoldState.tileCutPct: number`
  (50, 10…90): habits like the land, so in the settings, reset with them.
  The stored record keeps its version: the sanitizer fills the new fields,
  a test reads an old record with the defaults.
- The panel, the tile only: the checkbox **Cut in two**, and under it, when
  on, the slider **Cut at**, % of the cavity's depth.
- Two parts → the bed card as for the pour boxes and the halves: a file
  each (`keychain-tile-base.stl`, `keychain-tile-frame.stl`) unless asked
  into one, then laid out on the bed (`inOneFile`).
- Texts in `en.ts` / `ru.ts`: the controls, the parts' names.

### 4. The worker

`tileJob` builds the mold whole, or with the cut the two parts
(`buildTileParts`), each in its own frame for the bed: the base as it
stands, the frame turned over. The release check is the same for both.

## Milestones

1. `tileCutZ` and `buildTileParts` in `geo/tile.ts` with tests: the cut's
   height, a flat face moved off; the base and the frame closed, one piece
   each, their heights, the skirt's fit and length, the frame sitting on
   the base with no overlap.
2. `MoldState` fields and sanitizers; `tileJob` with the cut (tests in
   `tooling.test.ts` on the keychain).
3. UI: the controls, the bed card, i18n; jsdom tests.
4. Smoke: the keychain cut in two, two parts listed, two files; docs
   (`docs/tooling.md`, `docs/slip-casting-workflow.ru.md`), AGENTS.md.

## What will not be there

- A cut that is not flat (following the relief), more than two parts.
- The frame's own release when lifted off upright.

## Results (2026-11-08)

All milestones done; `npm run check` and the smoke (dev) pass.

- **The post.** The frame over the plane holds the top of the ring's post
  as a loose piece. The frame keeps its largest piece; every other one is
  a post: its shadow, grown 0.2 mm into the clay round it, is extruded from
  under the plane to the rim and fused onto the base before the tile is
  taken out — no coincident faces with the post's wall.
- `docs/slip-casting-workflow.ru.md` does not speak of the press molds at
  all; nothing added there.

Measured (M1 Max, node, the keychain):

| Job                | Whole | Cut in two |
| ------------------ | ----- | ---------- |
| tile mold, preview | 29 ms | 80 ms      |
| tile mold, export  | 35 ms | 88 ms      |

The key, added after: a medallion's frame turned by 10°, 90° or 180°
overlaps its base (a test); the keychain's parts grow by the lobe.

The fit, after the first print: 0.3 mm wobbled; a slider now, 0.2 by
default.

The skirt, after the first print: down to 1 mm over the table it hid the
base; it covers the upper half of the base now (the keychain: 2.7 mm of
skirt instead of 4.4, 2.7 mm of the base bare).

Left for a test print: whether 0.2 mm of fit is right for the skirt, and
whether the base comes off the face cleanly before the frame.
