// The panel's messages as one list: what blocks the download, then the warnings.
import { describe, expect, it } from 'vitest';
import { messageLines } from './messages';

describe('messageLines', () => {
  it('puts a failed job and what blocks the download first, in red, then the warnings, each with its code', () => {
    const lines = messageLines({
      error: 'The tooling failed: out of memory',
      blocking: [{ code: 'model.notSolid' }],
      warnings: [{ code: 'model.filled' }],
    });
    expect(lines.map(({ severity, code }) => [severity, code])).toEqual([
      ['bad', 'error'],
      ['bad', 'model.notSolid'],
      ['warn', 'model.filled'],
    ]);
    expect(lines[0]?.text).toBe('The tooling failed: out of memory');
    expect(lines[2]?.text).toBe('The model was hollow: its inside is filled, the plaster only sees the outside.');
  });

  it('is empty with nothing to say', () => {
    expect(messageLines({ blocking: [], warnings: [] })).toEqual([]);
  });
});
