# The model and the tooling

## The model

**Open STL** (or drop a file on the view, or try the sample teapot). Binary
and ASCII STL are read; the units are taken as millimetres. The model must
be a closed solid — an STL with holes or loose edges is refused with a
reason; repair it where it came from.

The panel is on the left; on a phone it is a sheet over the view: a tap on
the view hides it, **Settings** brings it back. The main view shows only
the tooling, standing on a print bed in 1 cm cells (coarser under large
tooling). The model itself is the small picture in the **Model** card:
seen from in front of the parting plane, a little from the left, with the
axes drawn and labelled — X red, Y green, Z blue; where the piece hides an
axis, it shows through faintly. The red X on the floor is where the mold
parts. The picture is not turned with the mouse — the buttons under it turn
the model itself.

The tooling assumes the piece stands upright with its axis vertical, and
that a handle or a spout lies along X — the mold parts in the XZ plane.

- **Turn about X / Y**, **Upside down** (the icon buttons, named in their
  tooltips) — quarter turns for a model that comes lying on its side or
  upside down. **Reset** undoes them and the spin.
- **Spin** — about the vertical axis, in 5° steps, or a quarter turn at
  once by the **0° / 90° / 180° / 270°** buttons: put the handle and the
  spout along X, left to right in the picture.

The axis is found by the foot (the down-facing faces at the very bottom),
so a handle does not pull it to one side; the model is dropped onto the
table.

**Hollow models.** The plaster only sees the outside of the piece — the
inside of a slip-cast piece is made by draining the slip. A hollow print is
therefore filled before the mold is built (the panel says so): the opening
at the top — the highest one around the axis, not the higher tip of a
spout — and every opening cut by a plane, such as the tip of Clayform's
applied spout. The master then has a solid spout, as it should: the slip
makes its inside, and the hole through the wall is cut when the piece is
leather-hard. An opening that is not a flat cut cannot be filled — bring a
solid model then.

- **A lid** as it is printed is open at the bottom: the panel asks to turn
  it **upside down**. Turned over, it is filled up to the end of its skirt,
  which becomes the mouth.
- **Two pieces in one file** (Clayform's **Lid alongside**) are refused: a
  mold is made for one piece. Export the lid on its own.

## Master

The piece grown by the shrinkage with a **collar** over the rim, where slip
is topped up. A silicone mold is taken off it by hand.

| Parameter | Range    | Default | What it does                                                      |
| --------- | -------- | ------- | ----------------------------------------------------------------- |
| Shrinkage | 0–30 %   | 12      | slip shrinks as it dries and fires — the model grows by this much |
| Collar    | 0–120 mm | 25      | height of the collar over the rim; a one-part mold needs none     |

With a **mouth plug** (below) the master comes with the plug as a second
part.

## Pour boxes

The app designs the plaster mold and gives the tooling to cast it:

1. Print a **pour box** — a box with the positive of a plaster block inside,
   working surface up.
2. Pour silicone, take it off — a silicone negative of the block.
3. Cast plaster in the silicone — a working part of the plaster mold.
4. Assemble the parts and pour slip into them.

| Parameter | Range     | Default | What it does                                                                                              |
| --------- | --------- | ------- | --------------------------------------------------------------------------------------------------------- |
| Shrinkage | 0–30 %    | 12      | as for the master                                                                                         |
| Collar    | 0–120 mm  | 25      | the pouring collar over the rim                                                                           |
| Plaster   | 5–80 mm   | 28      | plaster round the cavity                                                                                  |
| Keys      | 0–25 mm   | 7       | radius of the hemispherical locks on the parting planes; 0 — none; never more than a third of the plaster |
| Silicone  | 3–60 mm   | 12      | silicone over the block in the box                                                                        |
| Wall      | 1.2–12 mm | 3       | wall of the printed box                                                                                   |

The positive in a box is hollow from below — a shell as thick as the wall:
silicone only needs the working surface.

### Mouth and parting

**Find the mouth** finds where the collar stands: the largest flat top of a
solid piece (the rim of a teapot, not the higher tip of its spout), or the
rim of a filled hollow piece — the highest opening around the axis. The gate is a little narrower than the rim,
so the collar's cylinder never coincides with a straight rim. Untick it to
set the **mouth height** and the **gate radius** by hand.

**Parting** is chosen from the shape and explained over the part list:

- **One part** — the piece is nowhere wider than above it (a bowl, a
  tumbler): it comes out upwards.
- **Two halves** — a neck narrower than the body, or a through hole (a
  handle): the mold parts along the axis, in the plane of X.
- **Halves and a bottom plate** — a wide flat bottom is cast separately: a
  seam across it is the hardest to clean.

Pick a scheme by hand when you know better — a mark on the bottom wants a
bottom plate. Undercuts that lock the halves are reported with their share
and steepest angle.

**Mouth plug** — for a recessed lid: a separate plaster part that goes into
the mouth from above and casts the ledge for the lid, which the halves
cannot reach. Set the **ledge depth** below the rim and the **gallery
radius** — the opening above the ledge, wider than the gate and narrower
than the rim. If it does not fit, the mold keeps a collar and says so.

## Slump mold

A dished mold: a clay slab is pressed **into** it, the relief lands on the
outside of the piece, the outer size is exactly the model's. The **punch**
fits inside and presses the slab to the mold leaving exactly the slab's
thickness. Both are shells in one STL, laid out on the bed as **On the
bed** says (see [Export](#export)); split them in the slicer if they do not
fit the bed together.

The mold is built from the model read as a body of revolution: its outer
surface with all its relief is the working surface, the mean radius of each
height is the smooth silhouette the punch follows. A recessed mark under the
bottom becomes a raised one on the mold's floor. Both checks look at that
outside only — the inside of a hollow model does not touch the mold. A
model whose radius varies around the axis by more than half the slab (a
handle, an oval, deep lobes) gets a warning — the punch is round and the
slab will be uneven; shallower relief is what the mold is for. A piece whose
outside narrows upwards by more than 2 mm (a shoulder, a neck) gets a
warning too: it will not come out. The top 3 mm, a rim rounded off, do not
count.

Under the mold's rim are three **ears** with slots, the punch has three
short hooked **legs**: the lip of a leg holds the ear from outside and
centres the punch, the sole lands on the ear and sets the slab's thickness.
**Vents** in the mold's bottom and along the punch's axis let air out; three
grooves under the mold keep the table from closing its vent.

| Parameter    | Range     | Default | What it does                                                                                          |
| ------------ | --------- | ------- | ----------------------------------------------------------------------------------------------------- |
| Shrinkage    | 0–30 %    | 12      | both parts grow by it                                                                                 |
| Wall         | 1.2–12 mm | 3       | shell of the mold and the punch                                                                       |
| Slab         | 0.8–20 mm | 6       | thickness of the clay slab — the wall of the piece; at most 0.4 of the height                         |
| Ears         | 4–12 mm   | 8       | the seat of an ear for a leg                                                                          |
| Round bottom | 0–100 %   | 100     | the punch's bottom: 100 — a cap from the axis, 0 — a flat floor; the slab is nowhere thinner than set |
| Vents        | 1–8 mm    | 2.5     | the holes in the mold and the punch                                                                   |
| Detail       | 128–384   | 192     | the grid of the exported mold; the preview uses 128                                                   |
| Screw clamps | on / off  | off     | lugs with a thread on the mold beside the ears, tabs with holes on the punch beside the legs          |
| Print screws | on / off  | off     | three screws and three stops in the same STL (only with the clamps)                                   |

How to work: lay the slab on the mold and press it in by hand; cut the
overhang to under a centimetre; lower the punch until its legs stop on the
ears; lift the punch and trim the slab along the rim.

### Screw clamps

**Screw clamps** (a checkbox) press the punch in without a press and push
it back off with the same screws. Beside each ear the mold gets a **lug**
with an M10 × 2 thread through it, and beside each leg the punch gets a
**tab** with a plain 11 mm hole over it. The ears and legs stay as they
are: they still centre the punch and stop it at the slab's thickness.

Both are plain blocks: in plan a round boss round the screw joined by
straight sides to the ear (the leg). The lug leans on the ear's cheek, its
boss 2 mm into it, and meets the wall only by the ear; the cheek is cut
down round the stop. Its top is exactly 10 mm under the tab of the pressed
punch; it keeps out of the cavity and, above the ears' top, out of the clay
hanging over the rim. Its underside slopes at 45° up away from the ear and
is cut along the ear's own 45° slope, so **the mold prints standing without
supports**. The thread is 12 mm (six turns) where the ear's slope holds the
whole hole; with a thin slab or a small ear it starts higher, down to 8 mm
(a plain bore under it). Only if it would be shorter still does the ear's
outer face go a little lower. On a shape that widens below the rim (no
slump mold takes it out anyway) the ear cannot hold the lug: the ring round
the hole overhangs there. The tab is 8 mm thick from the flange's top and
lies flat on the bed with it; over the clay it is only as thick as the
flange.

**Print screws and stops** (under it) adds three screws and three stops to
the same STL, a column of each after the punch:

- **screw** — M10 × 2, 38 mm under a knurled head Ø24 with a slot, the tip
  chamfered;
- **stop** — a disc Ø18 × 7.5 mm with a boss Ø10.4 × 2 mm on top that
  enters the tab's hole and a conical dimple below for the screw's tip;
  9.5 mm in all, half a millimetre under the 10 mm gap, so it slides in.
  (A set printed before 2026-11-04 had 45 mm screws and stops 11.7 mm
  tall, too tall for the gap: print the new one.)

They do not depend on the model or the shrinkage — print them once and use
them with every later mold, leaving the second box off. The pitch, the
thread's fit (0.35 mm) and the 10 mm gap are fixed for that reason.

How to work with the clamps:

1. Slab in the mold, the punch on top. Put a screw through each tab into
   its lug and tighten them in turn until the legs stand on the ears.
2. To part the two: take the screws out, slide a stop into each gap on
   the lug's seat, the boss up under the tab's hole, and turn the screws
   into the lugs from below. The tip finds the stop's dimple and lifts it,
   the boss goes into the tab's hole; tightened in turn, the screws lift
   the punch evenly. The heads need about 3 cm under the lugs: stand a low
   mold on a ring or two blocks.

Print the screws standing on their heads and the stops dimple down, both
with 100 % infill or five walls or more; the threads print best at 0.2 mm
layers or finer. If a printed screw is tight, run it in and out a few
times. The fit is not a setting: one set of screws has to fit every mold.

## Export

At the bottom of the **Tooling** card, under the settings of the chosen
mode: the part list shows what the download will hold, with sizes. **Export**
builds the parts at full detail, checks each mesh (closed, normals out) and
downloads them, named after the model: the master and pour boxes one STL per
part (`teapot-bath-half-A.stl`), the slump mold one STL with the punch, the
screws and the stops (`teapot-slump.stl`).

**On the bed** (pour boxes and the slump mold) says how the parts lie in that
STL:

| Parameter       | Choices                            | Default | What it does                                                                                                               |
| --------------- | ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| All in one file | on / off                           | off     | pour boxes only: one STL with every box (`teapot-bath.stl`) instead of a file each                                         |
| Layout          | auto, in a row, one behind another | auto    | rows along x, the rows one behind another along y; auto breaks the parts into rows so that the longer side is the shortest |
| Gap             | 2–50 mm                            | 15      | between the parts                                                                                                          |

Under them the size the parts take on the bed. Layout and gap are offered
only when the parts go into one file; a change of them lays the parts out
again at once, with no new build. The view shows the parts as they lie.

## What is remembered

The mode, the parameters, the parting choice, the detail and the layout on
the bed are saved in
the browser and come back on the next visit. The turn, the mouth and the
plug belong to the model: a newly opened model starts from the defaults.

The interface is in English and Russian: the language comes from the
browser, the menu in the top bar switches it and is remembered too.
