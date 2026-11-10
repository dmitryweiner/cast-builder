// The main thread's side: maker-kit's WorkerClient over the tooling worker,
// one lane, a queue one job deep.
//
// A running job cannot be interrupted — WASM does not stop in the middle of
// a boolean operation. A waiting preview is replaced by a fresher one: while
// the user drags a slider only the latest request matters. An export or a
// Find is never thrown out of the queue by a preview: it was asked for by a
// button, and there is no second time; a preview comes again with the next
// edit. A replaced job resolves to null — "no longer wanted", not an error.

import { moduleWorker, WorkerClient, type JobPolicy } from 'maker-kit/worker/client';
import type { JobResult, ToolingJob } from './protocol';

export const TOOLING_POLICY: JobPolicy<ToolingJob> = {
  lane: () => 'tooling',
  kept: (job) => job.kind !== 'preview',
};

export function createToolingClient(): WorkerClient<ToolingJob, JobResult> {
  return new WorkerClient(
    moduleWorker<ToolingJob>(() => new Worker(new URL('./csg.worker.ts', import.meta.url), { type: 'module' })),
    TOOLING_POLICY,
  );
}
