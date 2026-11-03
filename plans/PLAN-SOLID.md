# PLAN-SOLID — fill every Clayform export here

How `TODO-SOLID.md` is done. Branch `solid-from-printable`, one PR, a commit
per milestone.

## Decided with the user (2026-11-03)

- **T1:** besides the top, only **planar cuts** are capped (a planar
  annulus: clayform's spout tip). No picking of an opening in the view — it
  goes to "What is not there".
- **T2:** a lid as printed (open at the bottom, closed at the top) gets a
  **warning** that points to "Upside down". The app never turns the model by
  itself: the view keeps matching the buttons.
- **T3:** two bodies in one file **block** the job with a message: export
  the lid separately (untick "Lid beside" in Clayform).

## What the probe showed (before any change)

`solidify` on the new fixtures, from clayform `710c979` (its printable
builders do not change with PLAN-EXPORT, so the fixtures can be made now):

| Fixture                     | Genus | Status now | Should be                       |
| --------------------------- | ----- | ---------- | ------------------------------- |
| `teapot-hollow`             | 1     | `solid` ✗  | `filled`, genus 0, mouth at 120 |
| `lid-printed`, flipped      | 0     | `filled` ✓ | the same                        |
| `lid-printed`, as printed   | 0     | `solid` ✗  | a warning: turn it over         |
| `teapot-lid-beside`         | 0+0   | `solid` ✗  | blocked: two pieces             |
| `cup-hollow` (rim r 1.5 mm) | 0     | `filled` ✓ | the same                        |

The hollow teapot is worse than "open": the top probe is taken 0.3 mm under
the **highest** point — the slanted tip of the spout — finds no hole there
and calls the model solid. The rim of `cup-hollow` is rounded to half the
wall, so the top of a printed piece has **no flat face**: the planar search
can find the spout tip but not the top opening.

## The algorithm

`solidify(csg, scope, model)`:

1. `dropVoids` as now.
2. **The top opening**: the highest horizontal slice with a hole **around
   the axis** (placeModel puts the axis through the foot). A coarse scan
   down from the top through the upper half, then bisection to the crest of
   the rim. The tip of a spout is higher, but its hole is off the axis. The
   lid is capped 0.3 mm under the crest, as now; only the hole around the
   axis is capped. The rim radius comes from the outline around the axis
   only (the spout's ring in the same slice must not count).
3. If the top lid did not close the inside: **planar openings**. Region
   growing over the manifold mesh (edge-adjacent faces with the seed's
   normal and plane) gives the planar patches; a patch whose outline has a
   hole is an annulus. Each annulus not facing down is capped like the top:
   the hole grown by `OVERLAP_MM`, a slab sunk under its plane. Facing down
   is left out: the bottom of a foot ring is an annulus too, and its recess
   is the outside of the piece. Caps inside the cavity (the lid seat's
   ledge) are harmless: what they close off is cavity and is dropped.
4. Still not closed → `open` ("bring a solid model").
5. No top opening at all: probe the **bottom** the same way (the model
   mirrored). If a bottom lid closes a void larger than the material, the
   model is hollow and open at the bottom — `openBottom`, the warning to
   turn it over. A foot recess closes a void far smaller than the piece.

T3 needs no CSG: a pure `bodies(mesh)` (`src/geo/pieces.ts`) counts the
connected components of the welded mesh with positive signed volume. It runs
first in `runJob`, for every mode (the slump mold would read two bodies as
one too) and blocks with `model.pieces`.

## Milestones

- **S0. Fixtures (T5).** `scripts/fixtures.mjs` (run with clayform's
  vite-node), the three files, `fixtures/README.md`: the new ones, and the
  old solid ones can only be regenerated from clayform `710c979`.
- **S1. Pieces (T3).** Tests for `bodies` (pot 1, beside 2, a box with a
  void 1), `runJob` blocks `teapot-lid-beside` in every mode. Code, message
  in en/ru.
- **S2. The top opening on the axis (T1, part 1).** Tests: the mouth of
  `teapot-hollow` is the rim (z ≈ 120, radius ≈ the pot's), not the spout
  tip; `cup-hollow` and the old tests stay green. Code: the scan.
- **S3. Planar openings (T1, part 2).** Tests: `teapot-hollow` comes out
  `filled`, one shell, genus 0, volume within 2 % of `teapot.stl`, its
  bounding box unchanged; a tube open at both ends with a slanted planar cut
  fills; a foot-ring recess is not filled. `runJob` on `teapot-hollow`
  builds the master and pour boxes. Code.
- **S4. The lid (T2).** Tests: `lid-printed` flipped fills to within 1 % of
  `lid-upside-down.stl`, the mouth is the skirt end; its master and pour
  boxes build; `lid-printed` as printed → `openBottom` and the warning; a
  solid bowl with a foot recess does not warn. Code, message in en/ru.
- **S5. The rounded rim (T4).** Tests on `cup-hollow`: the gate is inside
  the rim, the master is one closed shell without degenerate triangles, the
  collar stands on the rim. Expected green with no code (the collar starts
  1 mm under the rim, `buildCavity` drops the pockets) — if not, fix.
- **S6. Texts and docs (T6).** `model.openTop` → `model.open`, "bring a
  solid model"; `AGENTS.md` (the hand-off, the invariants, the timings of
  `solidify`, the scripts list, the plans index), `README.md`,
  `docs/`. The smoke: one more step that loads `teapot-hollow.stl` if it
  fits the existing upload step. `npm run check`, `npm run smoke`,
  `npm run smoke -- --preview`.

## Result

(filled in at the end)
