# Test fixtures

Binary STL meshes built by [clayform](https://github.com/dmitryweiner/clayform)'s
core at 48 segments, default parameters of each family unless noted.

What clayform exports — printed in clay, hollow:

| File                    | What                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cup-hollow.stl`        | the printable cup, open at the top, its rim rounded to half the wall                                                           |
| `teapot-hollow.stl`     | the pot 120 mm high with the applied spout, open at the top and at the tip, with the seat for the lid (`buildPrintableVessel`) |
| `lid-printed.stl`       | its lid as printed: skirt down, hollow under the dome, open at the bottom (`buildLidMesh`)                                     |
| `teapot-lid-beside.stl` | both in one file, as "Lid beside" exports them                                                                                 |

Solid ones, as an STL from elsewhere may come:

| File                                         | What                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `bowl.stl`, `pot.stl`, `cup.stl`, `vase.stl` | the solid outer body (`buildVessel`)                             |
| `pot-handle.stl`                             | pot with a handle (`buildSolidVessel`), genus 1                  |
| `teapot.stl`                                 | pot 120 mm high with an applied spout whose tip is above the rim |
| `lid-upside-down.stl`                        | the lid of that teapot, upside down as it goes into a mold       |

They pin the shapes the tooling is tested on; regenerate them only on
purpose. The printable ones come from `scripts/fixtures.mjs`. The solid
ones were `encodeSTL` of the meshes above; clayform has dropped
`buildSolidVessel` and `buildLidSolid({ upsideDown })`, so they can only be
regenerated from clayform `710c979`.
