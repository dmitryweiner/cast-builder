import { WorkerClient, type WorkerFactory } from 'maker-kit/worker/client';
import type { WorkerIn } from 'maker-kit/worker/protocol';
import { describe, expect, it } from 'vitest';
import { TOOLING_POLICY } from './client';
import type { JobResult, ToolingJob } from './protocol';
import { defaultSettings, defaultSetup } from '../state';

/** A worker that keeps what it is sent and answers when told. */
function fakeWorker() {
  const sent: WorkerIn<ToolingJob>[] = [];
  let reply: (data: unknown) => void = () => {};
  const factory: WorkerFactory<ToolingJob> = (receive) => {
    reply = receive;
    return { post: (message) => sent.push(message), terminate: () => {} };
  };
  const result: JobResult = {
    parts: [],
    info: { status: null, mouth: null, rimMm: null, scheme: null, reason: [], warnings: [], blocking: [], catches: [] },
  };
  const answer = (jobId: number): void => reply({ type: 'done', jobId, result, ms: 1 });
  return { sent, factory, answer };
}

function job(kind: ToolingJob['kind']): ToolingJob {
  const settings = defaultSettings();
  const setup = defaultSetup();
  return {
    kind,
    model: { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) },
    mode: 'split',
    mold: settings.mold,
    scheme: settings.scheme,
    resolution: settings.resolution,
    mouth: setup.mouth,
    plug: setup.plug,
    split: setup.split,
  };
}

describe('the tooling queue (maker-kit’s WorkerClient with the app’s policy)', () => {
  it('a waiting preview gives way to a fresher one; a job asked by a button never does', async () => {
    const worker = fakeWorker();
    const client = new WorkerClient<ToolingJob, JobResult>(worker.factory, TOOLING_POLICY);
    const running = client.run(job('preview'));
    const stale = client.run(job('preview'));
    const find = client.run(job('find'));
    expect(await stale).toBeNull();
    // a preview after the button waits for nothing: it comes again with the next edit
    expect(await client.run(job('preview'))).toBeNull();
    worker.answer(worker.sent[0].jobId);
    expect(await running).not.toBeNull();
    expect(worker.sent.map((message) => message.job.kind)).toEqual(['preview', 'find']);
    worker.answer(worker.sent[1].jobId);
    expect(await find).not.toBeNull();
  });
});
