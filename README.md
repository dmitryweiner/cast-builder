# Cast Builder

Slip-casting tooling for a ready piece. Open an STL of a vessel — from
[Clayform](https://dmitryweiner.github.io/clayform/) or anywhere else — and
get printable files:

| Mode       | What you get                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master     | the piece grown by the slip's shrinkage, with a pouring collar on the rim — take a silicone mold off it by hand                                                                                                           |
| Pour boxes | the app designs the plaster mold (one part, two halves, halves and a bottom plate, a mouth plug) and gives a printed box for each part with the part's positive inside: pour silicone, get a negative, cast plaster in it |
| Slump mold | a dished mold for pressing a clay slab in, and the punch that fits it, in one file                                                                                                                                        |
| Tile       | a press mold for a flat plate with relief — a keychain, a tile — checked that the plate comes out; one part, or cut in two (a base and a frame held by a skirt)                                                           |
| Two halves | a press mold of two printed shells parted by a plane for a piece that is not round, no punch; the app checks how deep it catches and can find the plane                                                                   |

Everything runs in the browser, offline too. The model is read as
millimetres with its axis up; it can be turned by quarter turns and spun
about the axis so a handle or a spout lies in the parting plane. Clayform's
export — a piece as it is printed in clay — goes in as it is: a hollow print
is filled by itself, across its top and across the flat-cut tip of a spout.
A lid comes skirt down and has to be turned upside down; a file with the lid
alongside the piece holds two pieces, so export the lid on its own.

**Live:** https://dmitryweiner.github.io/cast-builder/

User guide: [docs/](docs/README.md).

## Development

Node.js from `.node-version`.

```bash
npm ci
npm run dev       # dev server
npm run check     # typecheck + lint + format check + unit tests
npm run smoke     # browser smoke; -- --preview for the production build and offline mode
npm run build     # production build into dist/
```

The boolean operations are [manifold-3d](https://github.com/elalish/manifold)
(WASM) in a Web Worker; the main thread never loads it. See
[AGENTS.md](AGENTS.md) for the layout, the invariants and what costs what.

## License

GPL-3.0-or-later.
