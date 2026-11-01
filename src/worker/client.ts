// The main thread's side: one worker, a queue one job deep.
//
// A running job cannot be interrupted — WASM does not stop in the middle of
// a boolean operation. A waiting one can be replaced, and that is what a
// preview needs: while the user drags a slider only the latest request
// matters. A replaced job resolves to null — "no longer wanted", not an
// error, so callers need not tell it from a real failure.

import type { JobProgress, JobResult, ToolingJob, WorkerIn, WorkerOut } from './protocol';

interface Pending {
  id: number;
  job: ToolingJob;
  onProgress?: (progress: JobProgress) => void;
  settle(result: JobResult | null): void;
  fail(message: string): void;
}

/** Makes the worker; a parameter so tests can hand in a fake. */
export type WorkerFactory = () => Worker;

const defaultFactory: WorkerFactory = () => new Worker(new URL('./csg.worker.ts', import.meta.url), { type: 'module' });

export class ToolingClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private running: Pending | null = null;
  private waiting: Pending | null = null;

  constructor(private readonly factory: WorkerFactory = defaultFactory) {}

  /** null in the answer — a fresher job replaced this one. */
  run(job: ToolingJob, onProgress?: (progress: JobProgress) => void): Promise<JobResult | null> {
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        id: this.nextId++,
        job,
        onProgress,
        settle: resolve,
        fail: (message) => reject(new Error(message)),
      };
      if (!this.running) {
        this.start(pending);
        return;
      }
      // An export is never thrown out of the queue: it was asked for by a
      // button, and there is no second time. A preview comes again with the next edit.
      if (this.waiting?.job.kind === 'export' && job.kind !== 'export') {
        resolve(null);
        return;
      }
      this.waiting?.settle(null);
      this.waiting = pending;
    });
  }

  private start(pending: Pending): void {
    this.running = pending;
    const message: WorkerIn = { jobId: pending.id, job: pending.job };
    this.ensure().postMessage(message, []);
  }

  private next(): void {
    this.running = null;
    const waiting = this.waiting;
    this.waiting = null;
    if (waiting) this.start(waiting);
  }

  private receive(data: unknown): void {
    if (!isWorkerOut(data)) return;
    const running = this.running;
    // an answer to a job nobody waits for any more: dropped
    if (!running || running.id !== data.jobId) return;
    if (data.type === 'progress') {
      running.onProgress?.({ step: data.step, total: data.total, label: data.label });
      return;
    }
    if (data.type === 'done') running.settle(data.result);
    else running.fail(data.message);
    this.next();
  }

  /** The worker itself broke: the module did not load, the WASM fell over. */
  private broke(message: string): void {
    this.running?.fail(message);
    this.waiting?.fail(message);
    this.waiting = null;
    this.running = null;
    // the next job raises a new worker: one failure must not bury the app until a reload
    this.worker?.terminate();
    this.worker = null;
  }

  private ensure(): Worker {
    if (!this.worker) {
      const worker = this.factory();
      worker.addEventListener('message', (event) => this.receive(event.data));
      worker.addEventListener('error', (event) => this.broke(event.message || 'the worker failed to start'));
      worker.addEventListener('messageerror', () => this.broke('the worker reply is unreadable'));
      this.worker = worker;
    }
    return this.worker;
  }
}

function isWorkerOut(data: unknown): data is WorkerOut {
  if (typeof data !== 'object' || data === null) return false;
  if (!('jobId' in data) || typeof data.jobId !== 'number') return false;
  if (!('type' in data)) return false;
  return data.type === 'progress' || data.type === 'done' || data.type === 'error';
}
