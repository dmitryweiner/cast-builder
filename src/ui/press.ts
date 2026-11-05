// The press molds' controls. One tab holds them all, a switch inside it
// picks the kind: the dished mold with its punch, the tile mold, the split
// mold of two halves. The last two have no punch and have to come off the
// clay by themselves: how deep the piece may catch them is the user's
// (their clay, how leather-hard), and the build says how deep it does. The
// plane of a split mold belongs to the model in hand, like its orientation.

import type { Control } from './controls';
import type { Mode, Settings, Setup } from '../state';
import { PRESS_KINDS, SPLIT_AXES, SPLIT_PCT_MAX, SPLIT_PCT_MIN } from '../state';
import { CATCH_MAX_MM } from '../geo/mold/state';
import { lowerFirst, t, tDynamic } from '../i18n';
import type { Catch } from '../worker/protocol';

const isPress = (mode: Mode): boolean => PRESS_KINDS.some((kind) => kind === mode);
const unpunched = (s: Settings): boolean => s.mode === 'tile' || s.mode === 'split';

export const pressKind: Control<Settings> = {
  kind: 'select',
  key: 'press',
  label: 'press.kind',
  hint: 'press.kind.hint',
  options: PRESS_KINDS.map((value) => ({ value, label: `press.${value}` })),
  when: (s) => isPress(s.mode),
  get: (s) => s.mode,
  set: (s, value) => ({ ...s, mode: PRESS_KINDS.find((kind) => kind === value) ?? s.mode }),
};

export const allowedCatch: Control<Settings> = {
  kind: 'range',
  key: 'allowedCatch',
  label: 'ctl.allowedCatch',
  hint: 'ctl.allowedCatch.hint',
  min: 0,
  max: CATCH_MAX_MM,
  step: 0.5,
  when: unpunched,
  get: (s) => s.mold.allowedCatchMm,
  set: (s, value) => ({ ...s, mold: { ...s.mold, allowedCatchMm: value } }),
};

export const pressControls: readonly Control<Settings>[] = [pressKind, allowedCatch];

export const splitControls: readonly Control<Setup>[] = [
  {
    kind: 'select',
    key: 'axis',
    label: 'split.axis',
    hint: 'split.axis.hint',
    options: SPLIT_AXES.map((value) => ({ value, label: `split.axis.${value}` })),
    get: (s) => s.split.axis,
    set: (s, value) => ({ ...s, split: { ...s.split, axis: SPLIT_AXES.find((axis) => axis === value) ?? s.split.axis } }),
  },
  {
    kind: 'range',
    key: 'pct',
    label: 'split.pct',
    hint: 'split.pct.hint',
    min: SPLIT_PCT_MIN,
    max: SPLIT_PCT_MAX,
    step: 1,
    get: (s) => s.split.pct,
    set: (s, pct) => ({ ...s, split: { ...s.split, pct } }),
  },
];

/** "Undercuts — half A: 0.0 mm, half B: 3.8 mm; allowed 1.0 mm." — empty when the build measured none. */
export function catchNote(catches: readonly Catch[], limitMm: number): string {
  if (catches.length === 0) return '';
  const list = catches.map((item) => t('catch.part', { part: lowerFirst(tDynamic(`part.${item.id}`)), mm: item.depthMm.toFixed(1) }));
  return t('catch.note', { list: list.join(', '), limit: limitMm.toFixed(1) });
}
