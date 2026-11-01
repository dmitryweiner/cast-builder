import { describe, expect, it } from 'vitest';
import { defaultOrientation, flip, IDENTITY_TURN, isTurn, placeModel, quarterTurn, sanitizeOrientation, sizeOf } from './model';
import { fixture } from './testing';

const bounds = (positions: Float32Array) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], positions[i + c]);
      max[c] = Math.max(max[c], positions[i + c]);
    }
  }
  return { min, max };
};

describe('quarter turns', () => {
  it('stay rotations, and four of them come back', () => {
    let turn: number[] = [...IDENTITY_TURN];
    for (let k = 0; k < 4; k++) {
      turn = quarterTurn(turn, 'x');
      expect(isTurn(turn)).toBe(true);
    }
    expect(turn).toEqual(IDENTITY_TURN);
    expect(isTurn(quarterTurn(quarterTurn(IDENTITY_TURN, 'y'), 'x'))).toBe(true);
  });

  it('a mirror or junk is not a turn', () => {
    expect(isTurn([-1, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(false);
    expect(isTurn([1, 1, 0, 0, 1, 0, 0, 0, 1])).toBe(false);
    expect(isTurn('x')).toBe(false);
    expect(isTurn([1, 0, 0])).toBe(false);
  });

  it('sanitizeOrientation never throws and is idempotent', () => {
    for (const raw of [null, 7, { turn: [2] }, { spinDeg: -30 }, { spinDeg: Infinity }, { turn: flip(IDENTITY_TURN), spinDeg: 725 }]) {
      const once = sanitizeOrientation(raw);
      expect(sanitizeOrientation(once)).toEqual(once);
      expect(isTurn(once.turn)).toBe(true);
      expect(once.spinDeg).toBeGreaterThanOrEqual(0);
      expect(once.spinDeg).toBeLessThan(360);
    }
    expect(sanitizeOrientation({ spinDeg: -30 }).spinDeg).toBe(330);
  });
});

describe('placeModel', () => {
  it('drops the model onto the table with its axis through the origin', () => {
    const pot = fixture('pot');
    const lifted = { ...pot, positions: pot.positions.map((value, i) => value + [40, -25, 13][i % 3]) };
    const { min, max } = bounds(placeModel(lifted, defaultOrientation()).positions);
    expect(min[2]).toBeCloseTo(0, 4);
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 1);
    expect((min[1] + max[1]) / 2).toBeCloseTo(0, 1);
  });

  it('finds the axis by the foot, not by the box: a handle does not pull it aside', () => {
    const placed = placeModel(fixture('pot-handle'), defaultOrientation());
    const { min, max } = bounds(placed.positions);
    // the handle is at x < 0: the box is lopsided, the axis stays at the body's centre
    expect(-min[0]).toBeGreaterThan(max[0] + 10);
    expect(max[1] + min[1]).toBeCloseTo(0, 1);
  });

  it('stands a model lying on its side upright', () => {
    const pot = fixture('vase');
    const lying = placeModel(pot, { turn: quarterTurn(IDENTITY_TURN, 'x'), spinDeg: 0 });
    const upright = placeModel(lying, { turn: quarterTurn(quarterTurn(quarterTurn(IDENTITY_TURN, 'x'), 'x'), 'x'), spinDeg: 0 });
    expect(sizeOf(lying.positions)[1]).toBeCloseTo(sizeOf(pot.positions)[2], 3);
    expect(sizeOf(upright.positions)[2]).toBeCloseTo(sizeOf(pot.positions)[2], 3);
  });

  it('spins about the axis: a handle on −x turns to −y at 90°', () => {
    const spun = placeModel(fixture('pot-handle'), { turn: IDENTITY_TURN, spinDeg: 90 });
    const { min, max } = bounds(spun.positions);
    expect(-min[1]).toBeGreaterThan(max[1] + 10);
  });
});
