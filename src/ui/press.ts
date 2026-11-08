// The press molds' controls. One tab holds them all, a switch inside it
// picks the kind: the dished mold with its punch, the tile mold, the split
// mold of two halves. The last two have no punch and have to come off the
// clay by themselves: how deep the piece may catch them is the user's
// (their clay, how leather-hard), and the build says how deep it does. The
// plane of a split mold belongs to the model in hand, like its orientation.

import type { Control } from './controls';
import type { Mode, Settings, Setup } from '../state';
import { PRESS_KINDS, SPLIT_AXES, SPLIT_PCT_MAX, SPLIT_PCT_MIN } from '../state';
import {
  CATCH_MAX_MM,
  LAND_MAX_MM,
  LAND_MIN_MM,
  TILE_CUT_PCT_MAX,
  TILE_CUT_PCT_MIN,
  TILE_FIT_MAX_MM,
  TILE_FIT_MIN_MM,
} from '../geo/mold/state';
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

export const tileLand: Control<Settings> = {
  kind: 'range',
  key: 'tileLand',
  label: 'ctl.land',
  hint: 'ctl.tileLand.hint',
  min: LAND_MIN_MM,
  max: LAND_MAX_MM,
  step: 1,
  when: (s) => s.mode === 'tile',
  get: (s) => s.mold.tileLandMm,
  set: (s, value) => ({ ...s, mold: { ...s.mold, tileLandMm: value } }),
};

const tileCut = (s: Settings): boolean => s.mode === 'tile' && s.mold.tileCut;

/** The tile mold in two: a base and a frame with a skirt over it, cut at a share of the cavity's depth; the skirt's fit, the key. */
export const tileCutControls: readonly Control<Settings>[] = [
  {
    kind: 'check',
    key: 'tileCut',
    label: 'ctl.tileCut',
    hint: 'ctl.tileCut.hint',
    when: (s) => s.mode === 'tile',
    get: (s) => s.mold.tileCut,
    set: (s, value) => ({ ...s, mold: { ...s.mold, tileCut: value } }),
  },
  {
    kind: 'range',
    key: 'tileCutPct',
    label: 'ctl.tileCutPct',
    hint: 'ctl.tileCutPct.hint',
    min: TILE_CUT_PCT_MIN,
    max: TILE_CUT_PCT_MAX,
    step: 1,
    when: tileCut,
    get: (s) => s.mold.tileCutPct,
    set: (s, value) => ({ ...s, mold: { ...s.mold, tileCutPct: value } }),
  },
  {
    kind: 'range',
    key: 'tileFit',
    label: 'ctl.tileFit',
    hint: 'ctl.tileFit.hint',
    min: TILE_FIT_MIN_MM,
    max: TILE_FIT_MAX_MM,
    step: 0.05,
    when: tileCut,
    get: (s) => s.mold.tileFitMm,
    set: (s, value) => ({ ...s, mold: { ...s.mold, tileFitMm: value } }),
  },
  {
    kind: 'check',
    key: 'tileKey',
    label: 'ctl.tileKey',
    hint: 'ctl.tileKey.hint',
    when: tileCut,
    get: (s) => s.mold.tileKey,
    set: (s, value) => ({ ...s, mold: { ...s.mold, tileKey: value } }),
  },
];

export const splitLand: Control<Settings> = {
  kind: 'range',
  key: 'splitLand',
  label: 'ctl.land',
  hint: 'ctl.splitLand.hint',
  min: LAND_MIN_MM,
  max: LAND_MAX_MM,
  step: 1,
  when: (s) => s.mode === 'split',
  get: (s) => s.mold.splitLandMm,
  set: (s, value) => ({ ...s, mold: { ...s.mold, splitLandMm: value } }),
};

export const pressControls: readonly Control<Settings>[] = [pressKind, allowedCatch, tileLand, ...tileCutControls, splitLand];

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
