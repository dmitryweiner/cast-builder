// The printed screw and stop as solids, with the real WASM: the screw goes
// into its own printed hole without touching it and still bites.

import { beforeAll, describe, expect, it } from 'vitest';
import type { CsgApi } from './csg';
import { CsgScope, initCSG } from './csg';
import { padSolid, screwSolid, threadRod } from './screwSolids';
import { CLEAR_HOLE_MM, PAD, SCREW, TAB_T_MM, THREAD, THREAD_FIT_MM, threadSection } from './thread';

let csg: CsgApi;
beforeAll(async () => {
  csg = await initCSG();
});

const N = 32;

describe('threadRod', () => {
  it('turns counter-clockwise going up: a right-hand thread', () => {
    const scope = new CsgScope();
    const rod = threadRod(csg, scope, THREAD, 0, 0, 10, N);
    const slice = scope.keep(rod.slice(THREAD.pitch / 4));
    const turned = scope.keep(scope.keep(new csg.CrossSection([threadSection(THREAD, 0, N)], 'Positive')).rotate(90));
    const wrong = scope.keep(scope.keep(new csg.CrossSection([threadSection(THREAD, 0, N)], 'Positive')).rotate(-90));
    const area = slice.area();
    expect(scope.keep(slice.subtract(turned)).area()).toBeLessThan(area * 0.01);
    expect(scope.keep(slice.subtract(wrong)).area()).toBeGreaterThan(area * 0.02);
    scope.dispose();
  });
});

describe('screwSolid', () => {
  it('is one solid: the head below z = 0, the shank up to its length, nothing wider than the head', () => {
    const scope = new CsgScope();
    const screw = screwSolid(csg, scope, N);
    expect(screw.status()).toBe('NoError');
    expect(screw.genus()).toBe(0);
    const { min, max } = screw.boundingBox();
    expect(min[2]).toBeCloseTo(-SCREW.headH, 3);
    expect(max[2]).toBeCloseTo(SCREW.shank, 3);
    expect(Math.max(-min[0], max[0], -min[1], max[1])).toBeLessThanOrEqual(SCREW.headD / 2 + 1e-3);
    scope.dispose();
  });

  it('has a plain neck under the head, joined to it by a 45° cone: no thread root at the head, where the first print tore', () => {
    const scope = new CsgScope();
    const screw = screwSolid(csg, scope, N);
    const R = THREAD.d / 2;
    const area = (z: number) => scope.keep(screw.slice(z)).area();
    // the polygon of N points round the circle is a little smaller than the circle
    const circle = (r: number) => (N / 2) * r * r * Math.sin((2 * Math.PI) / N);
    expect(area(0.5)).toBeCloseTo(circle(R + 0.5), 0);
    for (const z of [1.5, SCREW.neck / 2, SCREW.neck - 0.1]) expect(area(z), `z ${z}`).toBeCloseTo(circle(R), 0);
    // the thread under the neck: its section is the thread's, less than the neck's
    expect(area(SCREW.neck + 2)).toBeLessThan(circle(R) * 0.85);
    // the neck passes the tab's plain hole
    expect(R).toBeLessThan(CLEAR_HOLE_MM / 2);
    expect(SCREW.neck).toBeLessThan(TAB_T_MM);
    scope.dispose();
  });

  it('goes into a printed threaded hole without touching it, and the hole bites into it', () => {
    const scope = new CsgScope();
    const screw = screwSolid(csg, scope, N);
    // the screw's thread is in phase with a rod started at z = −0.5: a hole started a whole number of pitches from there is too
    const hole = threadRod(csg, scope, THREAD, THREAD_FIT_MM, -0.5, 40, N);
    // the hole is a lug's, under the neck that stands in the tab
    const block = scope.keep(scope.keep(csg.Manifold.cube([30, 30, 20], true).translate([0, 0, SCREW.neck + 11])).subtract(hole));
    expect(scope.keep(block.intersect(screw)).volume()).toBeLessThan(1e-3);
    // the teeth of the hole reach inside the screw's major diameter
    const envelope = scope.keep(csg.Manifold.cylinder(40, THREAD.d / 2, THREAD.d / 2, N));
    expect(scope.keep(block.intersect(envelope)).volume()).toBeGreaterThan(100);
    scope.dispose();
  });
});

describe('padSolid', () => {
  it('is one solid as high as the disc and its boss, standing on z = 0', () => {
    const scope = new CsgScope();
    const pad = padSolid(csg, scope, N);
    expect(pad.genus()).toBe(0);
    const { min, max } = pad.boundingBox();
    expect(min[2]).toBeCloseTo(0, 3);
    expect(max[2]).toBeCloseTo(PAD.h + PAD.bossH, 3);
    expect(max[0]).toBeCloseTo(PAD.d / 2, 1);
    scope.dispose();
  });

  it('has a dimple below for the tip, and its boss enters the tab’s hole', () => {
    const scope = new CsgScope();
    const pad = padSolid(csg, scope, N);
    // the tip and the dimple are both 45° cones: the flat end of the tip goes in until the dimple is as narrow
    const reach = PAD.dimpleD / 2 - SCREW.tipR - 0.05;
    const tip = scope.keep(csg.Manifold.cylinder(reach, SCREW.tipR, SCREW.tipR, N));
    expect(scope.keep(pad.intersect(tip)).volume()).toBeLessThan(1e-3);
    const tab = scope.keep(
      scope
        .keep(csg.Manifold.cube([40, 40, PAD.bossH], true).translate([0, 0, PAD.h + PAD.bossH / 2 + 0.01]))
        .subtract(scope.keep(csg.Manifold.cylinder(40, CLEAR_HOLE_MM / 2, CLEAR_HOLE_MM / 2, N, true))),
    );
    expect(scope.keep(pad.intersect(tab)).volume()).toBeLessThan(1e-3);
    scope.dispose();
  });
});
