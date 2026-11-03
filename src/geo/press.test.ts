// Slump molding: the dished mold after the outer surface of the piece and
// the punch for it. We check what decides whether the piece comes out the
// right size and whether the punch lands.

import { describe, expect, it } from 'vitest';
import type { PressOptions } from './press';
import {
  buildPunch,
  buildSlumpShell,
  EAR_DROP_MM,
  EAR_SEAT_MM,
  earTopAt,
  legDistance,
  PUNCH_CLEARANCE_MM,
  PUNCH_LEG_WIDTH_MM,
  punchLayout,
  punchSection,
  BOSS_R_MM,
  screwLayout,
  slabThickness,
  VENT_MM,
} from './press';
import { defaultOrientation, placeModel } from './model';
import { meshSource } from './revolve';
import type { PressSource } from './revolve';
import { analyticSource, fixture, withNormals } from './testing';
import { signedVolume, validateMesh } from './validate';
import { LUG_THREAD_MM, PAD, PAD_GAP_MM, SCREW, TAB_T_MM } from './thread';

const N = 96;
const families = ['bowl', 'cup', 'pot', 'vase'];
const sources = new Map<string, PressSource>();
const sourceOf = (family: string): PressSource => {
  let source = sources.get(family);
  if (!source) {
    source = meshSource(placeModel(fixture(family), defaultOrientation()), N, N);
    sources.set(family, source);
  }
  return source;
};
const shell = 3;
const options = (over: Partial<PressOptions> = {}): PressOptions => ({
  shellMm: shell,
  shrinkPct: 0,
  slabMm: 5,
  earMm: EAR_SEAT_MM,
  ventMm: VENT_MM,
  roundPct: 0,
  screws: false,
  ...over,
});

describe('dished mold', () => {
  it('is a closed shell on the table, not a solid block', () => {
    for (const family of families) {
      const { mesh } = buildSlumpShell(sourceOf(family), options());
      const report = validateMesh(mesh);
      expect(report.watertight, family).toBe(true);
      expect(signedVolume(mesh.positions, mesh.indices), family).toBeGreaterThan(0);
      expect(report.bbox.min[2], family).toBeCloseTo(0, 4);
      expect(report.degenerateTriangles, family).toBe(0);
    }
  });

  it('its cavity is the piece with the shrinkage, the bottom and wall as thick as the shell', () => {
    const vessel = validateMesh(withNormals(placeModel(fixture('bowl'), defaultOrientation())));
    const { mesh, fit } = buildSlumpShell(sourceOf('bowl'), options({ shrinkPct: 10 }));
    const report = validateMesh(mesh);
    // height — the piece plus the bottom, all with the shrinkage
    expect(report.extents[2]).toBeCloseTo((vessel.extents[2] + shell) * 1.1, 1);
    // at the rim outside — the piece plus the shell on each side (ears aside)
    let radius = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const u = Math.atan2(mesh.positions[i + 1], mesh.positions[i]);
      if (legDistance(u) <= fit.ear.reach + 1e-6) continue;
      radius = Math.max(radius, Math.hypot(mesh.positions[i], mesh.positions[i + 1]));
    }
    expect(2 * radius).toBeGreaterThan(vessel.extents[0] * 1.1);
    expect(2 * radius).toBeLessThan((vessel.extents[0] + 4 * shell) * 1.1);
    // a shell, not a block: far less material than in the cavity
    expect(report.volume).toBeLessThan(vessel.volume * 1.331 * 0.3);
  });

  it('has no plinth under a foot: the wall goes to the base without a waist', () => {
    const { mesh } = buildSlumpShell(sourceOf('bowl'), options());
    // the outer grid is the first nu·(nv+1) vertices, row j starts at j·nu
    let previous = 0;
    for (let j = 0; j <= N; j++) {
      const k = j * N * 3;
      const r = Math.hypot(mesh.positions[k], mesh.positions[k + 1]);
      expect(r, `row ${j}`).toBeGreaterThanOrEqual(previous - 1e-4);
      previous = r;
    }
  });

  it('raised relief does not pierce the shell', () => {
    const wavy = analyticSource(
      (u, v) => 40 + 15 * v + 6 * Math.max(0, Math.sin(8 * u)),
      (v) => 40 + 15 * v,
      80,
    );
    const { mesh } = buildSlumpShell(wavy, options({ shellMm: 1.2 }));
    expect(validateMesh(mesh).watertight).toBe(true);
    // Vertices: the outer grid first, then the inner one of the same layout.
    // At every node of the side wall the outer surface is farther from the axis.
    const grid = N * (N + 1);
    let thinnest = Infinity;
    for (let n = N; n < grid; n++) {
      const o = n * 3;
      const i = (grid + n) * 3;
      thinnest = Math.min(
        thinnest,
        Math.hypot(mesh.positions[o], mesh.positions[o + 1]) - Math.hypot(mesh.positions[i], mesh.positions[i + 1]),
      );
    }
    expect(thinnest).toBeGreaterThan(0.5);
  });

  it('a recessed mark on the bottom stands out on the floor of the cavity', () => {
    const flat = buildSlumpShell(sourceOf('cup'), options());
    const marked: PressSource = { ...sourceOf('cup'), floorAt: (x, y) => (Math.hypot(x - 10, y) < 4 ? 1 : 0) };
    const { mesh } = buildSlumpShell(marked, options());
    expect(validateMesh(mesh).watertight).toBe(true);
    let top = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      if (Math.hypot(mesh.positions[i] - 10, mesh.positions[i + 1]) < 3) top = Math.max(top, mesh.positions[i + 2]);
    }
    // the floor of the cavity is at the shell over the table; the mark stands a millimetre above it
    expect(top).toBeCloseTo(shell + 1, 3);
    expect(mesh.indices.length).toBeGreaterThan(flat.mesh.indices.length);
  });
});

describe('punch', () => {
  /** The punch in its working position (before the flip), without shrinkage. */
  const working = (family: string) => {
    const source = sourceOf(family);
    const { fit } = buildSlumpShell(source, options());
    const layout = punchLayout(source, options(), fit);
    const mesh = buildPunch(source, options(), fit);
    const top = layout.flangeZ + layout.flangeT;
    const positions = new Float32Array(mesh.positions);
    for (let i = 2; i < positions.length; i += 3) positions[i] = top - positions[i];
    return { source, fit, layout, mesh, positions };
  };

  /** Vertices of the section u = 0: a body of revolution, other angles repeat it. */
  const section = (positions: Float32Array): { r: number; z: number }[] => {
    const out: { r: number; z: number }[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 1]) < 1e-6 && positions[i] > 0) out.push({ r: positions[i], z: positions[i + 2] });
    }
    return out;
  };

  /** The working surface of the mold in section: the silhouette lifted by the shell, and the floor. */
  const matrixOf = (source: PressSource): { r: number; z: number }[] => {
    const matrix: { r: number; z: number }[] = [];
    for (let k = 0; k <= 400; k++) matrix.push({ r: source.radiusAt(k / 400), z: (k / 400) * source.heightMm + shell });
    const r0 = source.radiusAt(0);
    for (let k = 0; k <= 100; k++) matrix.push({ r: (r0 * k) / 100, z: shell });
    return matrix;
  };

  it('is closed, normals out, flange on the table, sized from the fit', () => {
    for (const family of families) {
      const source = sourceOf(family);
      const { fit } = buildSlumpShell(source, options({ shrinkPct: 10 }));
      const layout = punchLayout(source, options({ shrinkPct: 10 }), fit);
      const mesh = buildPunch(source, options({ shrinkPct: 10 }), fit);
      const report = validateMesh(mesh);
      expect(report.watertight, family).toBe(true);
      expect(report.degenerateTriangles, family).toBe(0);
      expect(signedVolume(mesh.positions, mesh.indices), family).toBeGreaterThan(0);
      expect(report.bbox.min[2], family).toBeCloseTo(0, 4);
      let rMax = 0;
      for (let i = 0; i < mesh.positions.length; i += 3) rMax = Math.max(rMax, Math.hypot(mesh.positions[i], mesh.positions[i + 1]));
      // a pot's or a vase's body is wider than the flange: the ears are on the neck
      expect(rMax, family).toBeGreaterThanOrEqual(layout.flangeMm * 1.1 - 1e-3);
      // the legs are short: lowest is the floor of the working surface or the lip at the ear
      const low = Math.min(layout.lipZ, shell + layout.slabMm);
      expect(report.extents[2], family).toBeCloseTo((layout.flangeZ + layout.flangeT - low) * 1.1, 3);
    }
  });

  it('keeps exactly a slab from the mold: on the wall and on the bottom', () => {
    for (const family of families) {
      const { source, layout, positions } = working(family);
      const points = section(positions);
      for (const v of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const r = source.radiusAt(v);
        const z = v * source.heightMm + shell;
        const gap = Math.min(...points.map((q) => Math.hypot(q.r - r, q.z - z)));
        expect(Math.abs(gap - layout.slabMm), `${family} v=${v}`).toBeLessThan(0.05);
      }
      const workFloor = Math.min(...points.filter((q) => q.r < source.radiusAt(0) * 0.5).map((q) => q.z));
      expect(workFloor, family).toBeCloseTo(shell + layout.slabMm, 4);
    }
  });

  /** Clusters of angles: gaps between legs (ears) are more than one and a half grid steps. */
  const clustersOf = (us: number[], step: number): number[][] => {
    const angles = [...new Set(us.map((u) => u.toFixed(6)))].map(Number).toSorted((a, b) => a - b);
    const clusters: number[][] = [];
    for (const a of angles) {
      const last = clusters[clusters.length - 1];
      if (last && a - last[last.length - 1] < step * 1.5) last.push(a);
      else clusters.push([a]);
    }
    // a cluster across ±π is stitched
    const tail = clusters[clusters.length - 1];
    if (clusters.length > 1 && angles[0] + 2 * Math.PI - angles[angles.length - 1] < step * 1.5) {
      clusters.pop();
      clusters[0].push(...tail.map((a) => a - 2 * Math.PI));
    }
    return clusters;
  };

  it('the mold has three ears under the rim, their top at the stated height', () => {
    for (const family of families) {
      const { mesh, fit } = buildSlumpShell(sourceOf(family), options());
      const step = (2 * Math.PI) / N;
      const us: number[] = [];
      let rMax = 0;
      let top = -Infinity;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const r = Math.hypot(mesh.positions[i], mesh.positions[i + 1]);
        // a pot's body is wider than the ears but lower: only the ears' band counts
        if (r < fit.ear.seatInMm || mesh.positions[i + 2] < fit.ear.topZ - EAR_DROP_MM) continue;
        const u = Math.atan2(mesh.positions[i + 1], mesh.positions[i]);
        us.push(u);
        // the slot's cheeks are higher than the ear; the ear itself is where the leg goes
        if (legDistance(u) > fit.ear.slotReach) continue;
        rMax = Math.max(rMax, r);
        top = Math.max(top, mesh.positions[i + 2]);
      }
      expect(clustersOf(us, step).length, family).toBe(3);
      expect(rMax, family).toBeCloseTo(fit.ear.outerMm, 3);
      expect(top, family).toBeCloseTo(fit.ear.topZ, 3);
      expect(fit.rimZ - fit.ear.topZ, family).toBeGreaterThanOrEqual(EAR_DROP_MM - 1e-6);
    }
  });

  it('the ears print without supports: no face overhangs more than the wall', () => {
    for (const family of families) {
      const { mesh, fit } = buildSlumpShell(sourceOf(family), options());
      const { positions, indices } = mesh;
      // the first nu·nv·2 triangles are the outer wall of the mold (assembleHollowMesh)
      const wallTris = N * N * 2;
      let plain = 0;
      let worst = 0;
      for (let t = 0; t < wallTris * 3; t += 3) {
        const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
        const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
        const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
        const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const len = Math.hypot(n[0], n[1], n[2]);
        if (len < 1e-9) continue;
        const down = -n[2] / len; // 1 — looks straight down, overhangs fully
        const u = Math.atan2(positions[a + 1], positions[a]);
        if (legDistance(u) > fit.ear.reach + 0.2) plain = Math.max(plain, down);
        worst = Math.max(worst, down);
      }
      // nothing overhangs worse than the wall (or 45°, if the wall is steeper)
      expect(worst, family).toBeLessThan(Math.max(plain, Math.SQRT1_2) + 0.01);
    }
  });

  it('under an ear the rib does not thicken towards the base', () => {
    const { mesh, fit } = buildSlumpShell(sourceOf('bowl'), options());
    const depths: { z: number; depth: number }[] = [];
    for (let j = 0; j <= N; j++) {
      const base = j * N * 3;
      const z = mesh.positions[base + 2];
      if (z > fit.ear.topZ) continue;
      const plain = Math.hypot(mesh.positions[base], mesh.positions[base + 1]); // u = 0, between the ears
      let depth = 0;
      for (let i = 0; i < N; i++) {
        const k = base + i * 3;
        depth = Math.max(depth, Math.hypot(mesh.positions[k], mesh.positions[k + 1]) - plain);
      }
      depths.push({ z, depth });
    }
    // a bowl's wall is gentler than 45°: the rib goes to the base, but no deeper than at the ear
    const top = Math.max(...depths.filter((d) => d.z > fit.ear.topZ - 15).map((d) => d.depth));
    const low = depths.filter((d) => d.z < fit.ear.topZ - 30);
    expect(low.length).toBeGreaterThan(3);
    for (const d of low) {
      expect(d.depth, `z=${d.z.toFixed(1)}`).toBeGreaterThan(1);
      expect(d.depth, `z=${d.z.toFixed(1)}`).toBeLessThan(top + 0.5);
    }
  });

  it('over an ear is a slot: two cheeks nearly to the rim, the leg passes between them', () => {
    for (const family of families) {
      const { mesh, fit } = buildSlumpShell(sourceOf(family), options());
      const { ear } = fit;
      const step = (2 * Math.PI) / N;
      const cheeks: number[] = [];
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const r = Math.hypot(mesh.positions[i], mesh.positions[i + 1]);
        const z = mesh.positions[i + 2];
        if (r < ear.seatInMm || z < ear.topZ + 1 || z > fit.rimZ) continue;
        const u = Math.atan2(mesh.positions[i + 1], mesh.positions[i]);
        cheeks.push(u);
        // a cheek never goes where the leg does and leaves it an empty cell
        expect(legDistance(u), family).toBeGreaterThan(ear.slotReach);
      }
      const clusters = clustersOf(cheeks, step);
      expect(clusters.length, family).toBe(6);
      for (const cluster of clusters) expect(cluster.length, `${family}: a cheek as thin as a line`).toBeGreaterThan(1);
      // they catch the leg long before it lands, but do not pinch the clay over them
      expect(ear.cheekZ - ear.topZ, family).toBeGreaterThan(EAR_DROP_MM - 3);
      expect(fit.rimZ - ear.cheekZ, family).toBeGreaterThan(1);
    }
  });

  it('the bottom of the mold has a through vent along the axis', () => {
    for (const family of families) {
      const { mesh } = buildSlumpShell(sourceOf(family), options({ shrinkPct: 10 }));
      const report = validateMesh(mesh);
      expect(report.watertight, family).toBe(true);
      const { positions, indices } = mesh;
      let wall = 0;
      for (let t = 0; t < indices.length; t += 3) {
        let x = 0;
        let y = 0;
        for (let k = 0; k < 3; k++) {
          x += positions[indices[t + k] * 3] / 3;
          y += positions[indices[t + k] * 3 + 1] / 3;
        }
        const r = Math.hypot(x, y);
        expect(r, family).toBeGreaterThan((VENT_MM / 2) * 1.1 * 0.95);
        if (r < (VENT_MM / 2) * 1.1) wall++;
      }
      expect(wall, family).toBe(2 * N);
    }
  });

  it('the sole has three grooves from the vent outwards, halfway between the ears', () => {
    // the table closes the vent from below: air and extra clay leave by the grooves
    const source = sourceOf('bowl');
    const { mesh } = buildSlumpShell(source, options());
    const { positions } = mesh;
    const edge = source.radiusAt(0);
    const width = VENT_MM;
    const depth = Math.min(width / 2, shell - 1.2);
    // 45° sides: off the groove's axis the lift is less by that distance
    const lifts = (angle: number, from: number, to: number, slope = false) => {
      const out: number[] = [];
      const cx = Math.cos(angle);
      const cy = Math.sin(angle);
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        const along = x * cx + y * cy;
        if (z > shell - 0.5 || along < from || along > to || Math.abs(x * cy - y * cx) > 0.3) continue;
        out.push(slope ? z + Math.abs(x * cy - y * cx) : z);
      }
      return out;
    };
    for (let k = 0; k < 3; k++) {
      const groove = Math.PI / 2 + (k * 2 * Math.PI) / 3;
      // along the groove the sole is lifted by its full depth — up to the very edge
      const inside = lifts(groove, edge * 0.3, edge * 0.7, depth === width / 2);
      expect(inside.length).toBeGreaterThan(0);
      for (const z of inside) expect(z).toBeCloseTo(depth, 3);
      const rim = lifts(groove, edge + shell * 0.5, Infinity);
      expect(Math.min(...rim)).toBeGreaterThan(depth * 0.9);
      // under an ear the sole is on the table
      const under = lifts(groove + Math.PI / 3, edge * 0.3, edge * 0.7);
      expect(under.length).toBeGreaterThan(0);
      for (const z of under) expect(z).toBeCloseTo(0, 4);
    }
  });

  it('a thin bottom of the mold gets no grooves: they would press through to the cavity', () => {
    const { mesh } = buildSlumpShell(sourceOf('bowl'), options({ shellMm: 1.4 }));
    let lifted = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const z = mesh.positions[i + 2];
      if (z > 0.01 && z < 0.3) lifted++;
    }
    expect(lifted).toBe(0);
  });

  it('three short legs: the sole on the ear, the lip round it outside', () => {
    for (const family of families) {
      const { fit, layout, positions } = working(family);
      const { ear } = fit;
      const step = (2 * Math.PI) / N;
      const legs: { u: number; r: number; z: number }[] = [];
      for (let i = 0; i < positions.length; i += 3) {
        const r = Math.hypot(positions[i], positions[i + 1]);
        const z = positions[i + 2];
        if (z < layout.flangeZ - 0.01 && z > layout.lipZ - 1e-3 && r > ear.seatInMm - 0.5) {
          legs.push({ u: Math.atan2(positions[i + 1], positions[i]), r, z });
        }
      }
      const clusters = clustersOf(
        legs.map((leg) => leg.u),
        step,
      );
      expect(clusters.length, family).toBe(3);
      for (const cluster of clusters) {
        expect(cluster.length, `${family}: a sole as thin as a line`).toBeGreaterThan(1);
        const span = Math.max(...cluster) - Math.min(...cluster);
        expect(Math.abs(span - PUNCH_LEG_WIDTH_MM / ear.outerMm), family).toBeLessThanOrEqual(step * 1.01);
      }
      // the ear holds the depth, not the table
      expect(Math.min(...legs.map((leg) => leg.z)), family).toBeCloseTo(layout.lipZ, 3);
      expect(layout.lipZ, family).toBeGreaterThan(1);
      let contact = 0;
      for (const leg of legs) {
        // the leg is over the ear in angle all the way — the sole does not slide off the seat
        expect(legDistance(leg.u), family).toBeLessThan(ear.legReach + 1e-6);
        // a slab and a gap from the wall, for the clay hanging over
        expect(leg.r, family).toBeGreaterThan(ear.seatInMm - 0.31);
        // it does not go into the ear: either outside its face or not below its top
        const outside = leg.r >= layout.lipInMm - 0.31 - 1e-3 && leg.r >= ear.outerMm + 1e-3;
        expect(outside || leg.z >= earTopAt(ear, leg.r) - 1e-3, `${family} r=${leg.r} z=${leg.z}`).toBe(true);
        if (Math.abs(leg.z - earTopAt(ear, leg.r)) < 1e-3 && leg.r <= ear.outerMm) contact++;
      }
      expect(contact, `${family}: the sole did not land on the ear`).toBeGreaterThan(0);
      // the lip keeps the clearance from the ear's outer face
      const lip = legs.filter((leg) => leg.z < ear.topZ - 1);
      expect(Math.min(...lip.map((leg) => leg.r)) - ear.outerMm, family).toBeGreaterThanOrEqual(PUNCH_CLEARANCE_MM - 1e-3);
    }
  });

  it('between the legs the flange is narrow: just past the mold top, a slab above it', () => {
    for (const family of families) {
      const { fit, layout, positions } = working(family);
      // the section u = 0 is between the legs (they are at −90°, 30° and 150°)
      expect(legDistance(0), family).toBeGreaterThan(fit.ear.reach);
      const flange = section(positions).filter((q) => q.z > fit.rimZ);
      const edge = Math.max(...flange.map((q) => q.r));
      expect(edge, family).toBeGreaterThan(fit.topOuterMm);
      expect(edge, family).toBeLessThan(fit.topOuterMm + 3);
      const under = flange.filter((q) => q.r > fit.rimMm + 1e-3);
      expect(Math.min(...under.map((q) => q.z)), family).toBeCloseTo(layout.flangeZ, 3);
      // and at a leg — full width
      expect(layout.flangeMm, family).toBeGreaterThan(edge + 5);
    }
  });

  it('"Ears" sets how far the ears and legs reach', () => {
    const source = sourceOf('bowl');
    const small = buildSlumpShell(source, options({ earMm: 4 }));
    const large = buildSlumpShell(source, options({ earMm: 12 }));
    expect(large.fit.ear.outerMm - small.fit.ear.outerMm).toBeCloseTo(8, 6);
    const punch = buildPunch(source, options(), small.fit);
    expect(validateMesh(punch).watertight).toBe(true);
    expect(validateMesh(punch).degenerateTriangles).toBe(0);
    expect(punchLayout(source, options(), small.fit).flangeMm).toBeLessThan(punchLayout(source, options(), large.fit).flangeMm - 7.9);
  });

  it('never touches the mold: inside a slab of room, outside past its edge', () => {
    for (const family of families) {
      const { source, fit, layout, positions } = working(family);
      const matrix = matrixOf(source);
      for (let i = 0; i < positions.length; i += 3) {
        const r = Math.hypot(positions[i], positions[i + 1]);
        const z = positions[i + 2];
        if (r > fit.outerMaxMm) continue; // legs and flange outside the mold
        if (z > fit.rimZ + layout.slabMm * 0.9) continue; // above the rim
        const gap = Math.min(...matrix.map((q) => Math.hypot(q.r - r, q.z - z)));
        expect(gap, `${family} r=${r.toFixed(1)} z=${z.toFixed(1)}`).toBeGreaterThan(0.9 * layout.slabMm);
      }
    }
  });

  it('is smooth: the relief of the piece does not get onto the punch', () => {
    const base = (v: number) => 40 + 20 * v;
    const plain = analyticSource((_u, v) => base(v), base, 70);
    const wavy = analyticSource((u, v) => base(v) + 3 * Math.sin(8 * u), base, 70);
    const fit = buildSlumpShell(plain, options()).fit;
    expect(Array.from(buildPunch(wavy, options(), fit).positions)).toEqual(Array.from(buildPunch(plain, options(), fit).positions));
  });

  it('a rounded bottom: the clay is nowhere thinner than the slab, at the axis exactly the slab', () => {
    for (const family of families) {
      const source = sourceOf(family);
      const { fit } = buildSlumpShell(source, options());
      const layout = punchLayout(source, options(), fit);
      const flat = buildPunch(source, options({ roundPct: 0 }), fit);
      const round = buildPunch(source, options({ roundPct: 100 }), fit);
      const report = validateMesh(round);
      expect(report.watertight, family).toBe(true);
      expect(report.degenerateTriangles, family).toBe(0);
      // rounding takes material off the punch — the slab gets more
      expect(signedVolume(round.positions, round.indices), family).toBeLessThan(signedVolume(flat.positions, flat.indices));

      const top = layout.flangeZ + layout.flangeT;
      const points = section(new Float32Array(round.positions).map((x, i) => (i % 3 === 2 ? top - x : x)));
      const matrix = matrixOf(source);
      for (const q of points) {
        if (q.z > fit.rimZ) continue;
        const gap = Math.min(...matrix.map((m) => Math.hypot(m.r - q.r, m.z - q.z)));
        expect(gap, `${family} r=${q.r.toFixed(1)} z=${q.z.toFixed(1)}`).toBeGreaterThan(layout.slabMm - 0.05);
      }
      // at the axis the cap touches the floor: the bottom of the piece is exactly a slab there
      const low = Math.min(...points.map((q) => q.z));
      expect(low - (shell + layout.slabMm), family).toBeLessThan(0.1);
      expect(low, family).toBeGreaterThan(shell + layout.slabMm - 1e-3);
    }
  });

  it('"Vents" sets both holes — in the mold\'s bottom and in the punch', () => {
    const source = sourceOf('bowl');
    const minCentroid = (mesh: { positions: Float32Array; indices: Uint32Array }): number => {
      let min = Infinity;
      for (let t = 0; t < mesh.indices.length; t += 3) {
        let x = 0;
        let y = 0;
        for (let k = 0; k < 3; k++) {
          x += mesh.positions[mesh.indices[t + k] * 3] / 3;
          y += mesh.positions[mesh.indices[t + k] * 3 + 1] / 3;
        }
        min = Math.min(min, Math.hypot(x, y));
      }
      return min;
    };
    for (const vent of [1, 6]) {
      const slump = buildSlumpShell(source, options({ ventMm: vent }));
      expect(slump.fit.ventMm).toBe(vent);
      const punch = buildPunch(source, options({ roundPct: 100 }), slump.fit);
      for (const mesh of [slump.mesh, punch]) {
        const report = validateMesh(mesh);
        expect(report.watertight, `⌀${vent}`).toBe(true);
        expect(report.degenerateTriangles, `⌀${vent}`).toBe(0);
        // centres of the hole's wall faces are a little inside the circle (a chord)
        expect(minCentroid(mesh), `⌀${vent}`).toBeGreaterThan((vent / 2) * 0.95);
        expect(minCentroid(mesh), `⌀${vent}`).toBeLessThan(vent / 2);
      }
    }
  });

  it('for a bowl the bottom is nearly a hemisphere, not a floor with a corner', () => {
    const source = sourceOf('bowl');
    const { fit } = buildSlumpShell(source, options());
    const layout = punchLayout(source, options(), fit);
    const round = buildPunch(source, options({ roundPct: 100 }), fit);
    const top = layout.flangeZ + layout.flangeT;
    const points = section(new Float32Array(round.positions).map((x, i) => (i % 3 === 2 ? top - x : x)));
    const floor = shell + layout.slabMm;
    // halfway to the wall the surface has already risen noticeably over the floor
    const r0 = source.radiusAt(0);
    const mid = points.filter((q) => Math.abs(q.r - r0 * 0.5) < 1.5 && q.z < fit.rimZ * 0.6);
    expect(Math.min(...mid.map((q) => q.z))).toBeGreaterThan(floor + 1);
  });

  it('the slab is clamped: no thicker than 0.4 of the height', () => {
    expect(slabThickness(60, 50)).toBe(20);
    expect(slabThickness(0.1, 50)).toBeGreaterThan(0.5);
  });
});

describe('screw clamps', () => {
  const cases = [
    { shrinkPct: 0, slabMm: 3 },
    { shrinkPct: 12, slabMm: 8 },
  ];
  const each = (check: (family: string, over: Partial<PressOptions>) => void): void => {
    for (const family of families) for (const over of cases) check(family, { ...over, screws: true });
  };
  const at = (family: string, over: Partial<PressOptions>) => {
    const source = sourceOf(family);
    const { fit } = buildSlumpShell(source, options(over));
    return { source, fit, layout: screwLayout(source, options(over), fit), k: 1 + (over.shrinkPct ?? 0) / 100 };
  };
  const head = SCREW.headD / 2;

  it('a lug beside each ear: the head of a screw from below clears the ear, the boss clears the groove', () => {
    each((family, over) => {
      const { fit, layout } = at(family, over);
      expect(layout.angles).toHaveLength(3);
      for (const [i, angle] of layout.angles.entries()) {
        expect(angle - layout.angles[0]).toBeCloseTo((i * 2 * Math.PI) / 3, 9);
        const fromEar = angle - layout.ears[i];
        expect(fromEar - Math.asin(head / layout.axisMm), family).toBeGreaterThanOrEqual(fit.ear.reach - 1e-9);
        // the grooves of the sole are halfway between the ears
        expect(fromEar + Math.asin(BOSS_R_MM / layout.axisMm), family).toBeLessThan(Math.PI / 3 - 0.02);
      }
    });
  });

  it('the stop lies on the boss outside the clay; a screw from below passes the mold with its head', () => {
    each((family, over) => {
      const { fit, layout, k } = at(family, over);
      expect(layout.seatInMm).toBeCloseTo(fit.ear.seatInMm * k, 6);
      expect(layout.axisMm - BOSS_R_MM).toBeGreaterThanOrEqual(layout.seatInMm);
      expect(BOSS_R_MM).toBeGreaterThanOrEqual(PAD.d / 2);
      for (const ring of fit.outer) {
        if (ring.z * k > layout.seatZ) continue;
        expect(ring.r * k + head, `${family} z=${ring.z}`).toBeLessThan(layout.axisMm);
      }
    });
  });

  it('fixed sizes: the tab TAB_T thick from the flange top, the gap, the thread under the seat', () => {
    each((family, over) => {
      const { source, fit, layout, k } = at(family, over);
      const punch = punchLayout(source, options(over), fit);
      expect(punch.flangeT).toBe(Math.max(shell, 3));
      expect(layout.tabTopZ).toBeCloseTo((punch.flangeZ + punch.flangeT) * k, 6);
      expect(layout.tabTopZ - layout.tabBottomZ).toBeCloseTo(TAB_T_MM, 9);
      expect(layout.tabBottomZ - layout.seatZ).toBeCloseTo(PAD_GAP_MM, 9);
      expect(layout.seatZ - layout.lugBottomZ).toBeCloseTo(LUG_THREAD_MM, 9);
      expect(layout.shelfZ).toBeCloseTo(fit.ear.topZ * k, 6);
    });
  });

  it('the region a lug keeps out of is the relief and half a shell, up past the tab', () => {
    each((family, over) => {
      const { source, layout, k } = at(family, over);
      for (const p of layout.cavity) {
        if (p.r === 0 || p.z < 0 || p.z > (source.heightMm + shell) * k) continue;
        const v = Math.min(1, Math.max(0, (p.z / k - shell) / source.heightMm));
        const relief = (source.radiusAt(v) + source.outwardMm) * k;
        expect(p.r - relief).toBeCloseTo((shell * k) / 2, 6);
      }
      expect(layout.cavity[layout.cavity.length - 1].z).toBeGreaterThan(layout.tabTopZ);
      expect(layout.innerMm).toBeLessThan(layout.seatInMm);
    });
  });
});

describe("the punch's section", () => {
  type RZ = { r: number; z: number };
  const distance = (curve: readonly RZ[], p: RZ): number => {
    let best = Infinity;
    for (let k = 0; k + 1 < curve.length; k++) {
      const a = curve[k];
      const b = curve[k + 1];
      const dr = b.r - a.r;
      const dz = b.z - a.z;
      const t = Math.min(1, Math.max(0, ((p.r - a.r) * dr + (p.z - a.z) * dz) / (dr * dr + dz * dz || 1)));
      best = Math.min(best, Math.hypot(p.r - a.r - dr * t, p.z - a.z - dz * t));
    }
    return best;
  };
  const H = 50;
  const sectionOf = (silhouette: (v: number) => number, over: Partial<PressOptions> = {}) => {
    const source = analyticSource((_, v) => silhouette(v), silhouette, H);
    const { fit } = buildSlumpShell(source, options(over));
    // the mold's working surface in its frame: the floor, then the silhouette lifted by the bottom
    const mold: RZ[] = [{ r: 0, z: shell }];
    for (let i = 0; i <= 1000; i++) mold.push({ r: silhouette(i / 1000), z: (i / 1000) * H + shell });
    return { fit, mold, ...punchSection(source, options(over), fit) };
  };

  it('a rounded lip that curls in: the arc goes over the inside of the rim, not round its outside', () => {
    // a wall straight up to the top, then a lip coming in by 1.2 mm over the last millimetre
    const lip = (v: number): number => 40 - 1.2 * Math.max(0, 1 - (1 - v) * H) ** 2;
    const { fit, surface, arc } = sectionOf(lip, { slabMm: 6 });
    for (const p of [...surface, ...arc]) {
      const outsideBelow = p.r > fit.rimMm + 1e-6 && p.z < fit.rimZ - 1e-6;
      expect(outsideBelow, `(${p.r.toFixed(2)}, ${p.z.toFixed(2)})`).toBe(false);
    }
    for (const p of arc.slice(0, -1)) expect(Math.hypot(p.r - fit.rimMm, p.z - fit.rimZ)).toBeCloseTo(6, 6);
  });

  it('rings finer than the slab: no point nearer the mold than the slab, no shelves, the inner shell clear', () => {
    const ringed = (v: number): number => 30 + 12 * v + 0.25 * Math.sin((2 * Math.PI * v * H) / 4.5);
    for (const slabMm of [3, 6]) {
      const { mold, surface, inner } = sectionOf(ringed, { slabMm });
      for (const p of surface) expect(distance(mold, p), `slab ${slabMm} at z ${p.z.toFixed(2)}`).toBeGreaterThan(slabMm * 0.99);
      const floorZ = shell + slabMm;
      for (let k = 1; k < surface.length; k++) {
        const shelf =
          surface[k].z > floorZ + 1 && Math.abs(surface[k].z - surface[k - 1].z) < 1e-6 && Math.abs(surface[k].r - surface[k - 1].r) > 0.3;
        expect(shelf, `slab ${slabMm}: a shelf at z ${surface[k].z.toFixed(2)}`).toBe(false);
      }
      for (const p of inner) expect(distance(surface, p), `slab ${slabMm}: inner at z ${p.z.toFixed(2)}`).toBeGreaterThan(shell * 0.99);
    }
  });
});
