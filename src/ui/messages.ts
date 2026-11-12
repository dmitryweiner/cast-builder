// The panel's messages as one list, drawn by maker-kit's ui/messageList: a
// failed job and what blocks the download first, in the blocker's colour,
// then the warnings. A line's code is its message's (`data-code`).

import type { MessageLine } from 'maker-kit/ui/messageList';
import type { Message } from '../geo/message';
import { tm } from '../i18n';

export function messageLines(o: {
  /** a failed job, already said in words */
  error?: string;
  blocking: readonly Message[];
  warnings: readonly Message[];
}): MessageLine[] {
  const lines: MessageLine[] = o.error === undefined ? [] : [{ severity: 'bad', text: o.error, code: 'error' }];
  for (const m of o.blocking) lines.push({ severity: 'bad', text: tm(m), code: m.code });
  for (const m of o.warnings) lines.push({ severity: 'warn', text: tm(m), code: m.code });
  return lines;
}
