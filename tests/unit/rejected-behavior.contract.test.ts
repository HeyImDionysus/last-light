import { afterEach, describe, expect, it, vi } from 'vitest';
import { Q } from '../../src/game/constants';
import { advance } from '../../src/game/reducer';
import { attemptStarRespawn } from '../../src/game/spawn';
import { createRng } from '../../src/game/rng';
import { createRound } from '../../src/game/world';

type AnyState = any;
const STILL = { x: 0, y: 0 } as const;
const EAST = { x: Q, y: 0 } as const;

function tick(state: AnyState, movementQ: { x: number; y: number } = STILL) {
  return advance(state, { kind: 'tick', movementQ });
}

function replace<T extends Record<string, unknown>>(state: T, patch: Partial<T>): T {
  return { ...state, ...patch };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rejected seeded-world substitutions', () => {
  it('uses the ordered gameplay stream so different seeds produce different worlds', () => {
    const first = createRound(0x1234_5678) as AnyState;
    const second = createRound(0x8765_4321) as AnyState;

    expect(second.obstacles).not.toEqual(first.obstacles);
    expect(second.availableStars).not.toEqual(first.availableStars);
    expect(second.rngState).not.toBe(first.rngState);
  });

  it('consumes obstacle candidates in order and advances beyond the first PRNG draw', () => {
    const round = createRound(0x1234_5678) as AnyState;

    expect(round.obstacles[0]).toEqual({ id: 0, x: 437, y: 1011, width: 192, height: 240 });
    expect(round.rngState).not.toBe(createRng(0x1234_5678).nextU32());
  });

  it('fails loudly after 32 rejected obstacle candidates instead of returning partial geometry', () => {
    const candidate = { x: 1_200, y: 800, width: 160, height: 128 };
    const nextObstacleCandidate = vi.fn(() => candidate);
    const construct = createRound as unknown as (
      seed: number,
      hooks?: { nextObstacleCandidate: typeof nextObstacleCandidate },
    ) => AnyState;

    expect(() => construct(0x1234_5678, { nextObstacleCandidate })).toThrow(
      /obstacle|placement|32/i,
    );
    expect(nextObstacleCandidate).toHaveBeenCalledTimes(32);
  });

  it('uses an injectable cryptographic seed boundary and a progressing session fallback', () => {
    const getRandomValues = vi.fn((target: Uint32Array) => {
      target[0] = 0x1234_5678;
      return target;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    const cryptographicRound = createRound() as AnyState;
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(cryptographicRound.rngState).toBe(createRng(0x1234_5678).nextU32());

    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn(() => {
        throw new Error('unavailable');
      }),
    });
    const fallbackFirst = createRound() as AnyState;
    const fallbackSecond = createRound() as AnyState;
    expect(fallbackSecond.rngState).not.toBe(fallbackFirst.rngState);
  });

  it('rejects an invalid explicit seed instead of coercing it to the fallback seed', () => {
    const construct = createRound as unknown as (seed: unknown) => AnyState;
    expect(() => construct('not-a-uint32-seed')).toThrow(/seed/i);
  });
});

describe('rejected fixed-point collision substitutions', () => {
  it('stops player swept-circle movement at the exact expanded obstacle boundary', () => {
    const round = createRound(1) as AnyState;
    const state = replace(round, {
      player: { centerQ: { x: 230 * Q, y: 300 * Q } },
      obstacles: [{ id: 0, x: 250, y: 100, width: 100, height: 100 }],
      availableStars: [],
    });

    const next = tick(state, EAST).state as AnyState;
    expect(next.player.centerQ).toEqual({ x: 232 * Q - 1, y: 300 * Q });
  });

  it('stops shadow swept-circle movement at obstacles and world bounds', () => {
    const round = createRound(1) as AnyState;
    const obstacleState = replace(round, {
      player: { centerQ: { x: 1_000 * Q, y: 300 * Q } },
      lantern: { energyUnits: 0 },
      obstacles: [{ id: 0, x: 250, y: 100, width: 100, height: 100 }],
      availableStars: [],
      shadows: [{ id: 0, centerQ: { x: 230 * Q, y: 300 * Q }, graceTicks: 0 }],
    });
    const obstacleStop = tick(obstacleState).state as AnyState;
    expect(obstacleStop.shadows[0].centerQ).toEqual({ x: 231 * Q - 1, y: 300 * Q });

    const boundState = replace(round, {
      player: { centerQ: { x: 2_382 * Q, y: 300 * Q } },
      lantern: { energyUnits: 0 },
      obstacles: [],
      availableStars: [],
      shadows: [{ id: 1, centerQ: { x: 2_380 * Q, y: 300 * Q }, graceTicks: 0 }],
    });
    const boundStop = tick(boundState).state as AnyState;
    expect(boundStop.shadows[0].centerQ).toEqual({ x: 2_381 * Q - 1, y: 300 * Q });
  });
});

describe('rejected runtime spawn substitutions', () => {
  it('derives star respawn positions from state PRNG rather than a fixed fallback point', () => {
    const base = createRound(1) as AnyState;
    const empty = {
      availableStars: [],
      obstacles: [],
      shadows: [],
      player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
      pendingStarRespawn: { dueTick: 1 },
    };
    const firstState = replace(base, empty);
    const secondState = replace(createRound(2) as AnyState, empty);
    const first = attemptStarRespawn(firstState, { currentTick: 1 }) as AnyState;
    const second = attemptStarRespawn(secondState, { currentTick: 1 }) as AnyState;

    expect(second.availableStars[0].centerQ).not.toEqual(first.availableStars[0].centerQ);
    expect(first.rngState).not.toBe(firstState.rngState);
    expect(second.rngState).not.toBe(secondState.rngState);
  });

  it('consumes a deferred shadow request off cadence and advances state PRNG once', () => {
    const base = createRound(0x1234_5678) as AnyState;
    const state = replace(base, {
      tick: 100,
      player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
      availableStars: [],
      obstacles: [],
      shadows: [],
      pendingShadowSpawn: { dueTick: 101 },
    });

    const next = tick(state).state as AnyState;
    expect(next.shadows).toHaveLength(1);
    expect(next.pendingShadowSpawn).toBeUndefined();
    expect(next.rngState).not.toBe(state.rngState);
  });

  it('uses the pre-movement 960x640 camera and an 80px off-screen margin for shadow spawn', () => {
    const base = createRound(0xfeed_beef) as AnyState;
    const state = replace(base, {
      tick: 719,
      player: { centerQ: { x: 18 * Q, y: 800 * Q } },
      availableStars: [],
      obstacles: [],
      shadows: [],
    });

    const next = tick(state).state as AnyState;
    const shadow = next.shadows[0];
    expect(shadow).toBeDefined();
    const x = shadow.centerQ.x / Q;
    const y = shadow.centerQ.y / Q;
    expect(x < -80 || x > 1_040 || y < 160 || y > 1_200).toBe(true);
  });
});

describe('rejected runtime-shadow grace substitution', () => {
  it('keeps spawn-tick grace at 21, then expires it and permits a later loss', () => {
    const base = createRound(0x1234_5678) as AnyState;
    let state = replace(base, {
      tick: 719,
      player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
      lantern: { energyUnits: 0 },
      availableStars: [],
      obstacles: [],
      shadows: [],
    });

    state = tick(state).state as AnyState;
    expect(state.shadows[0].graceTicks).toBe(21);
    for (let index = 0; index < 21; index += 1) state = tick(state).state as AnyState;
    expect(state.shadows[0].graceTicks).toBe(0);

    for (let index = 0; index < 500 && state.phase === 'playing'; index += 1) {
      state = tick(state).state as AnyState;
    }
    expect(state.phase).toBe('lost');
  });
});
