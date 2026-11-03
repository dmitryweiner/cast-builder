// The checkboxes of the slump mold's screw clamps: the clamps themselves
// (lugs, tabs, holes) and, under them, the printed screws and stops —
// reusable, so a later mold needs the holes without a new set.

import type { Control } from './controls';
import type { Settings } from '../state';

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
    key: 'printScrews',
    label: 'ctl.printScrews',
    hint: 'ctl.printScrews.hint',
    when: (s) => s.mode === 'slump' && s.mold.screws,
    get: (s) => s.mold.printScrews,
    set: (s, value) => ({ ...s, mold: { ...s.mold, printScrews: value } }),
  },
];
