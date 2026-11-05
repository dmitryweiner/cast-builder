// Parameters of the casting tooling.

import { EAR_MAX_MM, EAR_MIN_MM, EAR_SEAT_MM, SLAB_MAX_MM, SLAB_MIN_MM, VENT_MAX_MM, VENT_MIN_MM, VENT_MM } from '../press';
import { THREAD_FIT_MAX_MM, THREAD_FIT_MIN_MM, THREAD_FIT_MM } from '../thread';

export interface MoldState {
  /** shrinkage of the slip from pouring to firing, % — the model grows by it */
  shrinkPct: number;
  /** thickness of plaster round the cavity, mm */
  plasterMm: number;
  /** height of the pouring collar over the rim, mm */
  spareMm: number;
  /** radius of the hemispherical registration keys, mm; 0 — no keys */
  keyMm: number;
  /** wall of a printed pour box, and of the slump mold and punch, mm */
  bathWallMm: number;
  /** silicone over the block, mm */
  bathClearMm: number;
  /** thickness of the clay slab pressed into the slump mold — the wall of the piece, mm */
  slabMm: number;
  /** seat of a slump mold's ear for the punch's leg, radially, mm */
  earMm: number;
  /** rounding of the punch's bottom, % of the largest: 100 — a cap from the axis, 0 — a flat floor */
  punchRoundPct: number;
  /** diameter of the slump vents — in the mold's bottom and along the punch's axis, mm */
  ventMm: number;
  /** screw clamps on the slump mold: lugs with threaded holes beside the ears, tabs of the punch with plain ones */
  screws: boolean;
  /** the screws and stops for them in the same file — they are reusable, printed once */
  printScrews: boolean;
  /** radial clearance of the lugs' threaded holes, mm of the print: the screws stay the same */
  threadFitMm: number;
  /** the lugs' holes threaded for the printed screws; off — plain, for a steel M10 bolt and a nut */
  threadedLugs: boolean;
}

export const SHRINK_MAX_PCT = 30;
export const PLASTER_MIN_MM = 5;
export const PLASTER_MAX_MM = 80;
export const SPARE_MAX_MM = 120;
export const KEY_MAX_MM = 25;
export const BATH_WALL_MIN_MM = 1.2;
export const BATH_WALL_MAX_MM = 12;
export const CLEAR_MIN_MM = 3;
export const CLEAR_MAX_MM = 60;
export { EAR_MAX_MM, EAR_MIN_MM, SLAB_MAX_MM, SLAB_MIN_MM, VENT_MAX_MM, VENT_MIN_MM, THREAD_FIT_MAX_MM, THREAD_FIT_MIN_MM };

export function defaultMold(): MoldState {
  return {
    shrinkPct: 12,
    plasterMm: 28,
    spareMm: 25,
    keyMm: 7,
    bathWallMm: 3,
    bathClearMm: 12,
    slabMm: 6,
    earMm: EAR_SEAT_MM,
    punchRoundPct: 100,
    ventMm: VENT_MM,
    screws: false,
    printScrews: false,
    threadFitMm: THREAD_FIT_MM,
    threadedLugs: true,
  };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);

/** Anything → valid parameters. Never throws; idempotent. */
export function sanitizeMold(raw: unknown): MoldState {
  const fallback = defaultMold();
  const source: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  const plasterMm = clamp(num(source.plasterMm, fallback.plasterMm), PLASTER_MIN_MM, PLASTER_MAX_MM);
  return {
    shrinkPct: clamp(num(source.shrinkPct, fallback.shrinkPct), 0, SHRINK_MAX_PCT),
    plasterMm,
    spareMm: clamp(num(source.spareMm, fallback.spareMm), 0, SPARE_MAX_MM),
    // A key deeper than a third of the plaster would press through it:
    // living plaster must stay between the key's dimple and the cavity.
    keyMm: clamp(num(source.keyMm, fallback.keyMm), 0, plasterMm / 3),
    bathWallMm: clamp(num(source.bathWallMm, fallback.bathWallMm), BATH_WALL_MIN_MM, BATH_WALL_MAX_MM),
    bathClearMm: clamp(num(source.bathClearMm, fallback.bathClearMm), CLEAR_MIN_MM, CLEAR_MAX_MM),
    slabMm: clamp(num(source.slabMm, fallback.slabMm), SLAB_MIN_MM, SLAB_MAX_MM),
    earMm: clamp(num(source.earMm, fallback.earMm), EAR_MIN_MM, EAR_MAX_MM),
    punchRoundPct: clamp(num(source.punchRoundPct, fallback.punchRoundPct), 0, 100),
    ventMm: clamp(num(source.ventMm, fallback.ventMm), VENT_MIN_MM, VENT_MAX_MM),
    screws: typeof source.screws === 'boolean' ? source.screws : fallback.screws,
    printScrews: typeof source.printScrews === 'boolean' ? source.printScrews : fallback.printScrews,
    threadFitMm: clamp(num(source.threadFitMm, fallback.threadFitMm), THREAD_FIT_MIN_MM, THREAD_FIT_MAX_MM),
    threadedLugs: typeof source.threadedLugs === 'boolean' ? source.threadedLugs : fallback.threadedLugs,
  };
}
