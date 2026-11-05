// The protocol of the tooling worker. Types only: both sides of the boundary
// (the main thread and the worker) must see one description of the messages.
//
// A job carries everything: the placed model and the user's choices. The
// worker keeps nothing between jobs and passes all of it through the
// sanitizers itself — its boundary is an outer boundary like the UI.

import type { Message } from '../geo/message';
import type { Mouth } from '../geo/mouth';
import type { SolidStatus } from '../geo/solidify';
import type { MoldScheme } from '../geo/mold/analyze';
import type { MoldState } from '../geo/mold/state';
import type { Mode, MouthChoice, PlugChoice, SchemeChoice, SplitChoice } from '../state';

export interface ToolingJob {
  /** a preview is coarser where it can be (the slump grid) and skips the mesh checks */
  kind: 'preview' | 'export';
  /** the model turned and placed: the axis through the origin, the bottom on z = 0 */
  model: { positions: Float32Array; indices: Uint32Array };
  mode: Mode;
  mold: MoldState;
  scheme: SchemeChoice;
  resolution: number;
  mouth: MouthChoice;
  plug: PlugChoice;
  /** the plane of a split mold */
  split: SplitChoice;
}

/** A finished part: a mesh and what the panel shows about it. The panel names it by `id`. */
export interface JobPart {
  id: string;
  /** extent "W×D×H" in mm without units */
  note: string;
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  /** what keeps the part from the download; always empty in a preview */
  blocking: Message[];
}

/** How deep a part of a press mold without a punch catches the piece (geo/release.ts). */
export interface Catch {
  /** the part, as in `JobPart.id` */
  id: string;
  depthMm: number;
  /** where the deepest catch is, in the placed model's frame scaled by the shrinkage; null — none */
  at: [number, number, number] | null;
}

/** What the worker learned about the model on its way. */
export interface JobInfo {
  /** solid as it came, filled, open; null in the slump mode, which reads only the outside */
  status: SolidStatus | null;
  /** the mouth found on the model: the rim's height and the gate's radius */
  mouth: Mouth | null;
  /** the outer radius of the rim the mouth was found at */
  rimMm: number | null;
  scheme: MoldScheme | null;
  /** why this parting, sentence by sentence */
  reason: Message[];
  warnings: Message[];
  /** what keeps the whole job from a result (the model is not a solid) or from the download (a catch too deep) */
  blocking: Message[];
  /** the tile mold and the split mold: how deep each part catches */
  catches: Catch[];
}

export interface JobResult {
  parts: JobPart[];
  info: JobInfo;
}

/**
 * Progress by stages. Manifold says nothing about itself inside one boolean
 * operation, so the bar counts stages and the label says which one is on.
 */
export interface JobProgress {
  step: number;
  /** may get smaller once the parting is known */
  total: number;
  label: Message;
}

export interface WorkerIn {
  jobId: number;
  job: ToolingJob;
}

export type WorkerOut =
  | ({ type: 'progress'; jobId: number } & JobProgress)
  | { type: 'done'; jobId: number; result: JobResult }
  | { type: 'error'; jobId: number; message: string };
