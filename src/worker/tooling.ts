// The tooling of one job: what the worker runs, without the worker around
// it — so the tests run it in Node with the real CSG.

import type { Manifold } from 'manifold-3d';
import type { CsgApi } from '../geo/csg';
import { CsgScope, fromManifold, toManifold } from '../geo/csg';
import type { Message } from '../geo/message';
import { guessMouth, gateRadius } from '../geo/mouth';
import type { Mouth } from '../geo/mouth';
import { solidify } from '../geo/solidify';
import { bodies } from '../geo/pieces';
import { meshSource } from '../geo/revolve';
import { buildPunch, buildSlumpShell, screwLayout } from '../geo/press';
import type { PressOptions, ScrewLayout } from '../geo/press';
import type { PressSource } from '../geo/revolve';
import { cheekCuts, lugSolids, padSolid, screwSolid, tabSolids } from '../geo/screwSolids';
import { PAD, SCREW, threadPoints } from '../geo/thread';
import { placeInRow, BESIDE_GAP_MM } from '../geo/layout';
import type { SurfaceMesh } from '../geo/surface';
import { mergeMeshes, translateMesh } from '../geo/surface';
import { validateMesh, assessExport } from '../geo/validate';
import type { MoldPartMesh, Mouth as MoldMouth } from '../geo/mold';
import { buildBaths, buildMaster } from '../geo/mold';
import { analyzeMold, pressWarning, withScheme } from '../geo/mold/analyze';
import type { MoldState } from '../geo/mold/state';
import { pickedScheme, sanitizeSettings, sanitizeSetup } from '../state';
import type { JobInfo, JobPart, JobProgress, JobResult, ToolingJob } from './protocol';

/** Grid of the slump mold in a preview: the silhouette is all a preview needs. */
export const PREVIEW_RESOLUTION = 128;
/** No mold has more than four parts — two halves, a bottom plate and a plug. */
const MAX_MOLD_PARTS = 4;
/** A radius varying more than this round the axis makes a slump mold doubtful, mm. */
const NOT_ROUND_MM = 1;
/** The screw stands on its head: its own frame has the head below z = 0. */
const SCREW_HEAD_UP = SCREW.headH;
/** Screws and stops on the bed, each a column along y with a gap between them, mm. */
const SCREW_STEP_MM = SCREW.headD + 4;
const PAD_STEP_MM = PAD.d + 4;

/**
 * Brings anything to a valid job, or null when the model itself is broken:
 * the worker's boundary is an outer boundary like the UI.
 */
export function sanitizeJob(raw: unknown): ToolingJob | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source: Record<string, unknown> = { ...raw };
  const model = source.model;
  if (typeof model !== 'object' || model === null || !('positions' in model) || !('indices' in model)) return null;
  const { positions, indices } = model;
  if (!(positions instanceof Float32Array) || !(indices instanceof Uint32Array)) return null;
  if (positions.length % 3 !== 0 || indices.length % 3 !== 0 || indices.length === 0) return null;
  const count = positions.length / 3;
  for (let i = 0; i < indices.length; i++) if (indices[i] >= count) return null;
  for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) return null;
  const settings = sanitizeSettings(source);
  const setup = sanitizeSetup(source);
  return {
    kind: source.kind === 'export' ? 'export' : 'preview',
    model: { positions, indices },
    mode: settings.mode,
    mold: settings.mold,
    scheme: settings.scheme,
    resolution: settings.resolution,
    mouth: setup.mouth,
    plug: setup.plug,
  };
}

/**
 * Stages of a job: the bar counts them, the label says which is on. They go
 * strictly in order, so the counter numbers them itself — while the total may
 * get smaller once the parting is known.
 */
class Progress {
  private step = 0;

  constructor(
    private readonly report: (progress: JobProgress) => void,
    public total: number,
  ) {}

  next(label: Message): void {
    this.report({ step: this.step++, total: this.total, label });
  }
}

export function runJob(csg: CsgApi, job: ToolingJob, onProgress: (progress: JobProgress) => void = () => {}): JobResult {
  // one piece per mold, whatever the mode: "Lid beside" in Clayform makes two
  const pieces = bodies(job.model);
  if (pieces > 1) return { parts: [], info: { ...emptyInfo(), blocking: [{ code: 'model.pieces', params: { n: pieces } }] } };
  return job.mode === 'slump' ? slumpJob(csg, job, onProgress) : moldJob(csg, job, onProgress);
}

function emptyInfo(): JobInfo {
  return { status: null, mouth: null, rimMm: null, scheme: null, reason: [], warnings: [], blocking: [] };
}

export function pressOptions(mold: MoldState): PressOptions {
  return {
    shellMm: mold.bathWallMm,
    shrinkPct: mold.shrinkPct,
    slabMm: mold.slabMm,
    earMm: mold.earMm,
    ventMm: mold.ventMm,
    roundPct: mold.punchRoundPct,
    screws: mold.screws,
  };
}

/** The slump mold, its punch and the clamps' screws and stops, each in its own frame. */
export interface SlumpTooling {
  /** the mold standing on the table */
  mold: SurfaceMesh;
  /** the punch flange down, as printed */
  punch: SurfaceMesh;
  /** the screws standing on their heads and the stops dimple down, round the z axis on z = 0 */
  screws: SurfaceMesh[];
  pads: SurfaceMesh[];
  /** the clamps, when there are any */
  layout: ScrewLayout | null;
}

/**
 * The slump mold and its punch, with the screw clamps when asked. Without
 * them — plain geometry, no CSG. With them the lugs and the tabs are made by
 * CSG: an export fuses them onto the mold and the punch (closed solids), a
 * preview lays them over unfused — the import of the big meshes alone would
 * cost it ten times its time (plans/PLAN-SCREWS.md, M0). The screws and
 * stops are the same for every mold.
 */
export function slumpTooling(
  csg: CsgApi,
  source: PressSource,
  options: PressOptions,
  { exporting, print }: { exporting: boolean; print: boolean },
): SlumpTooling {
  const slump = buildSlumpShell(source, options);
  const punch = buildPunch(source, options, slump.fit);
  if (!options.screws) return { mold: slump.mesh, punch, screws: [], pads: [], layout: null };
  const layout = screwLayout(source, options, slump.fit);
  const scope = new CsgScope();
  try {
    const n = threadPoints(exporting);
    const lugs = lugSolids(csg, scope, layout, n);
    const tabs = tabSolids(csg, scope, layout);
    // An export fuses the lugs and tabs on; a preview lays them over. The
    // cheeks cut round the stops cannot be laid over: there a preview pays
    // for the shell's import too.
    const fuse = (mesh: SurfaceMesh, extra: Manifold, cuts: Manifold | null = null): SurfaceMesh => {
      if (!exporting && !cuts) return mergeMeshes([mesh, fromManifold(extra)]);
      const solid = scope.keep(toManifold(csg, mesh));
      const cut = cuts ? scope.keep(solid.subtract(cuts)) : solid;
      return exporting ? fromManifold(scope.keep(cut.add(extra))) : mergeMeshes([fromManifold(cut), fromManifold(extra)]);
    };
    const mold = fuse(slump.mesh, lugs, cheekCuts(csg, scope, layout));
    const holed = fuse(punch, tabs);
    if (!print) return { mold, punch: holed, screws: [], pads: [], layout };
    const screw = fromManifold(scope.keep(screwSolid(csg, scope, n).translate([0, 0, SCREW_HEAD_UP])));
    const pad = fromManifold(padSolid(csg, scope, n));
    const count = layout.angles.length;
    return { mold, punch: holed, screws: Array(count).fill(screw), pads: Array(count).fill(pad), layout };
  } finally {
    scope.dispose();
  }
}

/** Copies of a part in a column along y, `step` apart. */
function column(meshes: readonly SurfaceMesh[], step: number): SurfaceMesh[] {
  return meshes.map((mesh, i) => (i === 0 ? mesh : translateMesh(mesh, 0, i * step)));
}

/**
 * The slump mold with the punch beside it, one file: two closed components
 * in one mesh — and with the clamps printed, a column of screws and one of
 * stops after them.
 */
function slumpJob(csg: CsgApi, job: ToolingJob, onProgress: (progress: JobProgress) => void): JobResult {
  const exporting = job.kind === 'export';
  const options = pressOptions(job.mold);
  const progress = new Progress(onProgress, (exporting ? 3 : 2) + (options.screws ? 1 : 0));
  const segments = exporting ? job.resolution : PREVIEW_RESOLUTION;
  progress.next({ code: 'progress.slump' });
  const source = meshSource(job.model, segments, segments);
  progress.next({ code: options.screws ? 'progress.screws' : 'progress.punch' });
  const built = slumpTooling(csg, source, options, { exporting, print: job.mold.printScrews });
  if (options.screws) progress.next({ code: 'progress.punch' });
  const groups = [[built.mold], [built.punch], column(built.screws, SCREW_STEP_MM), column(built.pads, PAD_STEP_MM)];
  const mesh = mergeMeshes(
    placeInRow(
      groups.filter((group) => group.length > 0),
      BESIDE_GAP_MM,
    ).flat(),
  );

  const info = emptyInfo();
  const undercut = pressWarning(job.model);
  if (undercut) info.warnings.push(undercut);
  if (source.outOfRoundMm > NOT_ROUND_MM) info.warnings.push({ code: 'press.notRound', params: { mm: source.outOfRoundMm.toFixed(1) } });

  if (exporting) progress.next({ code: 'progress.checkMeshes' });
  return { parts: [part('slump', mesh, exporting)], info };
}

/** The master positive or the pour boxes — whichever the mode says. */
function moldJob(csg: CsgApi, job: ToolingJob, onProgress: (progress: JobProgress) => void): JobResult {
  const exporting = job.kind === 'export';
  const master = job.mode === 'master';
  const info = emptyInfo();
  // Until the parting is known the number of parts is not: take the most
  // there can be. After the analysis the total only shrinks, so the bar may
  // jump forward but never back.
  const planned = master ? 1 : MAX_MOLD_PARTS;
  const progress = new Progress(onProgress, 2 + planned + (exporting ? 1 : 0));
  const scope = new CsgScope();
  try {
    progress.next({ code: 'progress.model' });
    let model;
    try {
      model = scope.keep(toManifold(csg, job.model, { merge: true }));
    } catch {
      info.blocking.push({ code: 'model.notSolid' });
      return { parts: [], info };
    }
    const solid = solidify(csg, scope, model);
    info.status = solid.status;
    if (solid.status === 'filled') info.warnings.push({ code: 'model.filled' });
    if (solid.status === 'open') info.warnings.push({ code: 'model.open' });
    if (solid.status === 'openBottom') info.warnings.push({ code: 'model.openBottom' });

    // The rim of a filled hollow piece is known from the fill; a solid piece
    // shows it as its largest flat top.
    const rim = solid.rim ?? guessMouth(job.model);
    const found: Mouth = { zMm: rim.zMm, radiusMm: gateRadius(rim.radiusMm) };
    info.mouth = found;
    info.rimMm = rim.radiusMm;
    const gate = job.mouth.auto ? found : { zMm: job.mouth.zMm, radiusMm: job.mouth.radiusMm };
    const mouth: MoldMouth = {
      ...gate,
      ...(job.plug.on ? { plug: { recessMm: job.plug.recessMm, galleryMm: job.plug.galleryMm, rimMm: rim.radiusMm } } : {}),
    };

    progress.next({ code: 'progress.analyze' });
    const surface = solid.solid === model ? job.model : fromManifold(solid.solid);
    const analyzed = analyzeMold(surface, { hasHandle: solid.solid.genus() > 0, hasPlug: job.plug.on });
    const picked = pickedScheme(job.scheme);
    const report = picked ? withScheme(analyzed, picked) : analyzed;
    info.scheme = report.scheme;
    info.reason = report.reason;
    info.warnings.push(...report.warnings);
    progress.total -= planned - (master ? 1 : report.parts.length);

    let built: MoldPartMesh[];
    if (master) {
      progress.next({ code: 'progress.master' });
      built = buildMaster(csg, solid.solid, report, job.mold, { mouth });
    } else {
      progress.next({ code: 'progress.block' });
      built = buildBaths(csg, solid.solid, report, job.mold, {
        mouth,
        onPart: (index, total) => {
          // the plaster block announced the first part — then one by one
          if (index > 0) progress.next({ code: 'progress.part', params: { i: index + 1, n: total } });
        },
      });
    }
    if (job.plug.on && !built.some((item) => item.id === 'plug' || item.id === 'bath-plug')) {
      info.warnings.push({ code: 'mold.noPlug' });
    }
    if (exporting) progress.next({ code: 'progress.checkMeshes' });
    return { parts: built.map((item) => part(item.id, item.mesh, exporting)), info };
  } finally {
    scope.dispose();
  }
}

function part(id: string, mesh: SurfaceMesh, check: boolean): JobPart {
  return {
    id,
    note: sizeNote(mesh),
    positions: mesh.positions,
    indices: mesh.indices,
    normals: mesh.normals,
    blocking: check ? assessExport(validateMesh(mesh), true).blocking : [],
  };
}

/** The extent of a part — all the part list needs from a mesh, cheaper than a full check. */
function sizeNote(mesh: SurfaceMesh): string {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = mesh.positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return max.map((value, axis) => Math.round(value - min[axis])).join('×');
}
