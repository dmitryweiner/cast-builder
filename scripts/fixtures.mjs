// Builds the printable fixtures of fixtures/README.md from clayform's core:
// the teapot as it is printed (hollow, the applied spout open at its tip, the
// seat for the lid), its lid skirt down, and both in one file ("Lid
// beside"). It runs clayform's TypeScript sources through clayform's own
// vite-node, so nothing of clayform is installed here.
//
//   ../clayform/node_modules/.bin/vite-node --root ../clayform scripts/fixtures.mjs [clayform dir]
//
// The clayform directory defaults to ../clayform. Prints the commit it was
// built from; the files go to fixtures/. Regenerate them only on purpose.
//
// --presets writes nothing: it exports every built-in clayform preset as it
// is printed and checks that `solidify` makes a master of it — filled, one
// shell, genus = the number of handles, the mouth at the top of the piece;
// the lid filled turned over and reported `openBottom` as printed. Exits 1
// on any miss. Run it after changing the body, the spout or the lid in
// clayform, or `solidify` here. --res <n> sets the segments (default 192).
//
//   ../clayform/node_modules/.bin/vite-node --root ../clayform scripts/fixtures.mjs --presets [--res 384]

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const dirArg = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--res');

const root = resolve(import.meta.dirname, '..');
const clayform = resolve(dirArg ?? resolve(root, '../clayform'));
const src = resolve(clayform, 'src');
const load = (path) => import(resolve(src, path));
const own = (path) => import(resolve(root, 'src', path));

const { initCSG } = await load('geo/csg.ts');
const { buildPrintableVessel } = await load('geo/assemble.ts');
const { sanitizeState, toBuildParams, effectiveSpout, lidRelief } = await load('state/schema.ts');
const { lidFit, lidSeat, buildLidMesh } = await load('geo/lid.ts');
const { buildProfile } = await load('geo/profiles.ts');
const { mergeMeshes } = await load('geo/surface.ts');
const { placeInRow, LID_BESIDE_GAP_MM } = await load('geo/layout.ts');
const { encodeSTL } = await load('geo/stl.ts');

const csg = await initCSG();
const commit = execFileSync('git', ['-C', clayform, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

/** The piece and its lid (or null) exactly as clayform exports them. */
function printable(state, segments) {
  const profile = buildProfile(state.family, state.shape, state.heightMm);
  const fit = state.lid.on ? lidFit(profile, state.heightMm, state.hollow, state.lid) : null;
  const body = buildPrintableVessel(
    csg,
    toBuildParams(state, segments, null),
    state.hollow,
    state.handle,
    effectiveSpout(state),
    fit ? lidSeat(fit) : undefined,
  ).mesh;
  const lid = fit ? buildLidMesh(fit, state.lid, segments, { relief: lidRelief(state) }) : null;
  return { body, lid };
}

if (flag('--presets')) await checkPresets(Number(option('--res', '192')));
else writeFixtures();

function writeFixtures() {
  // the teapot of teapot.stl: a pot 120 mm high, the applied spout, a lid
  const state = sanitizeState({ family: 'pot', heightMm: 120, spout: { on: true, kind: 'applied' }, lid: { on: true } });
  const { body: pot, lid } = printable(state, 48);
  if (!lid) throw new Error('the lid does not fit the teapot');
  const beside = mergeMeshes(placeInRow([[pot], [lid]], LID_BESIDE_GAP_MM).flat());

  const files = { 'teapot-hollow': pot, 'lid-printed': lid, 'teapot-lid-beside': beside };
  for (const [name, mesh] of Object.entries(files)) {
    writeFileSync(resolve(root, 'fixtures', `${name}.stl`), new Uint8Array(encodeSTL(mesh, { name })));
    console.log(`${name}.stl: ${mesh.indices.length / 3} triangles`);
  }
  console.log(`built from clayform ${commit}`);
}

async function checkPresets(segments) {
  const { initCSG: initOwn, CsgScope, toManifold } = await own('geo/csg.ts');
  const { parseSTL } = await own('geo/stl.ts');
  const { placeModel, flip, IDENTITY_TURN } = await own('geo/model.ts');
  const { solidify } = await own('geo/solidify.ts');
  const { PRESETS } = await load('state/presets.ts');
  const ownCsg = await initOwn();

  /** Through STL bytes, as a file comes into the app: parse, place, fill. */
  const fill = (mesh, turn) => {
    const scope = new CsgScope();
    try {
      const placed = placeModel(parseSTL(encodeSTL(mesh)), { turn, spinDeg: 0 });
      const started = performance.now();
      const result = solidify(ownCsg, scope, scope.keep(toManifold(ownCsg, placed, { merge: true })));
      return {
        status: result.status,
        shells: result.solid.decompose().map((shell) => scope.keep(shell)).length,
        genus: result.solid.genus(),
        rimMm: result.rim?.zMm,
        ms: performance.now() - started,
      };
    } finally {
      scope.dispose();
    }
  };

  const misses = [];
  const report = (name, got, want) => {
    const wrong = Object.entries(want)
      .filter(([key, value]) => (typeof value === 'function' ? !value(got[key]) : got[key] !== value))
      .map(([key]) => `${key} ${got[key]}`);
    const rim = got.rimMm === undefined ? '—' : got.rimMm.toFixed(1);
    console.log(
      `${wrong.length ? '✗' : '✓'} ${name.padEnd(20)} ${got.status.padEnd(10)} shells ${got.shells} genus ${got.genus}` +
        ` rim ${rim.padStart(5)} ${got.ms.toFixed(0).padStart(5)} ms`,
    );
    if (wrong.length) misses.push(`${name}: ${wrong.join(', ')}`);
  };

  console.log(`clayform ${commit}, ${PRESETS.length} presets at ${segments} segments`);
  for (const preset of PRESETS) {
    const state = preset.build();
    const { body, lid } = printable(state, segments);
    report(preset.id, fill(body, IDENTITY_TURN), {
      status: 'filled',
      shells: 1,
      genus: state.handle.on ? state.handle.count : 0,
      // the mouth at the top of the piece, not at the tip of a spout
      rimMm: (z) => z !== undefined && Math.abs(z - state.heightMm) < 1,
    });
    if (!lid) continue;
    report(`${preset.id} lid`, fill(lid, IDENTITY_TURN), { status: 'openBottom' });
    report(`${preset.id} lid turned`, fill(lid, flip(IDENTITY_TURN)), { status: 'filled', shells: 1, genus: 0 });
  }
  if (misses.length) {
    console.error(`\n${misses.length} missed:\n${misses.join('\n')}`);
    process.exit(1);
  }
  console.log('all filled');
}
