# The model and the tooling

## The model

**Open STL** (or drop a file on the view, or try the sample teapot). Binary
and ASCII STL are read; the units are taken as millimetres. The model must
be a closed solid — an STL with holes or loose edges is refused with a
reason; repair it where it came from.

The tooling assumes the piece stands upright with its axis vertical, and
that a handle or a spout lies along X — the mold parts in the XZ plane.

- **Turn about X / Y**, **Upside down** — quarter turns for a model that
  comes lying on its side or upside down. **Reset** undoes them.
- **Spin** — about the vertical axis, in 5° steps: put the handle and the
  spout along X.

The axis is found by the foot (the down-facing faces at the very bottom),
so a handle does not pull it to one side; the model is dropped onto the
table.

**Hollow models.** The plaster only sees the outside of the piece — the
inside of a slip-cast piece is made by draining the slip. A hollow print
open at the top is therefore filled before the mold is built (the panel
says so). A hollow model open in more than one place (a teapot with its
spout channel) cannot be filled: export it solid — in Clayform tick
**Solid** in the export panel.

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
rim of a filled hollow piece. The gate is a little narrower than the rim,
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
thickness. Both are shells, side by side in one STL; split them in the
slicer if they do not fit the bed together.

The mold is built from the model read as a body of revolution: its outer
surface with all its relief is the working surface, the mean radius of each
height is the smooth silhouette the punch follows. A recessed mark under the
bottom becomes a raised one on the mold's floor. A model that is not round
(a handle, an oval) gets a warning — the punch is round and the slab will be
uneven. A piece wider somewhere than above it gets a warning too: it will
not come out.

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

How to work: lay the slab on the mold and press it in by hand; cut the
overhang to under a centimetre; lower the punch until its legs stop on the
ears; lift the punch and trim the slab along the rim.

## Export

The part list shows what the download will hold, with sizes. **Export**
builds the parts at full detail, checks each mesh (closed, normals out) and
downloads one STL per part, named after the model.

## What is remembered

The mode, the parameters, the parting choice and the detail are saved in
the browser and come back on the next visit. The turn, the mouth and the
plug belong to the model: a newly opened model starts from the defaults.

The interface is in English and Russian: the language comes from the
browser, the menu in the top bar switches it and is remembered too.
