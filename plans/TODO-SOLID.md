# TODO-SOLID — make every Clayform export solid here

Clayform drops its “Solid” export (`clayform/PLAN-EXPORT.md`, 2026-11-03).
From now on it gives only what is printed in clay, and the solid master is
Cast Builder's job. What comes in:

- **The body**: hollow, open at the top; the rim may be rounded
  (`rimRadiusMm`, up to half the wall).
- **The handle**: fused on, its ends cut by the cavity.
- **The applied spout** (a teapot): a hollow tube with a channel through the
  wall, cut at the tip by a plane at an angle. So there is a second opening.
- **The pulled spout**: the body stays a body of revolution, no second
  opening.
- **The lid**: a separate file, skirt down on the table, hollow under the
  dome and open at the bottom. The knob is solid.
- **“Lid beside”**: the body and the lid as two closed components in one STL.

`solidify.ts` today fills only the first case: one opening, at the top.

## T1. The spout: more than one opening

A hollow teapot is reported `open` (`model.openTop`). It needs a cap on the
tip of the spout as well as across the top. Once both openings are capped,
the cavity and the channel are one closed void, and `dropVoids` drops it.
That is also what the master must be: in slip casting the slip makes the
inside of the spout, and the hole through the wall is cut when leather-hard.

Ways to find the second opening:

- **Planar rims (preferred).** The top probe is the case “plane normal +z”.
  Generalise it: cluster the faces by normal and plane, and keep the planar
  annuli (a cluster whose outline in its plane has a hole). Cap each hole
  with a slab grown by `OVERLAP_MM`, as the top lid is. This works for
  clayform's spout tip, which is a plane cut.
- **Ray probe.** Cast rays from the inside of the top opening and see where
  they leave the model. That gives the direction of the channel, but not
  the shape of its end.
- **User-assisted.** Let the user click the opening in the view. A fallback
  for STLs from elsewhere.

Tests: a fixture of the hollow teapot (T5) comes out `filled`, closed,
genus 0, with volume ≈ the old solid `teapot.stl`. The mouth is still found
at the top, not at the spout tip (the tip is higher but smaller).

## T2. The lid as Clayform prints it

The printed lid is open at the **bottom**. Turned over by hand (`flip`), its
opening is at the top, and `solidify` should fill it into exactly the
upside-down solid lid the mold wants (the skirt end is the mouth). Check this
with a test first. Then decide:

- detect “opening at the bottom, none at the top” and suggest turning the
  model over (a warning with a button), or turn it over by itself;
- check the mouth and the collar on the skirt end: it is a thin ring, not a
  flat top.

## T3. “Lid beside”: two bodies in one file

`decompose` gives two shells of positive volume. Either split them into two
models, or refuse with a message: “two pieces in one file — export the lid
separately (untick ‘Lid beside’ in Clayform)”. The message is the cheaper
option and probably enough.

## T4. The rounded rim on the master

A filled hollow piece keeps the rim radius; the old solid one had a sharp
edge. `RIM_BAND_MM` already measures the rim lower down. Check that the
collar and the gate sit right on a rounded rim (a test on `cup-hollow.stl`
with a rim radius).

## T5. Fixtures

New ones, from clayform's core at the commit that lands PLAN-EXPORT, 48
segments, through `buildPrintableVessel` / `buildLidMesh`:

- `teapot-hollow.stl` — the pot 120 mm high with the applied spout, as
  `teapot.stl`, but printable (with the seat for the lid);
- `lid-printed.stl` — its lid skirt down, as printed;
- `teapot-lid-beside.stl` — both in one file, for T3.

Keep the old solid fixtures: a solid STL from elsewhere is still valid
input. But `pot-handle.stl`, `teapot.stl` and `lid-upside-down.stl` came from
`buildSolidVessel` and `buildLidSolid({ upsideDown: true })`, which
clayform removes. Note in `fixtures/README.md` that they can only be
regenerated from clayform `710c979`.

## T6. Texts and docs

- `model.openTop` (en and ru) says “in Clayform tick ‘Solid’”. The tick is
  gone: after T1 the message is for STLs from elsewhere only, so make it say
  “bring a solid model”.
- `AGENTS.md`: “clayform's ‘Solid’ export is the hand-off” → Clayform's
  printable export; the invariant “a hollow model … with a second opening
  stays `open`” → as T1 makes it.
- `README.md`: the paragraph about the “Solid” tick.

## Order

Until T1, a Clayform teapot with an applied spout cannot be cast at all. Do
T1 and T5 first.
