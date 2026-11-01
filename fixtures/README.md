# Test fixtures

Binary STL solids built by [clayform](https://github.com/dmitryweiner/clayform)'s
core at 48 segments, default parameters of each family unless noted:

| File                                         | What                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `bowl.stl`, `pot.stl`, `cup.stl`, `vase.stl` | the solid outer body (`buildVessel`)                             |
| `pot-handle.stl`                             | pot with a handle (`buildSolidVessel`), genus 1                  |
| `teapot.stl`                                 | pot 120 mm high with an applied spout whose tip is above the rim |
| `lid-upside-down.stl`                        | the lid of that teapot, upside down as it goes into a mold       |
| `cup-hollow.stl`                             | the printable hollow cup, open at the top                        |

They pin the shapes the tooling is tested on; regenerate them only on
purpose, from clayform's sources (`encodeSTL` of the meshes above).
