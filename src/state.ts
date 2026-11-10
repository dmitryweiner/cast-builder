// What the user chose, in two parts.
//
// Settings are the user's habits — the mode, the plaster, the shrinkage of
// their slip — and survive a reload (storage.ts); undo and redo go over them
// and the setup. The language is not among them: it is no step to undo. A setup belongs to the
// model in hand: how it is turned, where its mouth is, whether it has a plug
// ledge; a new model starts a new setup.
//
// Everything from outside — the UI, localStorage, a message to the worker —
// passes the sanitizers here. They never throw and are idempotent.

import type { MoldScheme } from './geo/mold/analyze';
import { MOLD_SCHEMES } from './geo/mold/analyze';
import type { MoldState } from './geo/mold/state';
import { defaultMold, sanitizeMold } from './geo/mold/state';
import type { Orientation } from './geo/model';
import { defaultOrientation, sanitizeOrientation } from './geo/model';
import type { BedPlace } from './geo/layout';
import { BED_GAP_MAX_MM, BED_GAP_MIN_MM, BED_GAP_MM, BED_PLACES } from './geo/layout';

/**
 * What the export makes:
 *  master — the master positive for a silicone mold made by hand;
 *  bath   — pour boxes for silicone, one per part of the plaster mold;
 *  slump  — the dished slump mold and its punch;
 *  tile   — a one-part press mold for a flat plate with relief;
 *  split  — a two-part press mold, shells parted by a plane, no punch.
 */
export const MODES = ['master', 'bath', 'slump', 'tile', 'split'] as const;
export type Mode = (typeof MODES)[number];

/** The kinds of press mold: one tab in the interface, a switch inside it. */
export const PRESS_KINDS = ['slump', 'tile', 'split'] as const;
export type PressKind = (typeof PRESS_KINDS)[number];

export const SCHEME_CHOICES = ['auto', ...MOLD_SCHEMES] as const;
export type SchemeChoice = (typeof SCHEME_CHOICES)[number];

/** Grid of the exported slump mold, segments around and rows up. */
export const RESOLUTIONS = [128, 192, 256, 384] as const;

/** How the parts go on the bed and into the STL. */
export interface BedChoice {
  place: BedPlace;
  /** between the parts, mm */
  gapMm: number;
  /** pour boxes in one STL laid out on the bed, not a file each; the slump mold is one file anyway */
  oneFile: boolean;
}

export interface Settings {
  mode: Mode;
  /** the kind of press mold last picked: the slump tab opens on it */
  press: PressKind;
  mold: MoldState;
  scheme: SchemeChoice;
  resolution: number;
  bed: BedChoice;
}

export function defaultSettings(): Settings {
  return {
    mode: 'bath',
    press: 'slump',
    mold: defaultMold(),
    scheme: 'auto',
    resolution: 192,
    bed: { place: 'auto', gapMm: BED_GAP_MM, oneFile: false },
  };
}

/** Reset: everything at the defaults but the mode tab — where the user is, not what they tuned. */
export function resetSettings(settings: Settings): Settings {
  return { ...defaultSettings(), mode: settings.mode };
}

export interface MouthChoice {
  /** found from the model; otherwise the two numbers below */
  auto: boolean;
  /** height of the rim, mm, before shrinkage */
  zMm: number;
  /** radius of the gate, mm */
  radiusMm: number;
}

export interface PlugChoice {
  on: boolean;
  /** depth of the ledge below the rim, mm */
  recessMm: number;
  /** radius of the opening over the ledge, mm */
  galleryMm: number;
}

/** The axes a split mold's plane can be square to. */
export const SPLIT_AXES = ['x', 'y', 'z'] as const;
export type SplitAxis = (typeof SPLIT_AXES)[number];
export const SPLIT_PCT_MIN = 5;
export const SPLIT_PCT_MAX = 95;

export interface SplitChoice {
  /** the plane is square to this axis of the placed model */
  axis: SplitAxis;
  /** where along it, % of the filled piece's extent */
  pct: number;
}

export interface Setup {
  orientation: Orientation;
  mouth: MouthChoice;
  plug: PlugChoice;
  split: SplitChoice;
}

export function defaultSetup(): Setup {
  return {
    orientation: defaultOrientation(),
    mouth: { auto: true, zMm: 0, radiusMm: 0 },
    plug: { on: false, recessMm: 6, galleryMm: 0 },
    split: { axis: 'x', pct: 50 },
  };
}

/** Larger than any piece: a limit only against junk. */
export const MOUTH_MAX_MM = 2000;
export const RECESS_MAX_MM = 60;

const record = (raw: unknown): Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...raw } : {};
const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const oneOf = <T extends string>(options: readonly T[], raw: unknown, fallback: T): T =>
  options.find((option) => option === raw) ?? fallback;

export function sanitizeSettings(raw: unknown): Settings {
  const source = record(raw);
  const fallback = defaultSettings();
  const resolution = num(source.resolution, fallback.resolution);
  const bed = record(source.bed);
  const mode = oneOf(MODES, source.mode, fallback.mode);
  return {
    mode,
    // the press tab shows the kind in hand
    press: oneOf(PRESS_KINDS, mode, oneOf(PRESS_KINDS, source.press, fallback.press)),
    mold: sanitizeMold(source.mold),
    scheme: oneOf(SCHEME_CHOICES, source.scheme, fallback.scheme),
    resolution: RESOLUTIONS.some((value) => value === resolution) ? resolution : fallback.resolution,
    bed: {
      place: oneOf(BED_PLACES, bed.place, fallback.bed.place),
      gapMm: clamp(num(bed.gapMm, fallback.bed.gapMm), BED_GAP_MIN_MM, BED_GAP_MAX_MM),
      oneFile: typeof bed.oneFile === 'boolean' ? bed.oneFile : fallback.bed.oneFile,
    },
  };
}

export function sanitizeSetup(raw: unknown): Setup {
  const source = record(raw);
  const mouth = record(source.mouth);
  const plug = record(source.plug);
  const split = record(source.split);
  const fallback = defaultSetup();
  return {
    orientation: sanitizeOrientation(source.orientation),
    mouth: {
      auto: typeof mouth.auto === 'boolean' ? mouth.auto : fallback.mouth.auto,
      zMm: clamp(num(mouth.zMm, fallback.mouth.zMm), 0, MOUTH_MAX_MM),
      radiusMm: clamp(num(mouth.radiusMm, fallback.mouth.radiusMm), 0, MOUTH_MAX_MM),
    },
    plug: {
      on: typeof plug.on === 'boolean' ? plug.on : fallback.plug.on,
      recessMm: clamp(num(plug.recessMm, fallback.plug.recessMm), 0, RECESS_MAX_MM),
      galleryMm: clamp(num(plug.galleryMm, fallback.plug.galleryMm), 0, MOUTH_MAX_MM),
    },
    split: {
      axis: oneOf(SPLIT_AXES, split.axis, fallback.split.axis),
      pct: clamp(num(split.pct, fallback.split.pct), SPLIT_PCT_MIN, SPLIT_PCT_MAX),
    },
  };
}

/** The parting the user asked for, or null for the analyzer's own choice. */
export function pickedScheme(choice: SchemeChoice): MoldScheme | null {
  return choice === 'auto' ? null : choice;
}
