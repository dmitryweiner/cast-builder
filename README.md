# Cast Builder

Slip-casting tooling for a ready piece. Open an STL of a vessel — from
[Clayform](https://dmitryweiner.github.io/clayform/) or anywhere else — and
get printable files:

| Mode       | What you get                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master     | the piece grown by the slip's shrinkage, with a pouring collar on the rim — take a silicone mold off it by hand                                                                                                           |
| Pour boxes | the app designs the plaster mold (one part, two halves, halves and a bottom plate, a mouth plug) and gives a printed box for each part with the part's positive inside: pour silicone, get a negative, cast plaster in it |
| Slump mold | a dished mold for pressing a clay slab in, and the punch that fits it, in one file                                                                                                                                        |

Everything runs in the browser, offline too. The model is read as
millimetres with its axis up; it can be turned by quarter turns and spun
about the axis so a handle or a spout lies in the parting plane. A hollow
print open at the top is filled by itself; a hollow teapot (open at the
spout too) has to come solid — Clayform's export has a "Solid" tick for that.

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
