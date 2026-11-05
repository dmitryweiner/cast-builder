// The controls of the slump mold's screw clamps: the clamps themselves
// (lugs, tabs, holes); whether the lugs are threaded (printed screws) or
// plain (a steel bolt and a nut on the landing); the fit of the threaded
// holes, which never touches the screws; the printed screws and stops —
// reusable, so a later mold needs the holes without a new set. Each print
// box says what it prints, the plain holes what steel they take.

import type { Control } from './controls';
import type { Settings } from '../state';
import type { Params } from '../i18n';
import { THREAD_FIT_MAX_MM, THREAD_FIT_MIN_MM } from '../geo/mold/state';
import { PAD, PAD_GAP_MM, SCREW, STEEL_BOLT_MM, THREAD } from '../geo/thread';

/** The printed screw's sizes, as the interface names them. */
export const screwParams: Params = { d: THREAD.d, pitch: THREAD.pitch, length: SCREW.shank, head: SCREW.headD };
/** The stop's sizes: the height with its boss. */
export const stopParams: Params = { d: PAD.d, h: PAD.h + PAD.bossH, gap: PAD_GAP_MM };

const clamps = (s: Settings): boolean => s.mode === 'slump' && s.mold.screws;
const threaded = (s: Settings): boolean => clamps(s) && s.mold.threadedLugs;

export const screwControls: readonly Control<Settings>[] = [
  {
    kind: 'check',
    key: 'screws',
    label: 'ctl.screws',
    hint: 'ctl.screws.hint',
    when: (s) => s.mode === 'slump',
    get: (s) => s.mold.screws,
    set: (s, value) => ({ ...s, mold: { ...s.mold, screws: value } }),
  },
  {
    kind: 'check',
    key: 'threadedLugs',
    label: 'ctl.threadedLugs',
    hint: 'ctl.threadedLugs.hint',
    note: { key: 'ctl.threadedLugs.note', params: { d: THREAD.d, length: STEEL_BOLT_MM }, when: (s) => !s.mold.threadedLugs },
    when: clamps,
    get: (s) => s.mold.threadedLugs,
    set: (s, value) => ({ ...s, mold: { ...s.mold, threadedLugs: value } }),
  },
  {
    kind: 'range',
    key: 'threadFit',
    label: 'ctl.threadFit',
    hint: 'ctl.threadFit.hint',
    min: THREAD_FIT_MIN_MM,
    max: THREAD_FIT_MAX_MM,
    step: 0.05,
    when: threaded,
    get: (s) => s.mold.threadFitMm,
    set: (s, value) => ({ ...s, mold: { ...s.mold, threadFitMm: value } }),
  },
  {
    kind: 'check',
    key: 'printScrews',
    label: 'ctl.printScrews',
    hint: 'ctl.printScrews.hint',
    note: { key: 'ctl.printScrews.note', params: screwParams },
    when: threaded,
    get: (s) => s.mold.printScrews,
    set: (s, value) => ({ ...s, mold: { ...s.mold, printScrews: value } }),
  },
  {
    kind: 'check',
    key: 'printStops',
    label: 'ctl.printStops',
    hint: 'ctl.printStops.hint',
    note: { key: 'ctl.printStops.note', params: stopParams },
    when: clamps,
    get: (s) => s.mold.printStops,
    set: (s, value) => ({ ...s, mold: { ...s.mold, printStops: value } }),
  },
];
