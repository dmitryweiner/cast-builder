// The screw clamps of the slump mold: the printed screw, its thread, the
// stop that goes under the punch's tab. Pure: sizes and the thread's
// cross-section. The worker turns them into solids (screwSolids.ts).
//
// The screws and the stops are printed once and serve every mold, so every
// size here is a constant — a different pitch or gap later would leave the
// printed set useless with new molds (plans/PLAN-SCREWS.md). The one
// exception is the fit: it widens the lug's hole only, never the screw, so
// the user sets it per mold (plans/PLAN-FIT-RESET-PROJECT.md).
//
// The thread is case-constructor's: a 60° profile half a pitch deep, flat
// crests and roots, the hole grown by a radial fit. The pitch is coarser
// than ISO's 1.5: both parts are printed, the flanks overlap by
// pitch / 2 − fit, and 2 mm gives 0.5 mm of it at the default fit against
// 0.40 of ISO's at case-constructor's 0.35.
//
// A single-start helical thread has the same horizontal cross-section at
// every height, turned by 360° per pitch: the thread is that section
// extruded with a twist — no helix mesh by hand, closed by construction.

/** Major diameter and pitch, mm; depth and flanks as shares of the pitch. */
export interface ThreadForm {
  d: number;
  pitch: number;
  /** radial depth */
  depth: number;
  /** axial width of one flank: 30° from the radial direction */
  flank: number;
}

const DEPTH_SHARE = 0.5;

export const THREAD: ThreadForm = { d: 10, pitch: 2, depth: DEPTH_SHARE, flank: DEPTH_SHARE * Math.tan(Math.PI / 6) };

/**
 * Radial clearance of a printed threaded hole, mm, by default: 0.35 (case-
 * constructor's) turned too tight in the lugs. In the mm of the print, never
 * scaled by the shrinkage.
 */
export const THREAD_FIT_MM = 0.5;
export const THREAD_FIT_MIN_MM = 0.2;
/** 0.3 mm of the flanks still overlap. */
export const THREAD_FIT_MAX_MM = 0.7;

/** Plain hole in the punch's tab, mm: the screw passes it freely. */
export const CLEAR_HOLE_MM = 11;

/** Thickness of the punch's tab round a screw, mm, as printed. */
export const TAB_T_MM = 8;

/** Gap between the tab of the pressed punch and the seat of the mold's lug, mm: the stop goes there. */
export const PAD_GAP_MM = 10;

/**
 * Thread in a lug under its seat, mm: six turns. A lug is that high, so it is
 * kept short — 16 mm (one and a half diameters) cost a third more plastic.
 * Its bottom is a flat landing for a steel nut or a clamp's jaw, the same
 * height under the seat on every mold.
 */
export const LUG_THREAD_MM = 12;

/**
 * Room kept free under a lug's landing, mm: a DIN 125 washer M10 is Ø20, a
 * nut of 17 across flats 19.6 across its corners; a washer 2, a nut 8 and
 * four of the bolt past it.
 */
export const NUT_ROOM = { d: 20, h: 14 } as const;

/** How far the punch is still up while the clay is pressed, mm: a screw or a bolt bites from there. */
export const TRAVEL_MM = 8;

/**
 * The printed screw: a knurled thumb head with a slot, the shank from under
 * the head to the tip, the tip chamfered at 45° down to `tipR`. The shank is
 * the tab, the gap and the lug's thread with 8 mm of travel: the first test
 * print found 45 mm 15 % longer than needed. Its first `neck` mm stand in
 * the tab's plain hole and are plain, as wide as the thread: the second
 * print tore the screws at the head, where the thread's root met the head.
 */
export const SCREW = {
  headD: 24,
  headH: 10,
  shank: TAB_T_MM + PAD_GAP_MM + LUG_THREAD_MM + TRAVEL_MM,
  slotW: 2.6,
  slotDepth: 4,
  tipR: 3.5,
  neck: 7,
} as const;

/** The stop's boss, mm: half a millimetre lower than the gap with it, so the stop slides in. */
const PAD_BOSS_H = 2;

/**
 * The stop: a disc, with the boss on top a little lower than the gap — it
 * slides in between the seat and the tab of the pressed pair (the first
 * set had the disc alone 0.3 mm under the gap and the boss over it: 1.7 mm
 * too tall to go in). Lifted by the screw from below, the boss enters the tab's hole
 * and centres the stop; a 45° conical dimple below takes the screw's tip.
 * Printed dimple down.
 */
export const PAD = {
  d: 18,
  h: PAD_GAP_MM - 0.5 - PAD_BOSS_H,
  bossD: 10.4,
  bossH: PAD_BOSS_H,
  dimpleD: 9,
  dimpleDepth: 2,
} as const;

/** Steel for a lug without the thread, mm: a DIN 125 washer, a DIN 934 nut, the bolt a little past it. */
export const STEEL = { washerT: 2, nutM: 8, past: 3 } as const;

/** ISO 4017 lengths of an M10 bolt, mm. */
const BOLT_LENGTHS = [40, 45, 50, 55, 60, 65, 70, 80, 90, 100];

/**
 * The steel bolt for a lug without the thread: the shortest standard one that
 * goes through the tab, the gap and the lug, the washer and the nut on the
 * landing with the punch still up by the travel. One for every mold: the
 * landing is always LUG_THREAD_MM under the seat.
 */
export const STEEL_BOLT_MM = ((): number => {
  const needed = TAB_T_MM + PAD_GAP_MM + LUG_THREAD_MM + TRAVEL_MM + STEEL.washerT + STEEL.nutM + STEEL.past;
  return BOLT_LENGTHS.find((length) => length >= needed) ?? BOLT_LENGTHS[BOLT_LENGTHS.length - 1];
})();

export function minorRadius(form: ThreadForm): number {
  return form.d / 2 - form.depth * form.pitch;
}

/**
 * Radius of the thread at an axial phase t ∈ [0, 1) of the pitch, phase
 * growing towards the tip: the crest flat, the falling flank, the root flat,
 * the rising flank.
 */
function profile(t: number, major: number, minor: number, form: ThreadForm): number {
  const flat = (1 - 2 * form.flank) / 2;
  if (t < flat) return major;
  if (t < flat + form.flank) return major - ((t - flat) / form.flank) * (major - minor);
  if (t < 2 * flat + form.flank) return minor;
  return minor + ((t - 2 * flat - form.flank) / form.flank) * (major - minor);
}

/**
 * The thread's horizontal cross-section at z = 0, counter-clockwise, `n`
 * points: at angle θ the radius is the profile at phase −θ / 2π, so the
 * section turned by 360° · z / pitch is the section at height z — a
 * right-hand thread. `grow` widens it radially (a hole: the fit).
 */
export function threadSection(form: ThreadForm, grow: number, n: number): [number, number][] {
  const major = form.d / 2 + grow;
  const minor = minorRadius(form) + grow;
  return Array.from({ length: n }, (_, i): [number, number] => {
    const theta = (2 * Math.PI * i) / n;
    const t = (((-i / n) % 1) + 1) % 1;
    const r = profile(t, major, minor, form);
    return [r * Math.cos(theta), r * Math.sin(theta)];
  });
}

/** Points round the thread's section. */
export function threadPoints(exporting: boolean): number {
  return exporting ? 48 : 16;
}

/**
 * Slices per turn: a slice every 0.125 mm of height, finer than a layer.
 * A slice per point (48 per turn) made needle-thin triangles that slowed
 * every boolean on them several times over.
 */
export const THREAD_SLICES = 16;
