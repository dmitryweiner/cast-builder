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
  upside down. **Reset** undoes them and the spin, and puts every setting
  back to its default, except the language and the chosen mode. The model
  stays.
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

**Shrinkage** grows the piece itself — the master, the cavity, the relief —
so the fired piece comes out the size of the STL. The slump mold grows whole
with its punch (the slab is the wall of the piece). The tooling round the
piece keeps its sizes: plaster, silicone, the collar, the walls and the land
of the press molds, the screw clamps. The model is multiplied by
1 + p/100; shrinkage measured from the wet size wants 1 / (1 − p/100), so
for 12 % set about 13.6 %, or the piece comes out about 1.4 % small.

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

## Press molds

Molds the clay is pressed into by hand, all under one tab with a switch of
their **kind**: a **bowl with a punch** (the slump mold below), a **tile**
(a one-part mold for a flat plate with relief) and **two halves** (a mold
for a piece that is not round). The tab opens on the kind last picked.

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
| Screw clamps | on / off  | off     | lugs on the mold beside the ears, tabs with holes on the punch beside the legs                        |
| Thread       | on / off  | on      | the lugs' holes threaded for the printed screws; off — plain, for steel bolts (only with the clamps)  |
| Print screws | on / off  | off     | three screws in the same STL (only with the clamps and the thread)                                    |
| Print stops  | on / off  | off     | three stops in the same STL (only with the clamps)                                                    |

How to work: lay the slab on the mold and press it in by hand; cut the
overhang to under a centimetre; lower the punch until its legs stop on the
ears; lift the punch and trim the slab along the rim.

### Screw clamps

**Screw clamps** (a checkbox) press the punch in without a press and push
it back off with screws. Beside each ear the mold gets a **lug** with a hole
through it, and beside each leg the punch gets a **tab** with a plain 11 mm
hole over it, chamfered on top. The ears and legs stay as they are: they
still centre the punch and stop it at the slab's thickness.

Both are plain blocks: in plan a round boss round the screw joined by
straight sides to the ear (the leg). The lug leans on the ear's cheek, its
boss 2 mm into it, and meets the wall only by the ear; the cheek is cut
down round the stop. Its top is exactly 10 mm under the tab of the pressed
punch; it keeps out of the cavity and, above the ears' top, out of the clay
hanging over the rim. The tab is 8 mm thick from the flange's top and lies
flat on the bed with it; over the clay it is only as thick as the flange.

**The landing.** The boss of a lug ends 12 mm under its top in a flat ring
Ø18 round the hole, square to the screw: a steel washer and nut sit there,
or the jaw of a G-clamp. Under it a Ø20 × 14 mm room is kept free (cut out
of the ear's rib where it reaches there). Past the boss the lug's underside
slopes at 45° up away from the ear and leans on the ear's own 45° slope,
but the landing itself faces down: **the slicer puts supports under each
landing**. Its height is the same on every mold, so one bolt length fits
them all.

**Thread in the lugs** (on by default) cuts an M10 × 2 thread through the
whole lug, 12 mm (six turns), for the printed screws. Off, the lug's hole
is plain Ø11 like the tab's: a steel M10 bolt (ISO, pitch 1.5) goes through
both, a washer and a nut on the landing. The panel names the bolt: **M10 ×
55**, the shortest standard length through the tab (8), the gap (10), the
lug (12), a washer (2) and a nut (8) with the punch still 8 mm up and the
bolt a little past the nut. Without the thread **Thread fit** and **Print
screws** are hidden.

**Print screws** and **Print stops** add three screws and three stops to
the same STL, a column of each after the punch; the line under each box
names the sizes:

- **screw** — M10 × 2 (not the ISO 1.5), 38 mm under a knurled head Ø24
  with a slot. The first 7 mm under the head stand in the tab's plain hole
  and are a plain neck as wide as the thread, joined to the head by a 45°
  cone; the thread runs out into the neck, the tip is chamfered. (The second
  test print, 2026-11-05, tore screws at the head, where the thread's root
  met the head's flat: the neck is the fix. A set printed before fits the
  new molds, and a new screw fits the old ones — it stands half a
  millimetre proud on a hole without the chamfer.)
- **stop** — a disc Ø18 × 7.5 mm with a boss Ø10.4 × 2 mm on top that
  enters the tab's hole and a conical dimple below for the screw's tip;
  9.5 mm in all, half a millimetre under the 10 mm gap, so it slides in.
  (A set printed before 2026-11-04 had 45 mm screws and stops 11.7 mm
  tall, too tall for the gap: print the new one.)

They do not depend on the model or the shrinkage — print them once and use
them with every later mold, leaving the boxes off. The pitch and the 10 mm
gap are fixed for that reason.

**Thread fit** (shown with the thread on) is the clearance of the threaded
holes in the lugs, 0.5 mm by default, 0.2–0.7. If the screws go in tight,
make it larger. It changes only the holes in the mold, never the screws, so
a set already printed fits a mold with any fit. Like every size of the
clamps, it is in the millimetres of the print, not grown by the shrinkage.

How to press, three ways:

- **printed screws** — through each tab into its lug, tightened in turn
  until the legs stand on the ears. Pressing pulls a screw in tension, the
  weak direction of a printed part: go gently.
- **steel bolts** (the thread off) — an M10 × 55 bolt down through the tab
  and the lug, a washer and a nut on the landing.
- **a G-clamp** — one jaw on the tab, the other on the landing; works with
  the thread on or off.

To part the two: take the screws out, slide a stop into each gap on the
lug's seat, the boss up under the tab's hole, and turn the printed screws
into the lugs from below. The tip finds the stop's dimple and lifts it, the
boss goes into the tab's hole; tightened in turn, the screws lift the punch
evenly (pushing is compression: the printed screws hold it). The heads need
about 3 cm under the lugs: stand a low mold on a ring or two blocks. Without
the thread there is nothing for a bolt from below to screw into: part by
hand.

Print the screws standing on their heads and the stops dimple down, both
with 100 % infill or five walls or more; the threads print best at 0.2 mm
layers or finer. If a printed screw is tight, run it in and out a few
times, or raise the **Thread fit** for the next mold.

## Tile mold

One part for a flat plate with relief — a keychain, a tile, a medallion. The
model lies as it would on the table: **its back down**, its face (the relief)
up. The mold is the plate turned over and sunk into a block: its shadow
grown by a flat **Land** a scraper rides on (6 mm by default, 2–30 mm),
the floor under the face as thick as the **Wall**.
A hole through the plate (for a ring) is a post up to the rim. The back
stands 0.2 mm proud of the rim, so the scraper takes a hair off it.

The mold has to come off the plate by itself, so the app checks it (see
[Undercuts](#undercuts)). A face that overhangs — a letter wider at the top
than at the bottom — catches. A back that is not flat catches at the rim:
the panel asks to turn the model over if it lies face down.

How to work: press the clay into the mold, scrape it flush with the rim,
turn the mold over and tap the tile out. There are no vents: they would
leave nubs on the face.

**Cut in two** (off by default) makes the mold of two parts cut across the
cavity at **Cut at** — % of the cavity's depth, 0 the face of the tile,
100 the rim, 50 by default:

- the **base** — the floor with the relief and the cavity up to the cut,
  printed as it stands; a post for a ring hole goes with it, up to the rim;
- the **frame** — the rest of the cavity and a **skirt** hanging down round
  the base, the **Skirt fit** off its side, the skirt as thick as the **Wall**. Its
  edge stops 1 mm over the table: the frame bears on the base, so the
  pressing keeps the joint shut. Printed turned over — the land on the bed,
  the skirt up.
- a **key**: a round lobe (R 5 mm) on one side of the outline of both
  parts, the skirt following it — the frame goes on one way only, even on
  a round medallion.

Press the clay into the two parts stacked and scrape it as usual. To free
the tile, turn the stack over onto the board, lift the base off the face,
then the frame off the sides — no tapping. The check of undercuts is that
of the whole mold: both parts leave the tile the same way. The two parts are
a file each (`keychain-tile-base.stl`, `keychain-tile-frame.stl`), or one
file when **On the bed** asks for it.

| Parameter        | Range      | Default | What it does                           |
| ---------------- | ---------- | ------- | -------------------------------------- |
| Shrinkage        | 0–30 %     | 12      | the plate grows by it                  |
| Wall             | 1.2–12 mm  | 3       | the floor of the mold under the face   |
| Allowed undercut | 0–6 mm     | 1       | how deep the plate may catch the mold  |
| Land             | 2–30 mm    | 6       | the flat rim a scraper rides on        |
| Cut in two       | on / off   | off     | a base and a frame with a skirt        |
| Cut at           | 10–90 %    | 50      | the cut, % of the cavity's depth       |
| Skirt fit        | 0.1–0.6 mm | 0.2     | the gap between the skirt and the base |

## Two halves

A mold for a piece that is not a body of revolution — a deformed ball, an
asymmetric vase: two halves parted by a plane, no punch. Press the clay into
each half and even it with the fingers, cut it flush with the land and the
rim; take the halves out leather-hard and join them, scored and slipped.

The plane is square to the **axis** picked — X or Y part the piece upright,
Z across its height — at the **position** set in % of the piece's size along
that axis. The **spin** in the Model card turns the piece under an upright
plane. Both belong to the model in hand, like its turn.

Each half is a **shell**: the wall behind the piece is the **Wall** thick
everywhere, the seam included, and round the cavity a flat **Land** (12 mm wide
by default) twice the wall thick lies in the plane — cut the clay flush with
it. A half is printed **parting face up**; its back and the land need
supports in the slicer. A hollow piece is filled first: the mold sees only
its outside. An open piece's mold ends at its rim — a wavy one too — and
keeps out of its mouth: cut the clay along the mold's edge.

The two halves must come off (see [Undercuts](#undercuts)); the panel names
the depth of each. **Find the plane** looks for the position, and for an
upright plane the spin, with the shallowest undercut and sets them; it takes
a few seconds, up to a quarter of a minute for a large model. The mold copies
the piece with its undercuts — a plane is a compromise for a piece with
waves across it, and the allowed undercut says how much of one is taken.

| Parameter        | Range     | Default | What it does                                   |
| ---------------- | --------- | ------- | ---------------------------------------------- |
| Shrinkage        | 0–30 %    | 12      | the piece grows by it                          |
| Wall             | 1.2–12 mm | 3       | the shell of each half; the land is twice that |
| Allowed undercut | 0–6 mm    | 1       | how deep the piece may catch a half            |
| Land             | 2–30 mm   | 12      | the flange round the cavity in the plane       |
| Plane across     | X, Y, Z   | X       | the axis the parting plane is square to        |
| Plane at         | 5–95 %    | 50      | where the plane cuts the piece                 |

### Undercuts

A tile mold and the halves have no punch to push them off: the piece must
leave them along their pull. The app measures **how deep** the piece holds
a mold, in mm — the mold that would run into the clay on its way off, and
how far that is from the clay. A gentle wave lets a slab go; a bulge over
the parting plane holds it. Leather-hard clay bends a few millimetres, soft
clay tears: the **allowed undercut** is yours. Deeper than that, the export
is blocked and the panel says where the catch is. Catches under about a
millimetre and a half (a cell of the check) are not seen; over the rim of
an open piece the halves are not checked — the clay is cut along their edge.

## Export

At the bottom of the **Tooling** card, under the settings of the chosen
mode: the part list shows what the download will hold, with sizes. **Export**
builds the parts at full detail, checks each mesh (closed, normals out) and
downloads them, named after the model: the master and pour boxes one STL per
part (`teapot-bath-half-A.stl`), the slump mold one STL with the punch, the
screws and the stops (`teapot-slump.stl`), the tile mold one STL
(`keychain-tile.stl`; cut in two, a file each part), the two halves one STL each (`vase-split-A.stl`).

**On the bed** (pour boxes, the slump mold, the two halves and a tile mold
cut in two) says how the parts lie in that STL:

| Parameter       | Choices                            | Default | What it does                                                                                                               |
| --------------- | ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| All in one file | on / off                           | off     | pour boxes and halves: one STL with every part (`teapot-bath.stl`, `vase-split.stl`) instead of a file each                |
| Layout          | auto, in a row, one behind another | auto    | rows along x, the rows one behind another along y; auto breaks the parts into rows so that the longer side is the shortest |
| Gap             | 2–50 mm                            | 15      | between the parts                                                                                                          |

Under them the size the parts take on the bed. Layout and gap are offered
only when the parts go into one file; a change of them lays the parts out
again at once, with no new build. The view shows the parts as they lie.

## What is remembered

The project is saved in the browser on every change and comes back on the
next visit: the model itself, its turn, mouth, plug and split plane, and
the mode, the kind of press mold, the parameters, the parting choice, the
detail and the layout on the bed. A newly opened model starts from the
default turn, mouth, plug and plane. The other
settings stay as they were.

The browser keeps a few megabytes for every app on the same site. A model
too large for that is not kept (the Model card says so): open it again
after a reload. Its settings are kept anyway.

The interface is in English and Russian: the language comes from the
browser, the menu in the top bar switches it and is remembered too.
