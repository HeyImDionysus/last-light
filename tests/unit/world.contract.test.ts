import { describe, it, expect } from 'vitest';
import { createRound } from '../../src/game/world';
import { createRng } from '../../src/game/rng';
import { distance, isStarPassable } from '../../src/game/geometry';
import { LIGHTHOUSE, MAX_ENERGY_UNITS, Q } from '../../src/game/constants';

const LIGHTHOUSE_PX = { x: LIGHTHOUSE.x / Q, y: LIGHTHOUSE.y / Q };

describe('procedural world construction', () => {
  it('always produces exactly 24 obstacles with sequential ids', () => {
    for (const seed of [0, 1, 42, 999, 123456]) {
      const round = createRound(seed);
      expect(round.obstacles).toHaveLength(24);
      expect(round.obstacles.map((o) => o.id)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    }
  });

  it('always produces exactly 28 initial stars with sequential ids', () => {
    const round = createRound(7);
    expect(round.availableStars).toHaveLength(28);
    expect(round.availableStars.map((s) => s.id)).toEqual(Array.from({ length: 28 }, (_, i) => i));
  });

  it('starts the player at the lighthouse with a full lantern and clean slate', () => {
    const round = createRound(3);
    expect(round.player.centerQ).toEqual(LIGHTHOUSE);
    expect(round.lantern.energyUnits).toBe(MAX_ENERGY_UNITS);
    expect(round.bankedStars).toBe(0);
    expect(round.carriedStars).toEqual([]);
    expect(round.shadows).toEqual([]);
    expect(round.tick).toBe(0);
    expect(round.phase).toBe('playing');
  });

  it('keeps every star clear of obstacles, outside the lighthouse, and separated', () => {
    const round = createRound(11);
    for (const star of round.availableStars) {
      const p = { x: star.centerQ.x / Q, y: star.centerQ.y / Q };
      expect(distance(p, LIGHTHOUSE_PX)).toBeGreaterThan(150);
      expect(isStarPassable(p, round.obstacles)).toBe(true);
    }
    for (let i = 0; i < round.availableStars.length; i += 1) {
      for (let j = i + 1; j < round.availableStars.length; j += 1) {
        const a = { x: round.availableStars[i]!.centerQ.x / Q, y: round.availableStars[i]!.centerQ.y / Q };
        const b = { x: round.availableStars[j]!.centerQ.x / Q, y: round.availableStars[j]!.centerQ.y / Q };
        expect(distance(a, b)).toBeGreaterThan(100);
      }
    }
  });

  it('places initial stars in their required distance bands', () => {
    const round = createRound(99);
    for (const star of round.availableStars) {
      const d = distance({ x: star.centerQ.x / Q, y: star.centerQ.y / Q }, LIGHTHOUSE_PX);
      if (star.id < 10) expect(d).toBeGreaterThan(250);
      if (star.id < 10) expect(d).toBeLessThanOrEqual(850);
      if (star.id >= 10 && star.id < 20) expect(d).toBeGreaterThan(850);
      if (star.id >= 10 && star.id < 20) expect(d).toBeLessThanOrEqual(1500);
    }
  });

  it('replays an identical world for the same seed (seed determinism)', () => {
    const a = createRound(42);
    const b = createRound(42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('usually produces a different world for a different seed', () => {
    const a = createRound(1);
    const b = createRound(2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('generates successfully for every deterministic seed from 0 through 999', () => {
    for (let seed = 0; seed <= 999; seed += 1) {
      expect(() => createRound(seed)).not.toThrow();
    }
  }, 30000);

  it('normalizes a zero seed to the fallback without throwing', () => {
    expect(() => createRound(0)).not.toThrow();
    const round = createRound(0);
    expect(round.obstacles).toHaveLength(24);
  });

  it('advances the gameplay PRNG so the stored state is nonzero', () => {
    const round = createRound(5);
    expect(round.rngState).toBeGreaterThan(0);
    // And the rng used for construction actually consumed entropy.
    const fresh = createRng(5);
    expect(fresh.nextU32()).not.toBe(round.rngState);
  });
});
