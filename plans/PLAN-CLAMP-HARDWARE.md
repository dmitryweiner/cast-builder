# PLAN-CLAMP-HARDWARE — the second test print: metal hardware, a landing, stops apart

Branch `clamp-hardware`, one PR, a commit per milestone. Status: **done** (approved 2026-11-05).

## What the test print showed (2026-11-05)

The user printed the screw clamps of `PLAN-SCREWS.md` in PLA, 100 % infill,
and pressed with them: **the screws tear near the head**. Pressing pulls
every screw in tension; it is printed standing on its head, so the pull goes
across the layers — the weakest direction of a print — and right under the
head two things add up: the thread starts inside the head (`threadRod` from
z = −0.5), so the thread's root (core Ø8) meets the head's flat at a sharp
corner, the place where the stress concentrates. Pushing the punch off (a
screw from below on the stop) loads the screw in compression and is not what
broke.

## What is asked

1. **A landing under the lug**: a flat face round the exit of the hole at
   the lug's underside, square to the screw's axis, for a steel nut (with a
   washer) or the jaw of a G-clamp.
2. **Stops apart from screws**: "print the stops" a checkbox of its own.
3. **Thread or not**: the lug's hole threaded (printed screws) or plain
   (a steel M10 bolt with a nut right away).
4. **The sizes in the interface**: what screws are printed — M10, pitch,
   length (asked during planning).

## Decisions (2026-11-05)

- **Q1.** The landing is **L2**: a flat underside under the boss; supports
  under each lug in print are accepted.
- **Q2.** Nothing is added for parting with the thread off: the user finds
  a way. The stops stay available.
- **Q3.** The screws tore **near the head** → §5 below (proposed, not asked).
- **Q4.** The landing is **Ø18**, the boss's own diameter: the boss does not
  grow.

## Before

- `MoldState`: `screws` (lugs, tabs, holes), `printScrews` (3 screws and
  3 stops in the STL), `threadFitMm`. Controls in `ui/screws.ts`; the sizes
  are only in a tooltip ("three M10 × 2 screws…") and in `docs/tooling.md`.
- The lug (`lugSolids`): a prism, the hull of the boss Ø18 and of the ear's
  side; its underside rises at 45° away from the ear and is cut by the ear's
  45° envelope (`support`), so the mold prints without supports. The thread
  is 12 mm under the seat where the envelope holds the hole, down to 8 mm
  (`threadZ`), a plain bore below; below 8 mm the ear's face goes lower
  (`earShortfall`). The hole leaves the underside **on a 45° slope**: neither
  a nut nor a clamp's jaw sits there.
- The tab: a plain Ø11 hole (`CLEAR_HOLE_MM`) — a steel M10 bolt passes it.

## Design

### 1. The landing (L2)

- The boss's bottom is flat: a horizontal ring Ø18 round the hole at
  `landingZ = seatZ − LUG_THREAD_MM` (= today's `lugBottomZ`), a constant
  12 mm under the seat for every mold — so the steel bolt has one length
  for every mold (§4), as the gap is one for every set of stops.
- Outside the boss's circle the lug keeps its 45° underside towards the
  ear, cut by the ear's envelope as now. Under the landing a free cylinder
  of the washer's radius + 0.5 is cut off whatever of the slope reaches
  lower, so a washer Ø20 or a clamp's pad lies flat.
- The boss is no longer held by the envelope: it prints on supports. So the
  thread is always the full 12 mm (`threadZ = landingZ`), no bore under it,
  and `earShortfall` goes — it only existed to give the thread 8 mm on the
  envelope (the ears get smaller on thin slabs; measured in M0).
- The overhang test of the lug gets one exception, the boss's flat bottom.

### 2. Stops apart

`printScrews` becomes two fields: `printScrews` (3 screws) and `printStops`
(3 stops); two checkboxes under "Screw clamps". The STL holds what is
checked, the part list too; `layout.ts` already lays them out as separate
columns.

Stored format: additive, as with `screws` before — a record without
`printStops` takes it from `printScrews` (who printed both keeps both).
No `VERSION` bump; a test of the old record.

### 3. Thread or plain hole

`MoldState.threadedLugs: boolean`, default **on** (today's molds). Off:

- the lug's hole is plain Ø11, like the tab's: a steel M10 bolt (ISO,
  pitch 1.5) passes both, a washer and a nut go on the landing; no thread is
  cut (the preview gets faster);
- **Thread fit** and **Print screws** are hidden (printed screws need the
  thread); **Print stops** stays.

A G-clamp between the tab's top and the landing works either way.

### 4. The sizes in the interface

Every number comes from `geo/thread.ts` through i18n template parameters,
never typed into a message. `Control` gets an optional `note` — a key and
its parameters — shown under the control in the hint's style, always
visible:

- **Print screws**: "M10 × 2 (pitch 2 mm, not the ISO 1.5), 38 mm under
  the head, head Ø24";
- **Print stops**: "Ø18 × 9.5 mm, slide into the 10 mm gap";
- **Thread in the lugs**, when off: "Steel per lug: a bolt M10 × L (ISO,
  pitch 1.5), a washer M10, a nut". L is the shortest standard length that
  holds with the punch still up by the travel: tab 8 + gap 10 + lug 12 +
  washer 2 + nut 8 + travel 8 + two turns of the bolt past the nut → about
  M10 × 55. A pure function in `thread.ts`, tested; constant, because the
  landing is.
- the export's part list: "Screws M10 × 2 × 38 — 3", "Stops Ø18 × 9.5 — 3".

### 5. The screw's neck (proposed after Q3)

The part of the shank in the tab (8 mm) needs no thread: the tab's hole is
plain Ø11. So the screw gets an **unthreaded neck Ø10** for the first
7 mm under the head, joined to the head by a 1 mm 45° cone instead of a
sharp corner, the thread starting under the neck with a short run-in. At
the head the section is Ø10 instead of the thread's core Ø8 — 56 % more
area — and no thread root next to the corner. The tab's hole gets a 1 mm
chamfer on top for the cone.

The rest of the screw is unchanged (length, head, thread), so the set stays
compatible both ways: a new screw fits an old mold (the cone stands half a
millimetre proud on an unchamfered hole), an old screw a new one. The
screws will still be weakest across their layers; if the neck is not
enough, a screw printed lying on two flats is the next step (not here).

## Milestones

### M0. Measure

- On all fixtures and slabs 3 / 6 / 12, before and after: the lugs'
  plastic, the ears' plastic (without `earShortfall`), the landing's height
  over the bed (the support's height), the preview and export times.
- A render of the user's bowl (below, section through a hole) into
  `shots/` to show the landing. Into this file.

### M1. The landing

- `press.ts` `screwLayout`: `landingZ`; `threadZ = landingZ`; `footZ` for
  the slope outside the boss; `earShortfall` removed. Tests: the landing
  level, 12 mm under the seat, whole Ø18 round the hole for every fixture
  and slab; a washer Ø20 under it intersects nothing; nothing round a lug
  overhangs past 45° but the boss's bottom; the punch's no-overlap test
  still green.
- `screwSolids.ts` `lugSolids`: the boss's flat bottom, the free cylinder
  under it, the full thread. Tests (real WASM): the mold's genus as today.

### M2. Thread on / off

- `MoldState.threadedLugs`, `sanitizeMold`, idempotence; the job carries
  it; `lugSolids` cuts a plain Ø11 bore when off.
- Tests: off → a steel bolt Ø10 passes the lug and the tab of the punch put
  back over the mold, the fit changes nothing; on → the thread as before.

### M3. Stops apart

- `printStops`, migration from `printScrews`; `slumpTooling` gets
  `{ screws, stops }` instead of one `print`.
- Tests: the four combinations of the two boxes → 2 / 5 / 5 / 8 bodies;
  an old record with `printScrews: true` → both on.

### M4. The screw's neck

- `screwSolid`: the neck, the cone, the thread from under the neck;
  `tabSolids`: the chamfer of the hole. Tests: one shell; the section at
  the head ≥ Ø10; the screw put through the tab of the punch over the mold
  intersects neither the tab nor the lug (the thread in the lug's thread);
  still the same screw for every mold.

### M5. UI: the boxes and the sizes

- `ui/screws.ts`: Screw clamps → Thread in the lugs → Thread fit and Print
  screws (with the thread) → Print stops; the notes with sizes.
- i18n en + ru; `ctl.printScrews` becomes "Print screws".
- jsdom tests: what is shown in which state; the notes' numbers equal
  `SCREW`, `THREAD`, `PAD` and the bolt's length.

### M6. Smoke, docs, AGENTS.md

- `scripts/smoke.mjs`: thread off + stops only → 5 pieces in the STL; the
  bolt's note visible.
- `docs/tooling.md`: the field results; three ways to clamp — printed
  screws, a steel bolt with a washer and a nut on the landing, a G-clamp
  between the tab and the landing; the lug now prints with supports under
  its boss; the new neck; the boxes.
- `AGENTS.md`: invariants (the landing, the thread optional, the neck),
  layout, timings, plans index, "What is not there".
- `PLAN-SCREWS.md`: a line under "The first test print" pointing here.

## Results

Measured in node (grid 128 for the lugs and the preview, 384 for
the export), before → after:

| model, slab | lugs, cm³                 | ears with the clamps, cm³ | preview, ms           | landing over the bed |
| ----------- | ------------------------- | ------------------------- | --------------------- | -------------------- |
| bowl, 3 / 6 | 18.9 → 21.9 / 23.5 → 22.1 | as without                | 354 → 408 / 353 → 377 | 70 / 73 mm           |
| cup, 3 / 6  | 9.8 → 10.9 / 13.5 → 12.0  | as without                | 307 → 348 / 322 → 337 | 87 / 90 mm           |
| vase, 3 / 6 | 23.2 → 15.5 / 23.6 → 19.1 | +82.6 / +85.0 → none      | 285 → 306 / 269 → 289 | 271 / 275 mm         |
| pot, 6 / 12 | 20.0 → 25.3 / 21.1 → 26.6 | −19.6 / +4.9 → none       | 291 → 331 / 307 → 330 | 151 / 158 mm         |

- The thread is the whole 12 mm on every model and slab (it was 8–12, and
  8 on the pot and the vase); `earShortfall` is gone with the vase's
  +68–85 cm³ of ears.
- The room under the landing reaches into the ear's rib on the cup only
  (60–110 mm³ per lug, cut off).
- The preview is 20–60 ms slower: the rooms are cut off the shell, so it is
  always imported. The export with the printed set: bowl 2.2 → 2.0 s, cup
  2.3 → 2.1 s.
- The steel bolt: tab 8 + gap 10 + lug 12 + travel 8 + washer 2 + nut 8 +
  3 past it = 51 → **M10 × 55**.
- Done as planned otherwise; M0 drew no variants (L2 was picked up front).

## Not in this plan

- Parting with steel hardware (a nut pocket in the seat): the user finds
  a way.
- A screw printed lying on its side, another pitch, heat-set inserts.
- A landing wider than the boss (a large washer Ø30).
