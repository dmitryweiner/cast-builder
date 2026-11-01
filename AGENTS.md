# Agents guide

Web App Template — a static, offline-capable web app: TypeScript + Vite, no
framework, tests on Vitest (node and jsdom) and a Playwright smoke. UI in
English, Russian and Hebrew (RTL). Deployed to GitHub Pages.

The shared conventions behind this setup are in `~/projects/CLAUDE.md` and
`~/projects/_conventions/`; this file is what holds for this repository.

## Commands

Node.js — the version in `.node-version` (`fnm use`; check `node -v`).

- `npm ci` — install dependencies.
- `npm run dev` — dev server.
- `npm run check` — typecheck + oxlint + prettier + unit tests. Must pass before
  any work is called done.
- `npm run smoke` — browser smoke on the dev server; `-- --preview` builds and
  also checks offline mode; `-- --shots` saves screenshots to `shots/`.
- `npm run build` — typecheck and build into `dist/`.
- `npm run format` — prettier.
- `npm run icons` — render the PWA PNG icons from `public/icon.svg`.

CI (`.github/workflows/ci.yml`) runs `check` and the preview smoke on every
push and PR; a push to `main` publishes `dist/` to GitHub Pages.

## Test-driven development is mandatory

Every behaviour change goes red → green → refactor:

1. Write a failing test that describes the new behaviour or reproduces the bug.
   Run it and see it fail for the expected reason.
2. Write the minimal code that makes it pass.
3. Refactor with the tests green.

Pure logic → `*.test.ts` in node; anything touching the DOM → jsdom
(`// @vitest-environment jsdom`, the real `index.html`); what needs a real
browser (service worker, layout, workers) → a step in `scripts/smoke.mjs`.

## Layout

- `src/main.ts` — entry: starts the app with browser storage and languages,
  registers the service worker in production.
- `src/app.ts` — DOM wiring: translation of the page, events, rendering.
- `src/i18n/` — `en.ts` defines the messages, `ru.ts`, `he.ts` follow its type;
  `index.ts` — locales, detection, text direction, `staticText`;
  `plural.ts` — `Intl.PluralRules` helper.
- `src/storage.ts` — versioned, validated settings in localStorage.
- `src/sw-plugin.ts` — Vite plugin emitting `sw.js` that precaches the build;
  `src/pwa.ts` — its registration.
- `src/style.css` — mobile first, logical properties, light and dark.
- `public/` — manifest, icons (`icon.svg` is the source).
- `scripts/lib/harness.mjs` — Playwright plumbing; `scripts/smoke.mjs` — the
  smoke; `scripts/icons.mjs` — icon rendering.
- `docs/` — user and design docs.

## Conventions

- Code comments, docs and README in English.
- Pure logic lives in modules without the DOM; time, randomness, storage and
  browser APIs are parameters so tests can replace them.
- The package name in `package.json` is the app id: Vite injects it as
  `__APP_ID__`, the storage key and the service worker's cache prefix. All
  apps on `<user>.github.io` share one origin, so it must be unique.
- Every interface text lives in `src/i18n/`. Static texts in `index.html` are
  marked `data-i18n="key"` (text) or `data-i18n-label="key"` (`aria-label`) and
  keep the English text as the default; tests check every key in every
  language. A new message goes to `en.ts` first; TypeScript then demands it in
  the others.
- Language: the saved choice, else the first supported browser language, else
  English. Switching redraws without losing state. RTL locales set
  `dir="rtl"` on `<html>`; CSS uses logical properties only.
- Do not change the stored format without bumping `VERSION` in
  `src/storage.ts` and a test for the reset or migration.
- No `as` casts in app code; a disabled lint rule carries its reason.
- A helper script that may be needed again goes to `scripts/` with a header
  comment and a line in this file. A new browser check is a step or a flag in
  `scripts/smoke.mjs`, not a new file.
- Each feature gets its own branch and a pull request.
