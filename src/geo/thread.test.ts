// The printed screw of the slump mold's clamps and its thread: the sizes
// that make one set of screws and stops serve every mold.

import { describe, expect, it } from 'vitest';
import {
  CLEAR_HOLE_MM,
  LUG_THREAD_MM,
  PAD,
  PAD_GAP_MM,
  TAB_T_MM,
  TRAVEL_MM,
  SCREW,
  STEEL,
  STEEL_BOLT_MM,
  THREAD,
  THREAD_FIT_MAX_MM,
  THREAD_FIT_MIN_MM,
  THREAD_FIT_MM,
  minorRadius,
  threadPoints,
  threadSection,
} from './thread';

describe('thread', () => {
  it('is M10 × 2, a 60° profile half a pitch deep', () => {
    expect(THREAD.d).toBe(10);
    expect(THREAD.pitch).toBe(2);
    expect(minorRadius(THREAD)).toBeCloseTo(4);
  });

  it('a printed screw in a printed hole still bites: the flanks overlap by half a millimetre, 0.3 at the loosest fit', () => {
    const overlap = (fit: number): number => THREAD.d / 2 - (minorRadius(THREAD) + fit);
    expect(overlap(THREAD_FIT_MM)).toBeCloseTo(0.5, 9);
    expect(overlap(THREAD_FIT_MAX_MM)).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(THREAD_FIT_MIN_MM).toBeLessThan(THREAD_FIT_MM);
  });

  it('the section lies between the minor and the major radius, grown by the fit, and reaches both', () => {
    for (const grow of [0, THREAD_FIT_MM]) {
      const radii = threadSection(THREAD, grow, 48).map(([x, y]) => Math.hypot(x, y));
      expect(radii).toHaveLength(48);
      expect(Math.min(...radii)).toBeCloseTo(minorRadius(THREAD) + grow, 6);
      expect(Math.max(...radii)).toBeCloseTo(THREAD.d / 2 + grow, 6);
    }
  });

  it('the section goes counter-clockwise (screwSolids checks that the twist makes it right-hand)', () => {
    const section = threadSection(THREAD, 0, 48);
    let area = 0;
    section.forEach(([x0, y0], i) => {
      const [x1, y1] = section[(i + 1) % section.length];
      area += x0 * y1 - x1 * y0;
    });
    expect(area).toBeGreaterThan(0);
  });

  it('a preview takes fewer points per turn than an export', () => {
    expect(threadPoints(false)).toBe(16);
    expect(threadPoints(true)).toBe(48);
  });
});

describe('screw, tab, stop', () => {
  it('the screw passes the tab’s hole freely', () => {
    expect(CLEAR_HOLE_MM - THREAD.d).toBeGreaterThanOrEqual(0.8);
    expect(SCREW.headD).toBeGreaterThan(CLEAR_HOLE_MM + 8);
  });

  it('the shank crosses the tab and the gap and takes all the lug’s thread, with travel to spare', () => {
    const pressed = TAB_T_MM + PAD_GAP_MM + LUG_THREAD_MM;
    // and no longer: the first test print (2026-11-04) found 45 mm 15 % more than needed
    expect(SCREW.shank).toBe(pressed + 8);
  });

  it('the stop with its boss slides into the gap of the pressed pair, the boss enters the tab’s hole, the screw’s tip sits in its dimple', () => {
    // a little lower than the gap, boss included: a stop as tall as the gap with the boss over it did not go in
    const height = PAD.h + PAD.bossH;
    expect(height).toBeLessThan(PAD_GAP_MM);
    expect(PAD_GAP_MM - height).toBeLessThanOrEqual(0.6);
    expect(PAD.bossD).toBeLessThan(CLEAR_HOLE_MM);
    expect(CLEAR_HOLE_MM - PAD.bossD).toBeLessThanOrEqual(0.8);
    expect(PAD.bossH).toBeLessThan(TAB_T_MM);
    // the tip is chamfered from the major radius down to SCREW.tipR: it enters the dimple and stops on its cone
    expect(PAD.dimpleD / 2).toBeGreaterThan(SCREW.tipR);
    expect(PAD.dimpleD / 2).toBeLessThan(THREAD.d / 2);
    expect(PAD.dimpleDepth).toBeLessThan(PAD.h / 2);
  });
});

describe('the steel bolt', () => {
  it('is the shortest ISO length through the tab, the gap and the lug, a washer and a nut, with the travel', () => {
    const needed = TAB_T_MM + PAD_GAP_MM + LUG_THREAD_MM + TRAVEL_MM + STEEL.washerT + STEEL.nutM + STEEL.past;
    expect(needed).toBe(51);
    expect(STEEL_BOLT_MM).toBe(55);
    // the printed screw has the same travel
    expect(SCREW.shank).toBe(TAB_T_MM + PAD_GAP_MM + LUG_THREAD_MM + TRAVEL_MM);
  });
});
