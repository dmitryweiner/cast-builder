# Agents guide

Cast Builder — a static, offline-capable web app that builds slip-casting
tooling for a ready STL: a master positive with a pouring collar, printed
pour boxes for silicone (one per part of a plaster mold the app designs
itself), and a dished slump mold with its punch. TypeScript + Vite, no
framework, Three.js for the view, manifold-3d (WASM) for the boolean
operations in a worker. Tests on Vitest (node and jsdom) and a Playwright
smoke. UI in English and Russian. Deployed to GitHub Pages.

It was split out of [clayform](https://github.com/dmitryweiner/clayform),
which designs the pieces; clayform's export — the piece as it is printed in
clay, hollow — is the hand-off, and the solid master is made here.

The shared conventions behind this setup are in `~/projects/CLAUDE.md` and
`~/projects/_conventions/`; this file is what holds for this repository.

## Commands

Node.js — the version in `.node-version` (`fnm use`; check `node -v`).

- `npm ci` — install dependencies.
- `npm run dev` — dev server.
- `npm run check` — typecheck + oxlint + prettier + unit tests. Must pass before
  any work is called done.
- `npm run smoke` — browser smoke on the dev server: the sample through every
  mode, a slump mold with screw clamps and their printed set (8 pieces), the thumbnail, a file upload, real downloads, turning and spin
  presets, languages, the phone sheet and width;
  `-- --preview` builds and also checks offline mode (the worker and its WASM
  included); `-- --shots` saves screenshots to `shots/`. Each step prints its time.
- `npm run build` — typecheck and build into `dist/`.
- `npm run format` — prettier.
- `npm run icons` — render the PWA PNG icons from `public/icon.svg`.

CI (`.github/workflows/ci.yml`) runs `check`, the preview smoke and a grep that
the main chunk has no `manifold` on every push and PR; a push to `main`
publishes `dist/` to GitHub Pages.

## Test-driven development is mandatory

Every behaviour change goes red → green → refactor:

1. Write a failing test that describes the new behaviour or reproduces the bug.
   Run it and see it fail for the expected reason.
2. Write the minimal code that makes it pass.
3. Refactor with the tests green.

Pure logic → `*.test.ts` in node; anything touching the DOM → jsdom
(`// @vitest-environment jsdom`, the real `index.html`); what needs a real
browser (the worker, WebGL, downloads, the service worker, layout) → a step
in `scripts/smoke.mjs`. The CSG tests run the real WASM in node.

Geometry tests use `fixtures/*.stl` — meshes built by clayform's core, the
printable hollow ones and the older solid ones (see `fixtures/README.md`).
Regenerate them only on purpose.

## Layout

- `src/main.ts` — entry: starts the app with browser storage and languages,
  registers the service worker in production (`src/pwa.ts`).
- `src/sw-plugin.ts` — the Vite plugin that writes `sw.js` with the precache
  list of the build (the worker chunk and its WASM included).
- `src/app.ts` — DOM wiring: the model in, the panel, previews and exports
  through the worker, downloads.
- `src/state.ts` — `Settings` (the user's habits, saved) and `Setup` (the
  model in hand: orientation, mouth, plug), with their sanitizers.
- `src/storage.ts` — versioned settings in localStorage.
- `src/geo/` — the pure core, no DOM, no Three.js:
  - `stl.ts` — read (binary and ASCII, vertices welded) and write STL;
  - `model.ts` — quarter turns, spin, placement (axis through the origin,
    bottom on z = 0);
  - `pieces.ts` — how many separate pieces are in a file;
  - `mouth.ts` — the mouth of a solid model and the gate radius;
  - `solidify.ts` — a hollow model made solid: its openings found and
    capped (CSG);
  - `revolve.ts` — a mesh read as a body of revolution for the slump mold;
  - `press.ts` — the slump mold and its punch, the layout of their screw
    clamps (`screwLayout`; no CSG);
  - `thread.ts` — the clamps' frozen sizes: M10 × 2 thread, fit, tab, gap,
    screw, stop; `screwSolids.ts` — the threaded rod, the screw, the stop,
    the mold's lugs and the punch's tabs as solids (worker only);
  - `mold/` — undercut analysis and the parting scheme (`analyze`), plaster
    blocks and the plug (`block`), pour boxes (`bath`) and the void under
    their positive (`underside`), parameters (`state`), the facade (`index`);
  - `csg.ts` — the bridge to manifold-3d; `surface.ts`, `bottom.ts`,
    `lathe.ts`, `normals.ts` — mesh assembly; `layout.ts` — parts side by
    side on the bed; `validate.ts` — the export gate; `message.ts` —
    messages as codes;
  - `testing.ts` — helpers of the geometry tests (fixtures, analytic
    bodies), never imported by the app.
- `src/worker/` — `tooling.ts` runs one job (tested in node; `slumpTooling`
  the slump mold with its clamps), `csg.worker.ts`
  is its thin adapter, `client.ts` the main thread's queue, `protocol.ts` the
  types of both sides.
- `src/render/` — Three.js: `scene.ts` the main view (tooling only, on a
  print bed grid, orbit camera), `thumb.ts` the model thumbnail in the Model
  card (drawn once per change, no controls, the three axes labelled),
  `look.ts` their shared colours and lights, `guides.ts` the pure numbers of
  the bed and the axes (tested in node). `src/ui/`
  — controls (a range may carry preset buttons; `screws.ts` the clamps'
  two checkboxes), progress bar, the panel as
  a bottom sheet on a phone (`sheet.ts`), typed DOM access (`dom.ts`).
- `src/i18n/` — `en.ts` defines the keys, `ru.ts` follows; `index.ts` —
  locales, detection, templates.
- `scripts/lib/harness.mjs` — Playwright plumbing; `scripts/smoke.mjs` — the
  smoke; `scripts/icons.mjs` — icon rendering; `scripts/fixtures.mjs` — the
  printable fixtures from clayform's sources, run with clayform's vite-node
  (`../clayform/node_modules/.bin/vite-node --root ../clayform scripts/fixtures.mjs`);
  with `--presets [--res <n>]` it writes nothing and checks instead that
  every built-in clayform preset, exported as printed (192 segments by
  default), fills into a master: one shell, genus = handles, the mouth on
  top, the lid `openBottom` as printed and filled turned over (~10 s). Run
  it after changing `solidify` here or the body, spout or lid in clayform:
  the fixtures are frozen and would not notice.
- `docs/` — user documentation.

## Plans

- `plans/TODO-SOLID.md` — what Clayform's printable export needs here.
- `plans/PLAN-SOLID.md` — how it was done, decisions and results.
- `plans/PLAN-SCREWS.md` — screw clamps for the slump mold: printed M10 × 2
  screws and stops, lugs and tabs; decisions, measurements.
- `plans/TODO-PUNCH-LEGS.md` — the punch's legs graze the corners of the
  ears (found 2026-11-03, in `main` too): what, how much, what to do.
- `plans/TODO-UI-03.11.2026.md` — small UI/UX improvements asked for;
  `plans/PLAN-UI.md` — how they were done (the layout of the siblings, a
  burgundy theme, the model thumbnail).

## Architectural invariants

- **The main thread never loads the WASM.** All CSG is in `src/worker/`;
  `app.ts` takes `geo/mold/analyze` and `geo/mold/state` directly, never the
  `geo/mold` facade. CI greps the main chunk for `manifold`.
- The worker's boundary is an outer boundary: `sanitizeJob` checks the mesh
  (typed arrays, indices in range, finite coordinates) and passes the rest
  through the same sanitizers as the UI and localStorage. Sanitizers never
  throw and are idempotent — tests check it.
- Manifold objects are not collected by the GC: everything made goes into a
  `CsgScope`, which is disposed.
- The core works in millimetres; the axis is z, the bottom at z = 0, the
  axis of the body through the origin. `placeModel` finds the axis by the
  centroid of the foot (down-facing faces at the bottom), not by the
  bounding box: a handle would pull the box off the axis. The parting plane
  is XZ (y = 0): a handle or a spout must lie in it — the user spins the model.
- Coincident surfaces are the worst input of a boolean operation. The auto
  gate is narrower than the rim (`gateRadius`); the plug's socket is wider
  than its flange; the fill lid of a hollow model overlaps the wall instead
  of touching it.
- A void inside a cavity is more cavity: `buildCavity` drops closed voids
  (`dropVoids`) after the collar is fused on.
- One file, one piece: `bodies` counts the connected parts of positive
  volume, and two of them (Clayform's "Lid alongside") block every mode.
- A hollow model is filled by lids across its openings and dropping the
  closed void. The top opening is the highest slice with a hole **around the
  axis** — not the top of the mesh: a spout's tip is higher. If that lid
  leaves the inside open, every planar patch with a hole (a spout's tip cut
  by a plane) gets a lid too, except patches looking down (a foot ring's
  recess is the outside) and lids meeting the top one (a flat rim). Still
  open → `open`, the user is told to bring a solid model. No top opening
  but a bottom one closing more void than there is material → `openBottom`:
  a lid as printed, the user is asked to turn it over. The model is never
  turned by the app.
- The mouth is where the collar stands: the largest up-facing flat area in
  the upper half of a solid model (the tip of a spout is higher but smaller),
  the crest of the rim of a filled hollow one, or numbers set by hand.
- The scheme is the analyzer's unless picked by hand (`withScheme`); a
  through hole (genus > 0) rules out a one-part mold.
- The slump mold reads the model as a body of revolution (`meshSource`):
  rays from the axis take the outermost face per row and angle; the mean
  radius per row, smoothed along the curve (σ 2.5 mm: relief running round
  the piece does not cancel in the mean), is the silhouette the punch is
  built from; the punch is its honest offset by the slab (points that come
  nearer than the slab are dropped, never clamped into shelves); the lowest
  down-facing face over the foot is the relief of the mold's floor. A model
  that is not round gets a warning, not a refusal.
- The mold measures itself (`SlumpFit`) and the punch is built from that
  measure — the legs never miss the ears.
- The screw clamps' screws, stops, holes, the gap under the tab and the
  tab's thickness are constants (`geo/thread.ts`) and never scaled by the
  shrinkage: one printed set fits every mold. The lugs and tabs are built
  after the scaling, in the mm of the print, as prisms: in plan the hull of
  a boss and of the ear's (the leg's) side, with a flat top. A lug's boss stands 2 mm into the ear's cheek,
  and the cheek is cut down round the stop. A lug's underside rises at 45°
  away from the ear and stays within the ear's outline widened up at 45°
  (`support`): it prints without supports. The thread starts where that
  envelope holds the hole (`threadZ`, 12 mm or less, never under 8; a plain
  bore below); only below 8 mm does the ear's face go lower
  (`earShortfall`), and not at all when that would not help. A lug is cut
  back off the cavity with half a shell and off the clay over the rim; a tab
  off the clay under the flange and off the ear's cheeks. An export fuses
  them on; a preview lays them over unfused (the cheeks' cut needs the
  shell's import even there).
- Every visible text goes through `src/i18n/`; a Cyrillic string literal
  outside `ru.ts` fails a test.

## What costs what

Measured on an M1 Max in node (`runJob`), the clayform fixtures (5–16k
triangles):

| Job                                               | Time                                               |
| ------------------------------------------------- | -------------------------------------------------- |
| master (teapot)                                   | 30–50 ms                                           |
| pour boxes, 2–3 parts (teapot, pot with a handle) | 1.1–1.6 s, half of it the void under the positive  |
| pour boxes, a hollow cup (fill included)          | 0.5 s                                              |
| filling: a solid model / a hollow cup             | 5–10 ms / 25–35 ms                                 |
| filling a hollow teapot (spout tip included)      | 0.1 s; its master 0.15 s, its pour boxes 1.4 s     |
| a printed lid turned over: master / pour boxes    | 35 ms / 0.35 s                                     |
| slump mold + punch, preview grid 128              | 0.03–0.1 s                                         |
| slump mold + punch, export grid 384               | 0.7–0.9 s, ~1M triangles                           |
| the same with screw clamps (bowl, cup, vase…)     | preview 0.3–0.5 s (teapot 0.9 s); export 2.8–3.8 s |

The preview waits 400 ms after the last edit; the worker's queue is one job
deep, a waiting preview is replaced by a fresher one, an export never.

## What is not there

- Rounded outer edges of the plaster block.
- A parting flange on the master positive, a ring key under the bottom plate.
- A seating cylinder below the plug's ledge: the plug casts the ledge and
  the gallery over it; lower the wall comes out at its usual thickness.
- Pour boxes for the slump mold: the mold itself is printed, as a shell.
- Screw clamps of another size, pitch or fit, more than three of them; a lug
  held at 45° on a shape that widens below its rim; the jacking screws need
  room under the lugs for their heads (a low mold stands on blocks).
- A slump mold on a hump ("+"); handles on the punch; adjustable clearance
  and leg sizes other than the ear's seat (constants in `geo/press.ts`);
  separate objects in the STL (mold and punch are one mesh — "split into
  parts" in the slicer).
- Openings other than the top one and planar cuts (a spout tip cut by a
  curve), openings picked by hand in the view, a model turned over by the
  app itself.
- An axis other than the foot's centroid: a model with no flat foot falls
  back to the middle of its bounding box.

## Conventions

- Code comments, docs and README in English.
- Pure logic lives in modules without the DOM; time, storage and browser APIs
  are parameters so tests can replace them.
- The package name in `package.json` is the app id: Vite injects it as
  `__APP_ID__`, the storage key and the service worker's cache prefix. All
  apps on `<user>.github.io` share one origin, so it must be unique.
- Every interface text lives in `src/i18n/`. Static texts in `index.html` are
  marked `data-i18n="key"` (text), `data-i18n-label` (`aria-label`) or
  `data-i18n-title` (`title`) and keep the English text as the default; tests
  check every key in every language and the same template parameters.
- Do not change the stored format without bumping `VERSION` in
  `src/storage.ts` and a test for the reset or migration.
- No `as` casts in app code; a disabled lint rule carries its reason.
- A helper script that may be needed again goes to `scripts/` with a header
  comment and a line in this file. A new browser check is a step or a flag in
  `scripts/smoke.mjs`, not a new file.
- Each feature gets its own branch and a pull request.
