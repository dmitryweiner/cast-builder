// All the CSG of the app. The main thread sends a job and gets finished
// meshes back: the WASM module of manifold never reaches the main thread,
// and the tab does not freeze even exporting pour boxes for a large model.
// A thin adapter over maker-kit's serveJobs — the work itself is in
// tooling.ts.

import { serveJobs } from 'maker-kit/worker/serve';
import { initCSG } from 'maker-kit/csg/manifold';
import { isRawJob, runJob, sanitizeJob, type RawJob } from './tooling';
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

serveJobs<RawJob, JobResult>({
  // The outer boundary: a job with no valid model is refused, and the kit
  // answers it with an error (the client waits for one reply per job); the
  // rest of a job taken is brought to a valid one by the sanitizers.
  isJob: isRawJob,
  async handle(raw, progress) {
    const job = sanitizeJob(raw);
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
