# PLAN-UI — the panel on the left, a burgundy theme, a model thumbnail

How `TODO-UI-03.11.2026.md` is done. Branch `ui-polish`, one PR, a commit
per milestone. The look and the phone layout follow clayform and
case-constructor: a top bar, a 320 px panel on the left that scrolls by
itself, the view filling the rest; on a phone the panel is a bottom sheet.

## Decided with the user

2026-11-03, every question below answered with the recommended option:

- **Q1:** dark only, as the siblings; a burgundy accent on a dark wine
  background.
- **Q2:** the mouth goes inside the merged card, between the sliders and
  the parts.
- **Q3:** the thumbnail shows a thin line along X under the model.
- **Q4:** on a phone the panel is a bottom sheet; the view under it stays
  live, a tap on the view closes it, and the tooling is shifted up above
  the sheet (a view offset, as case-constructor's `setBottomInset`).

## Before

- A light/dark theme of its own (terracotta accent), the panel on the
  right, a footer under everything, the page scrolls as a whole.
- The loaded piece is shown in the main view until its tooling arrives.
- Model: four text buttons (Turn about X / Y, Upside down, Reset), a spin
  slider 0–355°.
- Four cards: Model, Tooling (tabs + sliders), Mouth and parting, Export.

## Milestones

### M1. Layout and theme

- `index.html`: `#app` (column, `100dvh`) → top bar (brand, Open STL,
  spacer, ⚙ Settings for the phone, language) → `#content` (row):
  `aside#panel` first, then `main#stage`. The footer links move to the end
  of the panel (small, muted).
- `style.css` rewritten on the siblings' tokens (`--bg`, `--panel`,
  `--card`, `--text`, `--muted`, `--accent`, `--accent-soft`, `--on-accent`,
  `--warn`, `--bad`, `--line`) with a burgundy accent; compact controls
  (22 px ± buttons, `accent-color` on sliders, uppercase muted card
  headings, tabs as in case-constructor). Logical properties stay (RTL).
- Mobile first: the base rules are the phone (the panel a bottom sheet over
  the view, `max-block-size: 58dvh`, opened by ⚙ Settings, closed by a tap
  on the view; progress bar above the button); `min-width: 761px` puts the
  panel on the left.
- Scene clear colour, `theme-color`, manifest colours and `icon.svg`
  background follow the theme; `npm run icons` re-renders the PNGs.
- The sheet's open/close logic is a small module `src/ui/sheet.ts`
  (matchMedia passed in) with a jsdom test.

### M2. The model thumbnail

- `Model` card gets a `<canvas id="thumb">` (≈ 100 % × 160 px), hidden until
  a model is loaded. `src/render/thumb.ts`: its own small `WebGLRenderer`,
  the same lights and terracotta material as the scene (shared from a
  `render/look.ts`), **no controls and no animation loop** — it renders
  once per change (load, turn, spin, resize).
- Fixed camera: in front of the parting plane, looking along +Y, a little
  from above — X runs left–right, so "a handle or a spout along X" is what
  the user sees in the thumbnail. A thin line on the floor along X marks
  the parting plane (see Q3).
- The main view shows only tooling: `scene.setPiece` goes away. A new model
  clears the view (progress bar runs); a turn keeps the old tooling until the
  new arrives. When there is nothing to show (blockers), the stage shows the
  first blocker as a caption — on a phone the sheet may be closed.
- The smoke: after loading, `#thumb` is visible and not blank (a pixel read
  through `toDataURL`), the stage shows no `#empty`.

### M3. Icon buttons in Model

- Turn about X, Turn about Y, Upside down, Reset → square icon buttons with
  inline SVG (rotation arrows with an "X"/"Y" letter, a flip, a reset arrow),
  `title` and `aria-label` from the dictionary (`data-i18n-title` +
  `data-i18n-label`, the existing keys `turn.*`). The i18n test already
  checks those attributes.
- The smoke clicks them by id as now.

### M4. Spin presets 0 / 90 / 180 / 270

- A row of four small buttons under the spin slider; the one equal to the
  current spin is `aria-pressed="true"` (accent). A click sets
  `orientation.spinDeg` through `setSetup`, as the slider does.
- Drawn by `renderControls`: a range control gets an optional
  `presets: readonly number[]`, so the buttons are re-drawn with the rows on
  a change of language and synced by `sync`. jsdom test in
  `src/ui/controls.test.ts` (the first one for controls): buttons appear,
  a click calls `onChange` with the value, `sync` moves `aria-pressed`.
- The smoke: a click on 90 changes `#model_spin` and the model info.

### M5. Tooling and Export in one card

- One card "Tooling": the mode tabs, the sliders, then (not for the slump
  mold) the "Mouth and parting" sub-section, then the scheme note, the part
  list, warnings, blockers, the audit line and the Export button (see Q2).
- The `panel.export` key is removed from both dictionaries.
- The smoke's `#mouthCard` checks follow the new id of the sub-section.

### M6. Docs and wrap-up

- `docs/README.md`/`README.md` screenshots or wording that names "the right
  panel" or "the Export card" updated; AGENTS.md: the plans index, the
  layout line for `render/thumb.ts`, `ui/sheet.ts`.
- `npm run check`, `npm run smoke -- --preview --shots`, shots looked at
  (phone and desktop, en and ru).

## Questions

- **Q1. Theme.** Dark only, like the siblings (recommended: the stage is
  dark anyway, one palette to keep), or light and dark by the system?
- **Q2. Where the mouth goes after the merge.** Inside the merged card
  between the sliders and the parts (recommended: the card above the tabs
  never jumps when the slump tab hides it), or a separate card above the
  merged one?
- **Q3. The parting line in the thumbnail.** A thin accent line along X
  under the model (recommended: it is what "lies along X" means), or the
  bare model?
- **Q4. Phone.** A bottom sheet as in case-constructor (recommended), or
  the current stack (view on top, panel below, the page scrolls)?

## Results

- All six points of the TODO are in; the milestones went as planned, with
  two changes found on the way:
  - On a phone the sheet **starts closed** when there is no model (open, it
    covered the "Try a sample" invitation) and **opens on a model load** —
    the thumbnail and the turns are what to look at first.
  - The burgundy is two shades: `--accent` `#9e2a44` fills (buttons, the
    slider), `--accent-hi` `#c9566e` draws thin lines on the dark (tab and
    preset borders, hover, the parting line, the progress bar). The first
    single shade `#c04a60` read as raspberry, not burgundy.
- The thumbnail is an orthographic camera fitted to the projected vertices,
  so a tall or a wide piece fills it; its buffer is preserved, so the smoke
  reads its pixels.
- Tests: `ui/sheet.test.ts` (jsdom: taps, drags, pinches, the inset, the
  initial state), `ui/controls.test.ts` (presets); smoke steps for the
  thumbnail, the 90° preset and the sheet on a phone.
