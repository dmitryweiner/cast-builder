# TODO: the service worker never updates an open page

Found 2026-11-18 while Case Constructor took the template's PWA pieces
(maker-kit's M3, case-constructor PR #22). Fixed the same day — see
"Done" at the end.

## What is wrong

`src/sw-plugin.ts` and `src/pwa.ts` are the template's **old** version,
the one `_conventions/pwa.md` now calls a bug ("Users on phones saw the old
version for weeks"):

- `sw.js` precaches on `install` but never calls `skipWaiting()`: a new
  worker waits until every page of the old version is closed. Phones
  suspend pages instead of closing them, so the new version may never
  activate.
- `registerServiceWorker(navigator, window)` only registers. It does not
  call `registration.update()` when the page becomes visible again (a
  resumed page makes no navigation, so the browser never looks for a new
  worker), and it does not reload on `controllerchange`.

## The fix

Take the current pieces from `~/projects/web-app-template` (the
convention's "Worker behaviour"):

1. `src/sw-plugin.ts`: `skipWaiting()` after precaching on `install`;
   on `activate`, delete this app's old caches and `clients.claim()`.
2. `src/pwa.ts`: `registerServiceWorker(navigator, window, document)` —
   `update()` on every `visibilitychange` to visible, reload on
   `controllerchange` unless the page had no controller before (a first
   visit). `src/main.ts` passes `document`.
3. Their tests from the template (`sw-plugin.test.ts`, `pwa.test.ts`).
4. The smoke's update step from the template (`--preview`): append a
   comment to `dist/sw.js`, dispatch `visibilitychange`, expect the page
   to reload; restore `sw.js`.
5. The reload drops in-memory state: Cast Builder keeps the project (the
   model included) over a reload already (`plans/PLAN-FIT-RESET-PROJECT.md`),
   so check that a reload mid-edit loses nothing.

Users already on the old worker get the fixed one on their next launch
after it installs; from then on updates arrive on return to the page.

## Done (2026-11-18)

Steps 1–4 as above, the pieces taken from the template unchanged (its
commit b22055a). The smoke's step is the template's with the project
check of step 5 folded in: a bowl opened, the slump tab, a quarter spin,
then the deploy — after the reload the model, the spin and the tab are
back and the slump mold is built again.

Red first: the step alone on the old `sw.js` and `pwa.ts` failed with
"the open page never switched to the new version" (the new worker
installed and waited); with the fix it passes in 3.6 s, and the whole
`--preview` smoke passes.

What the reload costs — the same as any reload, nothing the update adds:

- the undo history (it lives in memory);
- a model too large to keep (all apps on the origin share ~5 MB; the
  MathSculpt vase, 263k triangles, does not fit) and its setup with it —
  the Model card already says such a model is gone after a reload;
- a job in flight: a preview is built again, an export or a Find is not
  (the user clicks again).

The reload comes only when the user returns to the page after a deploy,
a few seconds after it becomes visible (the new worker precaches the
build first). Deferring it while a model is not kept was weighed and
left out: maker-kit's `WorkerClient` starts its worker on the first job
and a fresh one after a crash, and the old page would then ask for its
old worker chunk — gone from the cache (the new worker deleted it) and
from Pages. A broken page is worse than a reload.
