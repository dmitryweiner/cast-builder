// All the CSG of the app. The main thread sends a job and gets finished
// meshes back: the WASM module of manifold never reaches the main thread,
// and the tab does not freeze even exporting pour boxes for a large model.
// A thin adapter over maker-kit's serveJobs — the work itself is in
// tooling.ts.

import { serveJobs } from 'maker-kit/worker/serve';
import { initCSG } from 'maker-kit/csg/manifold';
import { runJob, sanitizeJob } from './tooling';
import type { JobResult } from './protocol';

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

serveJobs<unknown, JobResult>({
  // Any object is taken and checked by the sanitizer, which answers an
  // unknown job with an error. Silence is never an answer: the client waits
  // for exactly one reply per job and would wait forever.
  isJob: (job): job is unknown => typeof job === 'object' && job !== null,
  async handle(raw, progress) {
    const job = sanitizeJob(raw);
    if (!job) throw new Error('the model in the job is broken');
    if (!loaded) progress({ step: 0, total: 1, label: { code: 'progress.loading' } });
    const result = runJob(await ready, job, progress);
    // the buffers are transferred, not copied: at export detail that is tens of megabytes
    return { result, transfer: transferable(result) };
  },
});

function transferable(result: JobResult): Transferable[] {
  const list: Transferable[] = [];
  for (const item of result.parts) {
    for (const view of [item.positions, item.indices, item.normals]) {
      if (view.buffer instanceof ArrayBuffer) list.push(view.buffer);
    }
  }
  return list;
}
