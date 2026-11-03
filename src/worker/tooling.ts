// The tooling of one job: what the worker runs, without the worker around
// it — so the tests run it in Node with the real CSG.

import type { CsgApi } from '../geo/csg';
import { CsgScope, fromManifold, toManifold } from '../geo/csg';
import type { Message } from '../geo/message';
import { guessMouth, gateRadius } from '../geo/mouth';
import type { Mouth } from '../geo/mouth';
import { solidify } from '../geo/solidify';
import { bodies } from '../geo/pieces';
import { meshSource } from '../geo/revolve';
import { buildPunch, buildSlumpShell } from '../geo/press';
import type { PressOptions } from '../geo/press';
import { placeInRow, BESIDE_GAP_MM } from '../geo/layout';
import type { SurfaceMesh } from '../geo/surface';
import { mergeMeshes } from '../geo/surface';
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
  return job.mode === 'slump' ? slumpJob(job, onProgress) : moldJob(csg, job, onProgress);
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
    screws: false,
  };
}

/**
 * The slump mold with the punch beside it, one file: two closed components
 * in one mesh. Plain geometry without CSG — in the worker only so a large
 * model never holds up the tab.
 */
function slumpJob(job: ToolingJob, onProgress: (progress: JobProgress) => void): JobResult {
  const exporting = job.kind === 'export';
  const progress = new Progress(onProgress, exporting ? 3 : 2);
  const segments = exporting ? job.resolution : PREVIEW_RESOLUTION;
  progress.next({ code: 'progress.slump' });
  const source = meshSource(job.model, segments, segments);
  const options = pressOptions(job.mold);
  const slump = buildSlumpShell(source, options);
  progress.next({ code: 'progress.punch' });
  const punch = buildPunch(source, options, slump.fit);
  const mesh = mergeMeshes(placeInRow([[slump.mesh], [punch]], BESIDE_GAP_MM).flat());

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
