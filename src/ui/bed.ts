// The bed card: how the parts go on the bed and into the STL. The slump
// mold is one file — the mold, the punch, the screws and stops; pour boxes
// are a file each unless they are asked into one. A layout that goes into no
// file is not offered: separate pour boxes lie in the view as the layout
// says, but each prints alone.

import type { Control } from './controls';
import type { Settings } from '../state';
import { BED_GAP_MAX_MM, BED_GAP_MIN_MM, BED_PLACES } from '../geo/layout';

/** Whether the parts of this mode go into one STL, laid out on the bed. */
export function inOneFile(settings: Settings): boolean {
  return settings.mode === 'slump' || (settings.mode === 'bath' && settings.bed.oneFile);
}

export const bedControls: readonly Control<Settings>[] = [
  {
    kind: 'check',
    key: 'oneFile',
    label: 'bed.oneFile',
    hint: 'bed.oneFile.hint',
    when: (s) => s.mode === 'bath',
    get: (s) => s.bed.oneFile,
    set: (s, oneFile) => ({ ...s, bed: { ...s.bed, oneFile } }),
  },
  {
    kind: 'select',
    key: 'place',
    label: 'bed.place',
    hint: 'bed.place.hint',
    options: BED_PLACES.map((value) => ({ value, label: `bed.place.${value}` })),
    when: inOneFile,
    get: (s) => s.bed.place,
    set: (s, value) => ({ ...s, bed: { ...s.bed, place: BED_PLACES.find((place) => place === value) ?? s.bed.place } }),
  },
  {
    kind: 'range',
    key: 'gap',
    label: 'bed.gap',
    hint: 'bed.gap.hint',
    min: BED_GAP_MIN_MM,
    max: BED_GAP_MAX_MM,
    step: 1,
    when: inOneFile,
    get: (s) => s.bed.gapMm,
    set: (s, gapMm) => ({ ...s, bed: { ...s.bed, gapMm } }),
  },
];
