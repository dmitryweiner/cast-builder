// Builds the printable fixtures of fixtures/README.md from clayform's core:
// the teapot as it is printed (hollow, the applied spout open at its tip, the
// seat for the lid), its lid skirt down, and both in one file ("Lid
// beside"). Clayform's TypeScript sources (and the kit's, which both apps
// carry as TypeScript in node_modules) go through Vite's own module runner,
// so nothing of clayform is installed here.
//
//   node scripts/fixtures.mjs [clayform dir]
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
// --concave does the same with clayform's concave base on every preset,
// spherical and recessed flat, and checks besides that the bottom read from
// below (`meshSource(…).floorAt`, the floor of the slump mold) is as deep
// as clayform made it.
//
//   node scripts/fixtures.mjs --presets [--concave] [--res 384]

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, createServerModuleRunner } from 'vite';

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

// Node strips no types in node_modules, so the kit's sources are transformed
// like the apps' own; manifold-3d is plain JavaScript and stays external.
// Nothing is pre-bundled: the optimizer would read the kit as JavaScript.
const server = await createServer({
  configFile: false,
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true },
  ssr: { noExternal: ['maker-kit'], optimizeDeps: { noDiscovery: true } },
});
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
const load = (path) => runner.import(resolve(src, path));
const own = (path) => runner.import(resolve(root, 'src', path));
/** A module of the kit as the app at `dir` has it: each app carries its own copy. */
const kit = (dir, path) => runner.import(resolve(dir, 'node_modules/maker-kit/src', path));

const { initCSG } = await kit(clayform, 'csg/manifold.ts');
const { buildPrintableVessel } = await load('geo/assemble.ts');
const { sanitizeState, toBuildParams, effectiveSpout, lidRelief } = await load('state/schema.ts');
const { lidFit, lidSeat, buildLidMesh } = await load('geo/lid.ts');
const { buildProfile } = await load('geo/profiles.ts');
const { mergeMeshes } = await load('geo/surface.ts');
const { placeInRow, LID_BESIDE_GAP_MM } = await load('geo/layout.ts');
const { encodeSTL } = await kit(clayform, '3d/stl.ts');

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

try {
  if (flag('--presets')) await checkPresets(Number(option('--res', '192')), flag('--concave'));
  else writeFixtures();
} finally {
  await runner.close();
  await server.close();
}

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

/** The depth of a base that is not concave. */
const flatBase = () => 0;

async function checkPresets(segments, concave) {
  const { initCSG: initOwn, CsgScope, toManifold } = await kit(root, 'csg/manifold.ts');
  const { parseSTL } = await kit(root, '3d/stl.ts');
  const { placeModel, flip, IDENTITY_TURN } = await own('geo/model.ts');
  const { solidify } = await own('geo/solidify.ts');
  const { meshSource } = await own('geo/revolve.ts');
  const { PRESETS } = await load('state/presets.ts');
  const { profileRadius } = await load('geo/profiles.ts');
  const ownCsg = await initOwn();

  // the concave bases checked, and how deep clayform makes them
  const kinds = concave
    ? [
        { kind: 'sphere', radiusMm: 200 },
        { kind: 'flat', depthMm: 5, ringMm: 8, filletMm: 2 },
      ]
    : [null];
  let depthOf = flatBase;
  if (concave) {
    if (!sanitizeState({ concave: { on: true } }).concave?.on) throw new Error('this clayform has no concave base');
    const { concaveLayout } = await load('geo/concave.ts');
    depthOf = (state) => {
      const profile = buildProfile(state.family, state.shape, state.heightMm);
      return concaveLayout(state.concave, profileRadius(profile, 0), state.heightMm)?.depthMm ?? 0;
    };
  }

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
        // the lift of the bottom over the table on the axis, as the slump mold reads it
        floorMm: concave ? (meshSource(placed, 96, 96).floorAt?.(0, 0) ?? 0) : undefined,
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
    const floor = got.floorMm === undefined ? '' : ` floor ${got.floorMm.toFixed(1).padStart(4)}`;
    console.log(
      `${wrong.length ? '✗' : '✓'} ${name.padEnd(20)} ${got.status.padEnd(10)} shells ${got.shells} genus ${got.genus}` +
        ` rim ${rim.padStart(5)}${floor} ${got.ms.toFixed(0).padStart(5)} ms`,
    );
    if (wrong.length) misses.push(`${name}: ${wrong.join(', ')}`);
  };

  console.log(`clayform ${commit}, ${PRESETS.length} presets at ${segments} segments${concave ? ', concave bases' : ''}`);
  for (const preset of PRESETS) {
    for (const kind of kinds) {
      const state = kind ? sanitizeState({ ...preset.build(), concave: { on: true, ...kind } }) : preset.build();
      const { body, lid } = printable(state, segments);
      const depth = depthOf(state);
      report(kind ? `${preset.id} ${kind.kind}` : preset.id, fill(body, IDENTITY_TURN), {
        status: 'filled',
        shells: 1,
        genus: state.handle.on ? state.handle.count : 0,
        // the mouth at the top of the piece, not at the tip of a spout
        rimMm: (z) => z !== undefined && Math.abs(z - state.heightMm) < 1,
        ...(kind ? { floorMm: (z) => Math.abs(z - depth) < 0.3 } : {}),
      });
      // the lid has no concave base: checked once, with the plain piece
      if (!lid || kind) continue;
      report(`${preset.id} lid`, fill(lid, IDENTITY_TURN), { status: 'openBottom' });
      report(`${preset.id} lid turned`, fill(lid, flip(IDENTITY_TURN)), { status: 'filled', shells: 1, genus: 0 });
    }
  }
  if (misses.length) {
    console.error(`\n${misses.length} missed:\n${misses.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log('all filled');
}
