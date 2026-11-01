// What the user chose, in two parts.
//
// Settings are the user's habits — the mode, the plaster, the shrinkage of
// their slip — and survive a reload (storage.ts). A setup belongs to the
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
import type { Locale } from './i18n';
import { isLocale } from './i18n';

/**
 * What the export makes:
 *  master — the master positive for a silicone mold made by hand;
 *  bath   — pour boxes for silicone, one per part of the plaster mold;
 *  slump  — the dished slump mold and its punch.
 */
export const MODES = ['master', 'bath', 'slump'] as const;
export type Mode = (typeof MODES)[number];

export const SCHEME_CHOICES = ['auto', ...MOLD_SCHEMES] as const;
export type SchemeChoice = (typeof SCHEME_CHOICES)[number];

/** Grid of the exported slump mold, segments around and rows up. */
export const RESOLUTIONS = [128, 192, 256, 384] as const;

export interface Settings {
  /** the language picked in the switcher; null — from the browser */
  locale: Locale | null;
  mode: Mode;
  mold: MoldState;
  scheme: SchemeChoice;
  resolution: number;
}

export function defaultSettings(): Settings {
  return { locale: null, mode: 'bath', mold: defaultMold(), scheme: 'auto', resolution: 192 };
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

export interface Setup {
  orientation: Orientation;
  mouth: MouthChoice;
  plug: PlugChoice;
}

export function defaultSetup(): Setup {
  return {
    orientation: defaultOrientation(),
    mouth: { auto: true, zMm: 0, radiusMm: 0 },
    plug: { on: false, recessMm: 6, galleryMm: 0 },
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
  return {
    locale: isLocale(source.locale) ? source.locale : null,
    mode: oneOf(MODES, source.mode, fallback.mode),
    mold: sanitizeMold(source.mold),
    scheme: oneOf(SCHEME_CHOICES, source.scheme, fallback.scheme),
    resolution: RESOLUTIONS.some((value) => value === resolution) ? resolution : fallback.resolution,
  };
}

export function sanitizeSetup(raw: unknown): Setup {
  const source = record(raw);
  const mouth = record(source.mouth);
  const plug = record(source.plug);
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
  };
}

/** The parting the user asked for, or null for the analyzer's own choice. */
export function pickedScheme(choice: SchemeChoice): MoldScheme | null {
  return choice === 'auto' ? null : choice;
}
