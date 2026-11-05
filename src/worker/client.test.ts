import { describe, expect, it } from 'vitest';
import { ToolingClient } from './client';
import type { ToolingJob, WorkerIn } from './protocol';
import { defaultSettings, defaultSetup } from '../state';

/** A worker that keeps what it is sent and answers when told. */
class FakeWorker extends EventTarget {
  sent: WorkerIn[] = [];
  postMessage(message: WorkerIn): void {
    this.sent.push(message);
  }
  answer(jobId: number): void {
    const result = {
      parts: [],
      info: { status: null, mouth: null, rimMm: null, scheme: null, reason: [], warnings: [], blocking: [], catches: [] },
    };
    this.dispatchEvent(new MessageEvent('message', { data: { type: 'done', jobId, result } }));
  }
  terminate(): void {}
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

describe('ToolingClient', () => {
  it('a waiting preview gives way to a fresher one; a job asked by a button never does', async () => {
    const worker = new FakeWorker();
    const client = new ToolingClient(() => worker as unknown as Worker);
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
