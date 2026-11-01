// All the CSG of the app. The main thread sends a job and gets finished
// meshes back: the WASM module of manifold never reaches the main thread,
// and the tab does not freeze even exporting pour boxes for a large model.
// A thin adapter — the work itself is in tooling.ts.

import { initCSG } from '../geo/csg';
import { runJob, sanitizeJob } from './tooling';
import type { JobResult, WorkerIn, WorkerOut } from './protocol';

/** The WASM loads as soon as the worker is made: the client makes it lazily, when there is work to do. */
const ready = initCSG();
/**
 * Whether the module has loaded. The first job waits for half a megabyte of
 * WASM, a noticeable pause on a slow network — the bar says so.
 */
let loaded = false;
void ready.then(() => {
  loaded = true;
});

addEventListener('message', (event) => {
  if (isJobMessage(event.data)) void handle(event.data);
});

async function handle(message: WorkerIn): Promise<void> {
  const { jobId } = message;
  try {
    const job = sanitizeJob(message.job);
    if (!job) throw new Error('the model in the job is broken');
    if (!loaded) send({ type: 'progress', jobId, step: 0, total: 1, label: { code: 'progress.loading' } });
    const result = runJob(await ready, job, (progress) => send({ type: 'progress', jobId, ...progress }));
    // the buffers are transferred, not copied: at export detail that is tens of megabytes
    send({ type: 'done', jobId, result }, transferable(result));
  } catch (error) {
    send({ type: 'error', jobId, message: error instanceof Error ? error.message : String(error) });
  }
}

function send(message: WorkerOut, transfer: Transferable[] = []): void {
  postMessage(message, { transfer });
}

function transferable(result: JobResult): Transferable[] {
  const list: Transferable[] = [];
  for (const item of result.parts) {
    for (const view of [item.positions, item.indices, item.normals]) {
      if (view.buffer instanceof ArrayBuffer) list.push(view.buffer);
    }
  }
  return list;
}

/**
 * Only the shape of the message is checked here: an unknown job is left to
 * the sanitizer and answered with an error. Silence is never an answer — the
 * client waits for exactly one reply per job and would wait forever.
 */
function isJobMessage(data: unknown): data is WorkerIn {
  if (typeof data !== 'object' || data === null) return false;
  if (!('jobId' in data) || typeof data.jobId !== 'number') return false;
  return 'job' in data && typeof data.job === 'object' && data.job !== null;
}
