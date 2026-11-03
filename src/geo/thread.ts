// The screw clamps of the slump mold: the printed screw, its thread, the
// stop that goes under the punch's petal. Pure: sizes and the thread's
// cross-section. The worker turns them into solids (screwSolids.ts).
//
// The screws and the stops are printed once and serve every mold, so every
// size here is a constant — a different pitch or gap later would leave the
// printed set useless with new molds (plans/PLAN-SCREWS.md).
//
// The thread is case-constructor's: a 60° profile half a pitch deep, flat
// crests and roots, the hole grown by a radial fit of 0.35 mm (its test
// print chose them). The pitch is coarser than ISO's 1.5: both parts are
// printed, the flanks overlap by pitch / 2 − fit, and 2 mm gives 0.65 mm of
// it against 0.40 — 60 % more bite for a 6 % thinner core.
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

/** Radial clearance of a printed threaded hole, mm. */
export const THREAD_FIT_MM = 0.35;

/** Plain hole in the punch's petal, mm: the screw passes it freely. */
export const CLEAR_HOLE_MM = 11;

/** Thickness of the punch's flange and petals with screws, mm, as printed. */
export const PETAL_T_MM = 8;

/** Gap between the petal of the pressed punch and the seat of the mold's lug, mm: the stop goes there. */
export const PAD_GAP_MM = 10;

/** Thread in a lug under its seat, at least, mm: one and a half diameters. */
export const LUG_THREAD_MM = 16;

/**
 * The printed screw: a knurled thumb head with a slot, the threaded shank
 * from under the head to the tip, the tip chamfered at 45° down to `tipR`.
 */
export const SCREW = {
  headD: 24,
  headH: 10,
  shank: 45,
  slotW: 2.6,
  slotDepth: 4,
  tipR: 3.5,
} as const;

/**
 * The stop: a disc a little lower than the gap; on top a boss that enters
 * the petal's hole and centres it, below a 45° conical dimple for the
 * screw's tip. Printed dimple down.
 */
export const PAD = {
  d: 18,
  h: PAD_GAP_MM - 0.3,
  bossD: 10.4,
  bossH: 2,
  dimpleD: 9,
  dimpleDepth: 2,
} as const;

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

/** Points round one turn of a thread, and slices per turn. */
export function threadPoints(exporting: boolean): number {
  return exporting ? 48 : 16;
}
