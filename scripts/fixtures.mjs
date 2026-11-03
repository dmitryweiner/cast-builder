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

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const clayform = resolve(process.argv[2] ?? resolve(root, '../clayform'));
const src = resolve(clayform, 'src');
const load = (path) => import(resolve(src, path));

const { initCSG } = await load('geo/csg.ts');
const { buildPrintableVessel } = await load('geo/assemble.ts');
const { sanitizeState, toBuildParams, effectiveSpout, lidRelief } = await load('state/schema.ts');
const { lidFit, lidSeat, buildLidMesh } = await load('geo/lid.ts');
const { buildProfile } = await load('geo/profiles.ts');
const { mergeMeshes } = await load('geo/surface.ts');
const { placeInRow, LID_BESIDE_GAP_MM } = await load('geo/layout.ts');
const { encodeSTL } = await load('geo/stl.ts');

const SEGMENTS = 48;
const csg = await initCSG();

// the teapot of teapot.stl: a pot 120 mm high, the applied spout, a lid
const state = sanitizeState({ family: 'pot', heightMm: 120, spout: { on: true, kind: 'applied' }, lid: { on: true } });
const profile = buildProfile(state.family, state.shape, state.heightMm);
const fit = lidFit(profile, state.heightMm, state.hollow, state.lid);
if (!fit) throw new Error('the lid does not fit the teapot');
const pot = buildPrintableVessel(
  csg,
  toBuildParams(state, SEGMENTS, null),
  state.hollow,
  state.handle,
  effectiveSpout(state),
  lidSeat(fit),
).mesh;
const lid = buildLidMesh(fit, state.lid, SEGMENTS, { relief: lidRelief(state) });
const beside = mergeMeshes(placeInRow([[pot], [lid]], LID_BESIDE_GAP_MM).flat());

const files = { 'teapot-hollow': pot, 'lid-printed': lid, 'teapot-lid-beside': beside };
for (const [name, mesh] of Object.entries(files)) {
  writeFileSync(resolve(root, 'fixtures', `${name}.stl`), new Uint8Array(encodeSTL(mesh, { name })));
  console.log(`${name}.stl: ${mesh.indices.length / 3} triangles`);
}
const commit = execFileSync('git', ['-C', clayform, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
console.log(`built from clayform ${commit}`);
