// The tooling of one job: what the worker runs, without the worker around
// it — so the tests run it in Node with the real CSG.

import type { Manifold } from 'manifold-3d';
import type { CsgApi } from '../geo/csg';
import { CsgScope, fromManifold, toManifold } from '../geo/csg';
import type { Message } from '../geo/message';
import { isValidMesh } from '../geo/stl';
import { guessMouth, gateRadius } from '../geo/mouth';
import type { Mouth } from '../geo/mouth';
import { solidify } from '../geo/solidify';
import { bodies } from '../geo/pieces';
import { meshSource } from '../geo/revolve';
import { buildPunch, buildSlumpShell, pressWarnings, screwLayout } from '../geo/press';
import type { PressOptions, ScrewLayout } from '../geo/press';
import type { PressSource } from '../geo/revolve';
import { moldCuts, lugSolids, padSolid, screwSolid, tabSolids } from '../geo/screwSolids';
import { PAD, SCREW, threadPoints } from '../geo/thread';
import type { SurfaceMesh } from '../geo/surface';
import { mergeMeshes, translateMesh } from '../geo/surface';
import { validateMesh, assessExport } from '../geo/validate';
import type { Axis, RayMesh } from '../geo/release';
import type { RimCut } from '../geo/split/rim';
import { rimCut } from '../geo/split/rim';
import { findPlane } from '../geo/split/find';
import { turnForPrint } from '../geo/split/shell';
import { SPLIT_LAND_MM, buildHalf } from '../geo/split';
import { meshNormals } from '../geo/normals';
import { castRays, releaseCell, releaseDepth } from '../geo/release';
import { buildTileMold, TILE_PROUD_MM } from '../geo/tile';
import { sizeOf } from '../geo/model';
import type { MoldPartMesh, Mouth as MoldMouth } from '../geo/mold';
import { buildBaths, buildMaster } from '../geo/mold';
import { analyzeMold, withScheme } from '../geo/mold/analyze';
import type { MoldState } from '../geo/mold/state';
import type { SplitChoice } from '../state';
import { pickedScheme, sanitizeSettings, sanitizeSetup } from '../state';
import type { JobInfo, JobPart, JobProgress, JobResult, ToolingJob } from './protocol';

/** Grid of the slump mold in a preview: the silhouette is all a preview needs. */
export const PREVIEW_RESOLUTION = 128;
/** No mold has more than four parts — two halves, a bottom plate and a plug. */
const MAX_MOLD_PARTS = 4;
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
  if (!isValidMesh({ positions, indices })) return null;
  const settings = sanitizeSettings(source);
  const setup = sanitizeSetup(source);
  return {
    kind: source.kind === 'export' || source.kind === 'find' ? source.kind : 'preview',
    model: { positions, indices },
    mode: settings.mode,
    mold: settings.mold,
    scheme: settings.scheme,
    resolution: settings.resolution,
    mouth: setup.mouth,
    plug: setup.plug,
    split: setup.split,
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
  if (job.mode === 'slump') return slumpJob(csg, job, onProgress);
  if (job.mode === 'tile') return tileJob(csg, job, onProgress);
  if (job.mode === 'split') return job.kind === 'find' ? findJob(csg, job, onProgress) : splitJob(csg, job, onProgress);
  return moldJob(csg, job, onProgress);
}

function emptyInfo(): JobInfo {
  return { status: null, mouth: null, rimMm: null, scheme: null, reason: [], warnings: [], blocking: [], catches: [] };
}

/** The placed model grown by the shrinkage, as the release check reads it. */
function scaledMesh(model: ToolingJob['model'], shrink: number): RayMesh {
  const positions = new Float32Array(model.positions.length);
  for (let i = 0; i < positions.length; i++) positions[i] = model.positions[i] * shrink;
  return { positions, indices: model.indices };
}

function largestExtent(positions: Float32Array): number {
  const [w, d, h] = sizeOf(positions);
  return Math.max(w, d, h);
}

/**
 * The tile mold: the model read as it is — a raised border is relief, not
 * an opening to fill — checked for release upwards from its back, and sunk
 * face down into a block. A catch too deep blocks the download; the mold is
 * still shown.
 */
function tileJob(csg: CsgApi, job: ToolingJob, onProgress: (progress: JobProgress) => void): JobResult {
  const exporting = job.kind === 'export';
  const info = emptyInfo();
  const progress = new Progress(onProgress, exporting ? 4 : 3);
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
    const shrink = 1 + job.mold.shrinkPct / 100;

    progress.next({ code: 'progress.release' });
    const mesh = scaledMesh(job.model, shrink);
    const cell = releaseCell(largestExtent(mesh.positions), exporting);
    // the mold lies over the face, its rim at the back, and leaves upwards
    const release = releaseDepth(castRays(mesh, 2, cell), { plane: TILE_PROUD_MM, side: 1 });
    info.catches.push({ id: 'tile', depthMm: release.depthMm, at: release.at });
    const limit = job.mold.allowedCatchMm;
    if (release.depthMm > limit && release.at) {
      const params = { mm: release.depthMm.toFixed(1), limit: limit.toFixed(1), z: release.at[2].toFixed(1) };
      // locked right over the rim: under the back, not under the face
      info.blocking.push({ code: release.at[2] - TILE_PROUD_MM < 1.5 * cell ? 'tile.back' : 'tile.catch', params });
    }

    progress.next({ code: 'progress.tile' });
    const mold = fromManifold(buildTileMold(csg, scope, scope.keep(model.scale(shrink)), job.mold.bathWallMm));
    if (exporting) progress.next({ code: 'progress.checkMeshes' });
    return { parts: [part('tile', mold, exporting)], info };
  } finally {
    scope.dispose();
  }
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
    fitMm: mold.threadFitMm,
    threaded: mold.threadedLugs,
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
  { exporting, printScrews, printStops }: { exporting: boolean; printScrews: boolean; printStops: boolean },
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
    // cheeks cut round the stops and the room under the landings cannot be
    // laid over: there a preview pays for the shell's import too.
    const fuse = (mesh: SurfaceMesh, extra: Manifold, cuts: Manifold | null = null): SurfaceMesh => {
      if (!exporting && !cuts) return mergeMeshes([mesh, fromManifold(extra)]);
      const solid = scope.keep(toManifold(csg, mesh));
      const cut = cuts ? scope.keep(solid.subtract(cuts)) : solid;
      return exporting ? fromManifold(scope.keep(cut.add(extra))) : mergeMeshes([fromManifold(cut), fromManifold(extra)]);
    };
    const mold = fuse(slump.mesh, lugs, moldCuts(csg, scope, layout));
    const holed = fuse(punch, tabs);
    const count = layout.angles.length;
    // printed screws need the thread; the stops serve a steel bolt too
    const screws =
      printScrews && options.threaded
        ? Array(count).fill(fromManifold(scope.keep(screwSolid(csg, scope, n).translate([0, 0, SCREW_HEAD_UP]))))
        : [];
    const pads = printStops ? Array(count).fill(fromManifold(padSolid(csg, scope, n))) : [];
    return { mold, punch: holed, screws, pads, layout };
  } finally {
    scope.dispose();
  }
}

/** Copies of a part in a column along y, `step` apart. */
function column(meshes: readonly SurfaceMesh[], step: number): SurfaceMesh[] {
  return meshes.map((mesh, i) => (i === 0 ? mesh : translateMesh(mesh, 0, i * step)));
}

/**
 * The slump mold and the punch — and with the clamps printed, a column of
 * screws and one of stops. Each in its own frame: the app lays them out on
 * the bed and into one STL.
 */
function slumpJob(csg: CsgApi, job: ToolingJob, onProgress: (progress: JobProgress) => void): JobResult {
  const exporting = job.kind === 'export';
  const options = pressOptions(job.mold);
  const progress = new Progress(onProgress, (exporting ? 3 : 2) + (options.screws ? 1 : 0));
  const segments = exporting ? job.resolution : PREVIEW_RESOLUTION;
  progress.next({ code: 'progress.slump' });
  const source = meshSource(job.model, segments, segments);
  progress.next({ code: options.screws ? 'progress.screws' : 'progress.punch' });
  const built = slumpTooling(csg, source, options, { exporting, printScrews: job.mold.printScrews, printStops: job.mold.printStops });
  if (options.screws) progress.next({ code: 'progress.punch' });
  const pieces: [string, SurfaceMesh[]][] = [
    ['slump', [built.mold]],
    ['punch', [built.punch]],
    ['screws', column(built.screws, SCREW_STEP_MM)],
    ['stops', column(built.pads, PAD_STEP_MM)],
  ];

  const info = emptyInfo();
  info.warnings.push(...pressWarnings(source, options.slabMm));

  if (exporting) progress.next({ code: 'progress.checkMeshes' });
  const parts = pieces.filter(([, meshes]) => meshes.length > 0).map(([id, meshes]) => part(id, mergeMeshes(meshes), exporting));
  return { parts, info };
}

const SPLIT_AXIS: Record<SplitChoice['axis'], Axis> = { x: 0, y: 1, z: 2 };

/**
 * The split mold: the piece filled and scaled, cut by the plane; for each
 * half (A on the − side, B on the + side) the release check along its pull
 * and the shell. An open piece's mold ends at its rim and keeps out of its
 * mouth. A catch too deep blocks the download; the halves are still shown.
 */
/** A split mold's piece: filled, scaled, its rim read. */
interface SplitPiece {
  piece: Manifold;
  mesh: SurfaceMesh;
  rim: RimCut | null;
  shrink: number;
}

/**
 * The piece as a split mold sees it, or null with the reason in `info`. The
 * mold sees the outside only; a model it cannot fill is refused, not guessed at.
 */
function splitPiece(csg: CsgApi, scope: CsgScope, job: ToolingJob, info: JobInfo): SplitPiece | null {
  let model;
  try {
    model = scope.keep(toManifold(csg, job.model, { merge: true }));
  } catch {
    info.blocking.push({ code: 'model.notSolid' });
    return null;
  }
  const solid = solidify(csg, scope, model);
  info.status = solid.status;
  if (solid.status === 'open' || solid.status === 'openBottom') {
    info.blocking.push({ code: solid.status === 'open' ? 'model.open' : 'model.openBottom' });
    return null;
  }
  const shrink = 1 + job.mold.shrinkPct / 100;
  const piece = scope.keep(solid.solid.scale(shrink));
  const mesh = fromManifold(piece);
  const rim = solid.status === 'filled' && solid.rim ? rimCut(mesh, solid.rim.zMm * shrink, solid.rim.radiusMm * shrink) : null;
  return { piece, mesh, rim, shrink };
}

function splitJob(csg: CsgApi, job: ToolingJob, onProgress: (progress: JobProgress) => void): JobResult {
  const exporting = job.kind === 'export';
  const info = emptyInfo();
  const progress = new Progress(onProgress, exporting ? 5 : 4);
  const scope = new CsgScope();
  try {
    progress.next({ code: 'progress.model' });
    const prepared = splitPiece(csg, scope, job, info);
    if (!prepared) return { parts: [], info };
    const { piece, mesh, rim, shrink } = prepared;
    const box = piece.boundingBox();
    const axis = SPLIT_AXIS[job.split.axis];
    const plane = box.min[axis] + ((box.max[axis] - box.min[axis]) * job.split.pct) / 100;

    progress.next({ code: 'progress.release' });
    const wallMm = job.mold.bathWallMm;
    const cell = releaseCell(largestExtent(mesh.positions), exporting);
    const rays = castRays(mesh, axis, cell, SPLIT_LAND_MM + cell);
    const halves = [
      { id: 'split-A', half: 'A', side: -1 },
      { id: 'split-B', half: 'B', side: 1 },
    ] as const;
    for (const { id, half, side } of halves) {
      const release = releaseDepth(rays, {
        plane,
        side,
        ...(rim ? { cut: (x, y, z) => rim.unchecked(x, y, z) || rim.contains(x, y, z) } : {}),
      });
      info.catches.push({ id, depthMm: release.depthMm, at: release.at });
      const limit = job.mold.allowedCatchMm;
      if (release.depthMm > limit && release.at) {
        const params = { half, mm: release.depthMm.toFixed(1), limit: limit.toFixed(1), z: (release.at[2] / shrink).toFixed(0) };
        info.blocking.push({ code: 'split.catch', params });
      }
    }

    // the cutter reaches past the land on every side
    const reach = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1]) + 2 * SPLIT_LAND_MM;
    const cutter = rim
      ? scope.keep(csg.Manifold.union(rim.meshes(reach, box.max[2] + SPLIT_LAND_MM).map((section) => scope.keep(toManifold(csg, section)))))
      : null;
    const parts = halves.map(({ id, side }, i) => {
      progress.next({ code: 'progress.split', params: { i: i + 1, n: halves.length } });
      const built = fromManifold(buildHalf(csg, scope, piece, rays, { plane, side, wallMm, cutter }));
      const turned = turnForPrint(built, axis, side);
      return { id, mesh: { ...turned, normals: meshNormals(turned.positions, turned.indices) } };
    });
    if (exporting) progress.next({ code: 'progress.checkMeshes' });
    return { parts: parts.map(({ id, mesh: built }) => part(id, built, exporting)), info };
  } finally {
    scope.dispose();
  }
}

/** "Find": the plane along the user's axis (and the spin, for an upright one) with the shallowest catch. */
function findJob(csg: CsgApi, job: ToolingJob, onProgress: (progress: JobProgress) => void): JobResult {
  const info = emptyInfo();
  const progress = new Progress(onProgress, 1);
  const scope = new CsgScope();
  try {
    progress.next({ code: 'progress.model' });
    const prepared = splitPiece(csg, scope, job, info);
    if (!prepared) return { parts: [], info, found: null };
    const found = findPlane(prepared.mesh, SPLIT_AXIS[job.split.axis], prepared.rim, (i, n) => {
      progress.total = n + 1;
      progress.next({ code: 'progress.find', params: { i, n } });
    });
    return { parts: [], info, found };
  } finally {
    scope.dispose();
  }
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
