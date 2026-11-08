# Agents guide

Cast Builder — a static, offline-capable web app that builds slip-casting
tooling for a ready STL: a master positive with a pouring collar, printed
pour boxes for silicone (one per part of a plaster mold the app designs
itself), a dished slump mold with its punch, and press molds with no punch:
a tile mold for a flat plate with relief and a mold of two printed halves
for a piece that is not round. TypeScript + Vite, no
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
  mode, a slump mold with screw clamps and their printed set (8 pieces, the
  sizes named) laid out in a row and in a column (the thread fit set), one
  for steel bolts (plain holes, stops only: 5 pieces), pour boxes in one file,
  the keychain's tile mold (refused face down; cut in two, a file each
  and one file), a hollow cup in two halves
  (a file each and one file, Find, the press kind remembered),
  the project kept over a reload and Reset, the thumbnail, a file upload,
  real downloads, turning and spin presets, languages, the phone sheet and
  width;
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
- `src/state.ts` — `Settings` (the user's habits; `press` the kind the press
  tab opens on) and `Setup` (the model in hand: orientation, mouth, plug,
  the split plane), with their sanitizers; `resetSettings` (all but the
  language and the mode).
- `src/storage.ts` — the project in localStorage, two versioned keys: the
  settings with the setup (`cast-builder`, written on every change) and the
  model itself (`cast-builder-model`, written only when a model is opened;
  removed when it does not fit).
- `src/geo/` — the pure core, no DOM, no Three.js:
  - `stl.ts` — read (binary and ASCII, vertices welded) and write STL;
    `isValidMesh`, the check of a mesh from outside (the worker, the
    storage);
  - `model.ts` — quarter turns, spin, placement (axis through the origin,
    bottom on z = 0);
  - `pieces.ts` — how many separate pieces are in a file;
  - `mouth.ts` — the mouth of a solid model and the gate radius;
  - `solidify.ts` — a hollow model made solid: its openings found and
    capped (CSG);
  - `revolve.ts` — a mesh read as a body of revolution for the slump mold;
  - `press.ts` — the slump mold and its punch, the layout of their screw
    clamps (`screwLayout`; no CSG);
  - `release.ts` — whether a piece comes out of a press mold with no punch,
    how deep it catches in mm (`castRays`, `releaseDepth`, `reachOf`; pure);
  - `tile.ts` — the tile mold, whole or cut in two: a base and a frame
    with a skirt (`tileCutZ` the height of the cut; CSG, worker only);
  - `split/` — the mold of two halves: the shells as height fields and
    their turn for the print (`shell`, pure), the cut over an open piece's
    rim and inside its mouth (`rim`, pure), the search for the plane
    (`find`, pure), a half assembled (`index`, CSG, worker only);
  - `thread.ts` — the clamps' frozen sizes: M10 × 2 thread, tab, gap,
    screw (its neck), stop, the room under the landing, the steel bolt
    (`STEEL_BOLT_MM`); the fit's default and limits; `screwSolids.ts` — the
    threaded rod, the screw, the stop, the mold's lugs and the punch's tabs
    as solids, the cuts of the mold round them (worker only);
  - `mold/` — undercut analysis and the parting scheme (`analyze`), plaster
    blocks and the plug (`block`), pour boxes (`bath`) and the void under
    their positive (`underside`), parameters (`state`), the facade (`index`);
  - `csg.ts` — the bridge to manifold-3d; `surface.ts`, `bottom.ts`,
    `lathe.ts`, `normals.ts` — mesh assembly; `layout.ts` — parts on the
    bed in rows (`arrangeOnBed`); `validate.ts` — the export gate; `message.ts` —
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
  — controls (a range may carry preset buttons, a checkbox a note under it;
  `screws.ts` the clamps, the thread, its fit, the print boxes with the
  sizes they print; `bed.ts` the layout on the bed and `inOneFile`;
  `press.ts` the press kind, the allowed undercut, the split plane, the
  undercuts found), progress bar, the panel as
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
- `plans/TODO-PUNCH-LEGS.md` — the punch's legs grazed the corners of the
  ears (found 2026-11-03, fixed 2026-11-04): what, how much, the fix.
- `plans/TODO-UI-03.11.2026.md` — small UI/UX improvements asked for;
  `plans/PLAN-UI.md` — how they were done (the layout of the siblings, a
  burgundy theme, the model thumbnail).
- `plans/PLAN-FIT-RESET-PROJECT.md` — the thread fit as a setting, Reset of
  all settings, the project (the model included) kept over a reload.
- `plans/PLAN-CLAMP-HARDWARE.md` — the second test print (screws tore at the
  head): a landing under the lugs for steel, the thread optional, stops on
  their own, the screw's neck, the sizes in the panel.
- `plans/PLAN-PRESS-MOLDS.md` — press molds with no punch: a tile mold
  (one part, flat plates with relief) and a two-part press mold for pieces
  that are not round (shells as height fields over the plane, the release
  check in mm, the rim cutter, "Find").
- `plans/PLAN-TILE-CUT.md` — the tile mold cut in two: a base and a frame
  held by a skirt.

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
  not round by more than half the slab, or whose outside narrows upwards
  by more than 2 mm (the rim's top 3 mm aside), gets a warning, not a
  refusal — both read on that outer grid, never on the whole mesh: the
  inside of a hollow piece looks up.
- The mold measures itself (`SlumpFit`) and the punch is built from that
  measure — the legs never miss the ears. One grid step past a leg's edge
  the flange's points stay wide and high: a face going down and in at once
  would cut the ear's outer corner. A test asks the pressed punch for no
  overlap with the mold at all.
- The punch is printed flange down, **turned over** (half a turn about x,
  `turnOver`), never mirrored: a mirror in z put the tabs on the other side
  of the legs from the lugs once the print was turned by hand. A test that
  puts the printed punch back over the mold turns it the same way.
- The screw clamps' screws, stops, holes, the gap under the tab and the
  tab's thickness are constants (`geo/thread.ts`) and never scaled by the
  shrinkage: one printed set fits every mold. The one setting is the fit
  (`threadFitMm`, mm of the print): it widens the lug's threaded hole only,
  never the screw, so the set still fits. The lugs and tabs are built
  after the scaling, in the mm of the print, as prisms: in plan the hull of
  a boss and of the ear's (the leg's) side, with a flat top. A lug's boss
  stands 2 mm into the ear's cheek, and the cheek is cut down round the
  stop. The boss ends in a flat **landing** LUG_THREAD_MM under the seat on
  every mold (one steel bolt for all), square to the axis, with NUT_ROOM
  kept free under it — cut off the ear's rib too; the landing prints on
  supports, so the ear never grows for a lug. Past the boss the lug's
  underside rises at 45° away from the ear from the landing's far edge of
  the hole and stays within the ear's outline widened up at 45°
  (`support`). The thread is the whole 12 mm; without it
  (`threadedLugs` off) the hole is plain Ø11 like the tab's and the printed
  screws are not offered. The screw's first `neck` mm (in the tab) are plain
  and as wide as the thread, coned into the head; the tab's hole is
  chamfered for the cone. A lug is cut back off the cavity with half a
  shell and off the clay over the rim; a tab off the clay under the flange
  and off the ear's cheeks. An export fuses them on; a preview lays them
  over unfused (the cuts of the cheeks and the rooms need the shell's
  import even there).
- The layout on the bed is the main thread's (`arrangeOnBed`): the worker
  returns every part in its own frame — the slump mold as the mold, the
  punch, the screws and the stops — and the app lays them out for the view
  and, in one file, for the STL. A change of the layout or the gap lays the
  last build out again with no new build. One STL: the slump mold always,
  pour boxes, split halves and a tile mold cut in two when asked
  (`inOneFile`).
- A press mold with no punch (tile, split) must come off by itself: the
  release check measures **depth** in mm — the locked mold's distance to
  the clay on voxels along the pull — never an area share (a gentle wave
  is 15 % of a vase's area). Over the allowed undercut (`allowedCatchMm`,
  the user's) the download is blocked; the parts are still shown. A locked
  voxel within a cell's diagonal of the clay is noise: catches under about
  1.5 cells are not seen.
- The tile mold reads the model as it is, never `solidify`: a raised
  border is relief, not a rim. Its back lies down; the mold is the tile
  turned over (never mirrored), the back 0.2 mm proud of the rim, the
  block its shadow grown by `tileLandMm`. Cut in two (`tileCut`), the
  plane at `tileCutPct` % of the cavity's depth from the face, moved
  0.1 mm off a flat face of the tile lying in it: the base under it as it
  stands, the frame over it with a skirt round the base (the fit
  `tileFitMm` the user's, 0.2 mm by default; the wall's thickness; down to
  half the base's height, the lower half bare for the fingers, at least
  `TILE_SKIRT_MIN_MM` long, never nearer the table than
  `TILE_SKIRT_LIFT_MM` — the frame bears on the base; `skirtEdge`),
  printed turned over. The
  outline of both parts has a lobe (`TILE_KEY_R_MM`) at its vertex furthest
  along +x unless `tileKey` is off: one lobe, no symmetry, the frame goes
  on one way only. A
  post over the plane goes with the base, up to the rim: the frame keeps
  its largest piece. The release check is the whole mold's.
- A split half is a height field over the plane on the release check's
  grid: the back is the piece's reach dilated by a ball of the wall (along
  the normal: by the seam the wall runs along the pull), never under a
  2-wall land; cut to the land's outline (the half's shadow grown by `splitLandMm`)
  with the exact piece taken out. Printed turned (never mirrored), the
  parting face up, on supports. A half keeps its largest piece only: a
  mouth folding round the axis leaves islands of mold the rim cutter does
  not reach.
- An open piece's split mold ends at its rim and keeps out of its mouth:
  one polar cutter round the axis, over z = top(θ) − 0.2 and inside the
  mouth over the lid; the release check does not look over the lid's crest.
- The project is kept on every change; the model only when opened, never
  on a slider. A model that does not fit removes the one kept before: a
  stale model must not reopen under a fresh setup. The setup is restored
  only with its model.
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
| tile mold (keychain)                              | 30–40 ms; cut in two 80–90 ms                      |
| split, two halves (cup, vase, hollow teapot)      | preview 0.8–1.2 s; export 0.9–1.6 s                |
| split, MathSculpt's vase (263k triangles)         | preview 2.4–2.6 s; export 3.4–3.6 s                |
| the release check, the vase's half                | 22 ms at 1.1 mm cells, 90 ms at 0.7 mm             |
| Find: a clean plane at no turn / at a quarter     | 0.1 s / 14 s (hollow teapot)                       |
| Find: the vase, catching everywhere (whole scan)  | 14 s                                               |

The preview waits 400 ms after the last edit; the worker's queue is one job
deep, a waiting preview is replaced by a fresher one, an export or a Find
never.

## What is not there

- Rounded outer edges of the plaster block.
- A parting flange on the master positive, a ring key under the bottom plate.
- A seating cylinder below the plug's ledge: the plug casts the ledge and
  the gallery over it; lower the wall comes out at its usual thickness.
- Pour boxes for the slump mold: the mold itself is printed, as a shell.
- Screw clamps of another size or pitch, more than three of them; a lug
  held at 45° on a shape that widens below its rim; the jacking screws need
  room under the lugs for their heads (a low mold stands on blocks); parting
  with steel (a plain hole has nothing for a bolt from below to screw
  into); a screw printed lying on its side; a landing wider than the boss.
- A slump mold on a hump ("+"); handles on the punch; adjustable clearance
  and leg sizes other than the ear's seat (constants in `geo/press.ts`);
  separate objects in the STL (mold and punch are one mesh — "split into
  parts" in the slicer).
- Openings other than the top one and planar cuts (a spout tip cut by a
  curve), openings picked by hand in the view, a model turned over by the
  app itself.
- An axis other than the foot's centroid: a model with no flat foot falls
  back to the middle of its bounding box.
- A split mold's parting surface that is not a plane (following the
  silhouette, what a wavy piece really wants), a plane at a slant, more
  than two parts, a bottom plate, keys between the halves; undercuts filled
  by the mold itself; a block-shaped half with a flat back; the crests of a
  wavy rim checked for catches.
- A tile with relief on both faces, a draft added to its walls, vents in
  the tile mold; a cut of the tile mold that is not flat, the frame lifted
  off upright checked for release.

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
