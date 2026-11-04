# Thread fit, a full reset, the project kept

Asked on 2026-11-04 (one branch `fit-reset-project`, one PR):

1. In the slump mode the screws go into the thread very tight: a control for
   the clearance between the screw and the thread, with a larger default.
2. "Reset" resets not only the model but the settings too, to the defaults.
3. The current project is kept in localStorage, as case-constructor does.

## F. The thread's fit

What there is: `THREAD_FIT_MM = 0.35` (`geo/thread.ts`), the radial
clearance of the **lug's threaded hole**. The printed screw is cut with no
fit (`threadRod(…, 0, …)`), so the fit lives in the mold alone. A different
fit changes the hole, never the screw or the stop: one printed set still
fits every mold. The "no adjustable fit, it would break reuse" note in
PLAN-SCREWS was too strict. With a fit of its own, a mold takes the same
screws more loosely.

The flanks overlap by `pitch / 2 − fit` = `1 − fit` mm (the depth is half
the 2 mm pitch):

| fit, mm | overlap, mm | note                                                   |
| ------- | ----------- | ------------------------------------------------------ |
| 0.35    | 0.65        | now: case-constructor's test print, too tight here     |
| **0.5** | **0.5**     | the new default: still more than ISO M10 × 1.5 at 0.35 |
| 0.7     | 0.3         | the slider's top: a loose thread that still bites      |

- `MoldState.threadFitMm`: default 0.5, clamped to [0.2, 0.7], step 0.05. In
  the mm of the print, **never scaled by the shrinkage**, like every size of
  the clamps.
- `thread.ts`: `THREAD_FIT_MM` becomes `THREAD_FIT_MM` (default),
  `THREAD_FIT_MIN_MM`, `THREAD_FIT_MAX_MM`.
- `PressOptions.fitMm` (`pressOptions(mold)`), read by `screwLayout`: the
  hole's wall (`HOLE_WALL_R_MM` becomes a function of the fit), `from` and
  `footZ`. Read by `lugSolids` too: the threaded hole and the plain bore
  below it.
- UI: a slider "Thread fit" / "Зазор резьбы" in `ui/screws.ts`, shown in the
  slump mode with the clamps on, after the two checkboxes. The hint says it
  touches only the hole in the mold: the printed screws stay the same.
- Tests (red first):
  - `mold/state`: the default, the clamping, idempotence;
  - `thread.test`: the overlap stays positive (≥ 0.3 mm) at the largest fit;
  - `press.test`: a larger fit widens the hole's wall in `screwLayout`, the
    ear's envelope still holds it;
  - `tooling.test`: the lug's hole follows the mold's fit (the core radius
    at 0.35 and at 0.6), the screw stays the same;
  - `ui/screws.test`: the slider is there only with the clamps on.
- AGENTS.md invariant: "the screws, stops, … are constants" gets "the fit of
  the lug's hole is the user's: it never touches the screw".

## R. Reset

What there is: `#turnReset` in the Model card undoes the quarter turns and
the spin only.

What it does now: the whole `Setup` back to `defaultSetup()` (turns, spin,
mouth, plug), and the `Settings` back to `defaultSettings()` **except the
language and the mode tab**. The model stays loaded. The rebuilt panel, a
new preview, everything saved.

- `state.ts`: `resetSettings(settings): Settings` — pure, tested in node:
  everything at the defaults, `locale` and `mode` kept.
- The button's tooltip: "Reset the turns and all settings" / "Сбросить
  повороты и все настройки". docs/tooling.md says so.
- No confirmation dialog: the button is small and sits apart from the
  sliders. (If a misclick is a worry, an undo note would be better than
  `confirm()`. Not in this plan.)
- Smoke: change a slider and the spin, Reset, both back at the defaults; the
  language and the tab stay.

## P. The project kept

What there is: `Settings` (mode, mold, scheme, resolution, bed, language)
are already saved on every change under `cast-builder`. Nothing more is
saved: after a reload the model is gone, and so are its turns, its mouth and
its plug.

Like case-constructor's `currentProject`: everything is saved on every change,
and the next visit opens it again.

- Two keys, both versioned:
  - `cast-builder` (VERSION 1 → 2): `{ version, settings, setup }`. The
    setup is written on every change, like the settings. **Migration:** a v1
    record keeps its settings, and the setup is the default. A test covers
    it.
  - `cast-builder-model` (VERSION 1): `{ version, name, positions, indices }`.
    The welded mesh as Float32/Uint32 in base64, written **only when a model
    is loaded**, never on a slider. A sanitizer checks it like `sanitizeJob` does
    (lengths, indices in range, finite numbers). Garbage means no model.
- Quota: localStorage is ~5 MB, **shared by every app on
  `dmitryweiner.github.io`**. If the model's write fails, the old model key
  is removed, so a stale model never reopens with a new setup. The Model card
  says: "The model is too large to keep: open it again after a reload". The
  settings and the setup are saved anyway.
- Startup: a saved model goes through the same path as an opened file
  (`place`, thumbnail, preview) but keeps the saved setup instead of the
  default one.
- `storage.ts`: `loadProject` / `saveProject` / `saveModel` / `loadSavedModel`.
  Storage stays a parameter: `KeyValueStorage` gets `removeItem`. Every
  access is in try/catch, and the write returns `'ok' | 'blocked' | 'full'`
  like case-constructor's `writeStorage`.
- Tests: the round trip of the setup and of a mesh (bytes equal); v1 → v2;
  garbage in either key; quota → the model key removed and the result
  `'full'`; a blocked storage never throws.
- Smoke: open the vase, turn it, spin 90°, set the fit; reload → the same
  model (`#modelInfo`), spin 90, the turns, the fit; the preview builds.

## Order

1. F (geometry, then the slider), 2. R, 3. P, then docs (tooling.md,
   AGENTS.md: layout, invariants, the plans index), `npm run check`,
   `npm run smoke -- --preview`, one PR.

## Decisions (agreed 2026-11-04)

- **Q1.** The fit: default 0.5 mm, range 0.2–0.7. Agreed.
- **Q2.** Reset keeps the language and the mode tab; everything else goes
  to the defaults, the model stays. Agreed.
- **Q3.** The model itself is kept in localStorage when it fits, not only
  its setup. Agreed.

## Results and deviations

- **A looser fit starts the thread a little higher.** A wider hole meets the
  ear's 45° envelope higher up, so `threadZ` rises by at most the fit's
  growth plus one envelope step (0.25 mm). The plan expected nothing to
  move. The test checks that bound instead, and the thread never gets
  shorter than 8 mm.
- **Less bite at the loosest fit.** The plastic inside the screw's crest
  drops from 50+ mm³ (fit 0.35) to ~38 mm³ (0.7) per lug. The tooling test
  runs the hole at 0.5 and at 0.7.
- `isValidMesh` (`geo/stl.ts`) is the one mesh check for the worker's
  `sanitizeJob` and for the kept model.
- **Reset works with no model.** It is no longer disabled with the turn
  buttons: the settings are worth resetting without a model too.
- **Sizes kept** (welded mesh in base64, characters): the bowl, cup, pot
  and vase 0.11 M, the teapot 0.19 M, the hollow teapot 0.39 M, the largest
  fixture (the teapot with the lid alongside) 0.55 M. That is a tenth of the
  shared ~5 MB at most. Larger exports (a fine clayform resolution) can
  still hit the quota: the note covers that.
