import { describe, expect, it, vi } from 'vitest';
import { Q, MAX_ENERGY_UNITS } from '../../src/game/constants';
import { createInputController } from '../../src/game/input';
import { advance } from '../../src/game/reducer';
import { createRng } from '../../src/game/rng';
import { attemptStarRespawn } from '../../src/game/spawn';
import { createRound } from '../../src/game/world';
import { quantizeThumbVector } from '../../src/platform/input';
import { loadPreferences, savePreferences } from '../../src/platform/storage';

type AnyState = any;
const STILL = { x: 0, y: 0 } as const;
const EAST = { x: Q, y: 0 } as const;
const WEST = { x: -Q, y: 0 } as const;
const NORTH = { x: 0, y: -Q } as const;
const SOUTH = { x: 0, y: Q } as const;

function tick(state: AnyState, movementQ: { x: number; y: number } = STILL) {
  return advance(state, { kind: 'tick', movementQ });
}

function patch(state: AnyState, changes: AnyState): AnyState {
  return { ...state, ...changes };
}

function storage(overrides: Partial<Storage> = {}): Storage {
  return {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    get length() {
      return 0;
    },
    ...overrides,
  } as Storage;
}

describe('mutation-gap input contracts', () => {
  it.each([
    ['ArrowUp', { x: 0, y: -Q }],
    ['KeyW', { x: 0, y: -Q }],
    ['ArrowDown', { x: 0, y: Q }],
    ['KeyS', { x: 0, y: Q }],
    ['ArrowLeft', { x: -Q, y: 0 }],
    ['KeyA', { x: -Q, y: 0 }],
    ['ArrowRight', { x: Q, y: 0 }],
    ['KeyD', { x: Q, y: 0 }],
  ])('recognizes every supported code: %s', (code, expected) => {
    const input = createInputController();
    input.keyDown(code);
    expect(input.movementForTick()).toEqual(expected);
    input.keyDown(code);
    input.keyDown('Escape');
    expect(input.movementForTick()).toEqual(expected);
    input.keyUp('Escape');
    input.keyUp(code);
    expect(input.movementForTick()).toEqual({ x: 0, y: 0 });
  });

  it('handles both aliases and all opposite-axis combinations', () => {
    const input = createInputController();
    input.keyDown('ArrowUp');
    input.keyDown('KeyS');
    expect(input.movementForTick()).toEqual({ x: 0, y: 0 });
    input.keyDown('ArrowRight');
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
    input.keyDown('KeyA');
    expect(input.movementForTick()).toEqual({ x: 0, y: 0 });
    input.keyUp('ArrowUp');
    expect(input.movementForTick()).toEqual({ x: 0, y: Q });
    input.keyUp('KeyS');
    input.keyUp('ArrowRight');
    input.keyUp('KeyA');
    expect(input.movementForTick()).toEqual({ x: 0, y: 0 });
  });

  it('uses the latest nonzero source after each real source change', () => {
    const input = createInputController();
    input.keyDown('KeyD');
    input.setTouch({ x: -Q, y: 0 });
    expect(input.movementForTick()).toEqual({ x: -Q, y: 0 });
    input.keyDown('KeyW');
    expect(input.movementForTick()).toEqual({ x: 46_341, y: -46_341 });
    input.keyUp('KeyW');
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
    input.releaseTouch();
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
  });
});

describe('mutation-gap RNG contracts', () => {
  it('rejects every invalid inclusive range boundary', () => {
    const rng = createRng(1);
    const invalidRanges: Array<[number, number]> = [
      [1.5, 2],
      [1, 2.5],
      [Number.NaN, 2],
      [1, Number.POSITIVE_INFINITY],
      [2, 1],
    ];
    for (const [min, max] of invalidRanges)
      expect(() => rng.int(min, max)).toThrow('invalid rng range');
    expect(rng.int(7, 7)).toBe(7);
  });

  it('keeps deterministic inclusive mapping for several spans', () => {
    const two = createRng(0xfeed_beef);
    expect(Array.from({ length: 5 }, () => two.int(0, 1))).toEqual([1, 1, 0, 0, 0]);
    const three = createRng(0xfeed_beef);
    expect(Array.from({ length: 5 }, () => three.int(-1, 1))).toEqual([1, -1, 1, 0, 0]);
    const nine = createRng(0xfeed_beef);
    expect(Array.from({ length: 5 }, () => nine.int(0, 8))).toEqual([2, 3, 2, 7, 1]);
  });
});

describe('mutation-gap thumb quantization contracts', () => {
  it('normalizes every cardinal and diagonal direction, including negatives', () => {
    expect(quantizeThumbVector(13 * 256, 0)).toEqual({ x: Q, y: 0 });
    expect(quantizeThumbVector(0, -13 * 256)).toEqual({ x: 0, y: -Q });
    expect(quantizeThumbVector(20 * 256, 21 * 256)).toEqual({ x: 45_197, y: 47_457 });
    expect(quantizeThumbVector(-20 * 256, 21 * 256)).toEqual({ x: -45_197, y: 47_457 });
    expect(quantizeThumbVector(-100 * 256, -50 * 256)).toEqual({ x: -58_623, y: -29_308 });
  });

  it('clamps both coordinates to the maximum radius before normalization', () => {
    expect(quantizeThumbVector(100 * 256, 50 * 256)).toEqual({ x: 58_623, y: 29_308 });
    expect(quantizeThumbVector(-50 * 256, 100 * 256)).toEqual({ x: -29_308, y: 58_623 });
  });
});

describe('mutation-gap world geometry contracts', () => {
  it('keeps obstacle quota and ID order while replaying by seed', () => {
    const first = createRound(1) as AnyState;
    const replay = createRound(1) as AnyState;
    const different = createRound(2) as AnyState;
    expect(first.obstacles).toHaveLength(24);
    expect(first.obstacles.map((obstacle: AnyState) => obstacle.id)).toEqual([...Array(24).keys()]);
    expect(replay.obstacles).toEqual(first.obstacles);
    expect(different.obstacles).not.toEqual(first.obstacles);
  });

  it('keeps initial star quota and ID order while replaying by seed', () => {
    const first = createRound(1) as AnyState;
    const replay = createRound(1) as AnyState;
    const different = createRound(2) as AnyState;
    expect(first.availableStars).toHaveLength(28);
    expect(first.availableStars.map((star: AnyState) => star.id)).toEqual([...Array(28).keys()]);
    expect(replay.availableStars).toEqual(first.availableStars);
    expect(different.availableStars).not.toEqual(first.availableStars);
  });
});

describe('mutation-gap storage contracts', () => {
  const defaults = {
    version: 1,
    bestScore: 0,
    muted: false,
    highContrast: false,
    reducedMotion: 'system' as const,
  };

  it.each([
    ['version', { version: 2 }],
    ['bestScore type', { bestScore: 1.2 }],
    ['bestScore negative', { bestScore: -1 }],
    ['bestScore too large', { bestScore: 1_000_001 }],
    ['muted type', { muted: 'yes' }],
    ['highContrast type', { highContrast: 1 }],
    ['reducedMotion type', { reducedMotion: 'sometimes' }],
  ])('rejects invalid %s while retaining defaults', (_name, change) => {
    const target = storage({ getItem: vi.fn(() => JSON.stringify({ ...defaults, ...change })) });
    expect(loadPreferences(target)).toEqual({ ok: false, value: defaults, reason: 'invalid' });
  });

  it('accepts both inclusive best-score limits and all known fields', () => {
    for (const bestScore of [0, 1_000_000]) {
      const value = {
        ...defaults,
        bestScore,
        muted: true,
        highContrast: true,
        reducedMotion: 'off' as const,
      };
      expect(loadPreferences(storage({ getItem: vi.fn(() => JSON.stringify(value)) }))).toEqual({
        ok: true,
        value,
      });
      const target = storage();
      expect(savePreferences(target, value)).toBe(true);
      expect(target.setItem).toHaveBeenCalledWith(
        'last-light:preferences:v1',
        JSON.stringify(value),
      );
    }
  });

  it('treats exactly 1024 bytes as valid and 1025 bytes as invalid', () => {
    const sized = (length: number) => {
      let padding = '';
      while (JSON.stringify({ ...defaults, padding }).length < length) padding += 'x';
      while (JSON.stringify({ ...defaults, padding }).length > length)
        padding = padding.slice(0, -1);
      return JSON.stringify({ ...defaults, padding });
    };
    const atLimit = loadPreferences(storage({ getItem: vi.fn(() => sized(1024)) }));
    expect(atLimit.ok).toBe(true);
    expect(loadPreferences(storage({ getItem: vi.fn(() => sized(1025)) }))).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects non-plain objects on save without touching storage', () => {
    const target = storage();
    expect(savePreferences(target, Object.assign(Object.create(null), { version: 1 }))).toBe(false);
    expect(savePreferences(target, [] as never)).toBe(false);
    expect(target.setItem).not.toHaveBeenCalled();
  });
});

describe('mutation-gap reducer contracts', () => {
  it('rejects each malformed movement/state scalar and duplicate entity list', () => {
    const round = createRound(1) as AnyState;
    expect(() => tick(round, { x: Number.NaN, y: 0 })).toThrow('invalid movement');
    expect(() => tick(round, { x: 0, y: Number.POSITIVE_INFINITY })).toThrow('invalid movement');
    expect(() => tick(round, { x: Q + 1, y: Q })).toThrow('invalid movement');
    expect(() => tick(patch(round, { rngState: 1.5 }))).toThrow('invalid game state');
    expect(() => tick(patch(round, { lantern: { energyUnits: -1 } }))).toThrow('invalid lantern');
    expect(() => tick(patch(round, { lantern: { energyUnits: MAX_ENERGY_UNITS + 1 } }))).toThrow(
      'invalid lantern',
    );
    for (const field of ['obstacles', 'availableStars', 'shadows'] as const) {
      const item = round[field][0] ?? {
        id: 0,
        centerQ: { x: 2_000 * Q, y: 1_200 * Q },
        graceTicks: 0,
      };
      expect(() => tick(patch(round, { [field]: [item, { ...item }] }))).toThrow(
        'duplicate entity id',
      );
    }
  });

  it('clamps player motion independently at all four world borders', () => {
    const round = createRound(1) as AnyState;
    expect(
      tick(patch(round, { player: { centerQ: { x: 2_381 * Q, y: 800 * Q } } }), EAST).state.player
        .centerQ.x,
    ).toBe(2_382 * Q - 1);
    expect(
      tick(patch(round, { player: { centerQ: { x: 19 * Q, y: 800 * Q } } }), WEST).state.player
        .centerQ.x,
    ).toBe(18 * Q + 1);
    expect(
      tick(patch(round, { player: { centerQ: { x: 1_200 * Q, y: 1_581 * Q } } }), SOUTH).state
        .player.centerQ.y,
    ).toBe(1_582 * Q - 1);
    expect(
      tick(patch(round, { player: { centerQ: { x: 1_200 * Q, y: 19 * Q } } }), NORTH).state.player
        .centerQ.y,
    ).toBe(18 * Q + 1);
  });

  it('moves shadows diagonally and increases pursuit speed after each five banked stars', () => {
    const round = createRound(1) as AnyState;
    const diagonal = patch(round, {
      player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
      shadows: [{ id: 0, centerQ: { x: 1_500 * Q, y: 1_100 * Q }, graceTicks: 0 }],
    });
    const diagonalNext = tick(diagonal).state as AnyState;
    expect(diagonalNext.shadows[0].centerQ).toEqual({
      x: 1_500 * Q - 71_054,
      y: 1_100 * Q - 71_054,
    });
    const speed = patch(round, {
      player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
      bankedStars: 5,
      shadows: [{ id: 0, centerQ: { x: 1_800 * Q, y: 800 * Q }, graceTicks: 0 }],
    });
    expect((tick(speed).state as AnyState).shadows[0].centerQ.x).toBe(1_800 * Q - 104_857);
  });

  it('keeps shadows outside the lighthouse radial boundary', () => {
    const round = createRound(1) as AnyState;
    const state = patch(round, {
      player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
      shadows: [{ id: 0, centerQ: { x: 1_370 * Q, y: 800 * Q }, graceTicks: 0 }],
    });
    const next = tick(state).state as AnyState;
    expect(next.shadows[0].centerQ).toEqual({ x: 1_200 * Q + 169 * Q, y: 800 * Q });
  });

  it('applies repel at the inclusive radius and records both axes', () => {
    const round = createRound(1) as AnyState;
    const player = { x: 1_800 * Q, y: 800 * Q };
    const state = patch(round, {
      player: { centerQ: player },
      shadows: [
        {
          id: 0,
          centerQ: { x: player.x + 109 * Q + 100_488, y: player.y + 109 * Q + 100_488 },
          graceTicks: 0,
        },
      ],
    });
    const next = tick(state).state as AnyState;
    expect(next.shadows[0].graceTicks).toBe(21);
    expect(next.shadows[0].centerQ.y).toBeGreaterThan(state.shadows[0].centerQ.y);
  });

  it('collides at the inclusive radius only when the lantern is empty', () => {
    const round = createRound(1) as AnyState;
    const player = { x: 1_800 * Q, y: 800 * Q };
    const shadow = {
      id: 0,
      centerQ: { x: player.x + 37 * Q + 100_488, y: player.y },
      graceTicks: 0,
    };
    expect(
      (
        tick(
          patch(round, {
            player: { centerQ: player },
            lantern: { energyUnits: 0 },
            shadows: [shadow],
          }),
        ).state as AnyState
      ).phase,
    ).toBe('lost');
    expect(
      (
        tick(
          patch(round, {
            player: { centerQ: player },
            lantern: { energyUnits: 100 },
            shadows: [shadow],
          }),
        ).state as AnyState
      ).phase,
    ).toBe('playing');
  });

  it('decrements ordinary shadow grace and never decrements newly spawned grace', () => {
    const round = createRound(1) as AnyState;
    const ordinary = patch(round, {
      shadows: [{ id: 0, centerQ: { x: 1_800 * Q, y: 800 * Q }, graceTicks: 5 }],
    });
    expect((tick(ordinary).state as AnyState).shadows[0].graceTicks).toBe(4);
    const fresh = patch(round, { tick: 719, shadows: [] });
    expect((tick(fresh).state as AnyState).shadows[0].graceTicks).toBe(21);
  });

  it('spawns on the exact 720-tick cadence and respects the banked-star cap', () => {
    const round = createRound(1) as AnyState;
    const atCadence = patch(round, {
      tick: 2_519,
      shadows: [],
      player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
    });
    const spawned = tick(atCadence).state as AnyState;
    expect(spawned.tick).toBe(2_520);
    expect(spawned.shadows).toHaveLength(1);
    expect(spawned.shadows[0].id).toBe(0);
    const capped = patch(atCadence, {
      bankedStars: 0,
      shadows: [
        { id: 0, centerQ: { x: 2_000 * Q, y: 800 * Q }, graceTicks: 21 },
        { id: 1, centerQ: { x: 2_100 * Q, y: 800 * Q }, graceTicks: 21 },
      ],
    });
    expect((tick(capped).state as AnyState).shadows).toHaveLength(2);
  });

  it('creates and consumes a pending respawn only when the total star count is below 28', () => {
    const round = createRound(1) as AnyState;
    const low = patch(round, {
      tick: 719,
      availableStars: round.availableStars.slice(0, 27),
      carriedStars: [],
    });
    const lowNext = tick(low).state as AnyState;
    expect(lowNext.availableStars).toHaveLength(28);
    expect(lowNext.pendingStarRespawn).toBeUndefined();
    const full = patch(round, {
      tick: 719,
      availableStars: round.availableStars.slice(0, 28),
      carriedStars: [],
    });
    expect((tick(full).state as AnyState).pendingStarRespawn).toBeUndefined();
  });

  it('picks up only within the inclusive radius and never exceeds five carried stars', () => {
    const round = createRound(1) as AnyState;
    const player = { x: 1_800 * Q, y: 800 * Q };
    const star = { id: 99, centerQ: { x: player.x + 34 * Q, y: player.y } };
    const picked = tick(
      patch(round, { player: { centerQ: player }, availableStars: [star], carriedStars: [] }),
    ).state as AnyState;
    expect(picked.carriedStars).toEqual([99]);
    expect(picked.availableStars).toEqual([]);
    const notPicked = tick(
      patch(round, {
        player: { centerQ: player },
        availableStars: [{ ...star, centerQ: { x: player.x + 35 * Q, y: player.y } }],
        carriedStars: [],
      }),
    ).state as AnyState;
    expect(notPicked.carriedStars).toEqual([]);
    expect(
      (
        tick(
          patch(round, {
            player: { centerQ: player },
            availableStars: [star],
            carriedStars: [1, 2, 3, 4, 5],
          }),
        ).state as AnyState
      ).carriedStars,
    ).toHaveLength(5);
  });

  it('deposits at the inclusive radius and wins at exactly twenty banked stars', () => {
    const round = createRound(1) as AnyState;
    const edge = patch(round, {
      player: { centerQ: { x: 1_200 * Q + 132 * Q, y: 800 * Q } },
      carriedStars: [1],
      bankedStars: 19,
    });
    const next = tick(edge).state as AnyState;
    expect(next.bankedStars).toBe(20);
    expect(next.carriedStars).toEqual([]);
    expect(next.phase).toBe('won');
    expect(next.lantern.energyUnits).toBe(MAX_ENERGY_UNITS);
  });
});

describe('mutation-gap respawn geometry contracts', () => {
  it('rejects each forbidden star neighborhood before accepting a safe candidate', () => {
    const base = createRound(1) as AnyState;
    const state = patch(base, {
      obstacles: [],
      availableStars: [{ id: 1, centerQ: { x: 2_100 * Q, y: 1_200 * Q } }],
      shadows: [{ id: 2, centerQ: { x: 1_800 * Q, y: 1_200 * Q }, graceTicks: 0 }],
      pendingStarRespawn: { dueTick: 10 },
      nextStarId: 28,
    });
    const candidates = [
      { centerQ: { x: 1_500 * Q, y: 800 * Q }, rngState: 1 },
      { centerQ: { x: 1_200 * Q + 259 * Q, y: 800 * Q }, rngState: 2 },
      { centerQ: { x: 1_800 * Q + 179 * Q, y: 1_200 * Q }, rngState: 3 },
      { centerQ: { x: 2_100 * Q + 100 * Q, y: 1_200 * Q }, rngState: 4 },
      { centerQ: { x: 1_600 * Q, y: 1_200 * Q }, rngState: 5 },
    ];
    let index = 0;
    const next = attemptStarRespawn(state, {
      currentTick: 10,
      nextCandidate: () => candidates[index++]!,
    });
    expect(index).toBe(5);
    expect(next.availableStars.at(-1)).toMatchObject({
      id: 28,
      centerQ: { x: 1_600 * Q, y: 1_200 * Q },
    });
    expect(next.pendingStarRespawn).toBeUndefined();
  });

  it('defers a missing candidate source safely and retries after the documented delay', () => {
    const base = createRound(1) as AnyState;
    const state = patch(base, {
      pendingStarRespawn: { dueTick: 10 },
      availableStars: [],
      nextStarId: 28,
    });
    const next = attemptStarRespawn(state, {
      currentTick: 10,
      nextCandidate: () => ({ centerQ: { x: 1_200 * Q, y: 800 * Q }, rngState: 99 }),
    });
    expect(next.pendingStarRespawn?.dueTick).toBe(70);
    expect(next.nextStarId).toBe(28);
  });

  it('enforces every inclusive respawn boundary and expanded obstacle boundary', () => {
    const makeState = (changes: AnyState = {}) =>
      patch(createRound(1), {
        availableStars: [],
        shadows: [],
        obstacles: [],
        player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
        pendingStarRespawn: { dueTick: 10 },
        nextStarId: 40,
        ...changes,
      });
    const attempt = (centerQ: AnyState, changes: AnyState = {}) =>
      attemptStarRespawn(makeState(changes), {
        currentTick: 10,
        nextCandidate: () => ({ centerQ, rngState: 7 }),
      });
    const accepted = (centerQ: AnyState, changes: AnyState = {}) => {
      const result = attempt(centerQ, changes);
      expect(result.availableStars).toHaveLength((changes.availableStars ?? []).length + 1);
      expect(result.pendingStarRespawn).toBeUndefined();
    };
    const rejected = (centerQ: AnyState, changes: AnyState = {}) => {
      const result = attempt(centerQ, changes);
      expect(result.availableStars).toEqual(changes.availableStars ?? []);
      expect(result.pendingStarRespawn?.dueTick).toBe(70);
    };

    rejected({ x: 1_500 * Q, y: 800 * Q });
    accepted({ x: 1_501 * Q, y: 1_300 * Q });
    rejected(
      { x: 1_800 * Q - 259 * Q, y: 800 * Q },
      {
        player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
      },
    );
    accepted(
      { x: 1_800 * Q - 260 * Q, y: 1_300 * Q },
      {
        player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
      },
    );
    rejected(
      { x: 1_800 * Q + 179 * Q, y: 1_200 * Q },
      {
        shadows: [{ id: 1, centerQ: { x: 1_800 * Q, y: 1_200 * Q }, graceTicks: 0 }],
      },
    );
    accepted(
      { x: 1_800 * Q + 180 * Q, y: 1_200 * Q },
      {
        shadows: [{ id: 1, centerQ: { x: 1_800 * Q, y: 1_200 * Q }, graceTicks: 0 }],
      },
    );
    rejected(
      { x: 2_200 * Q, y: 1_200 * Q },
      {
        availableStars: [{ id: 1, centerQ: { x: 2_100 * Q, y: 1_200 * Q } }],
      },
    );
    accepted(
      { x: 2_201 * Q, y: 1_200 * Q },
      {
        availableStars: [{ id: 1, centerQ: { x: 2_100 * Q, y: 1_200 * Q } }],
      },
    );
    rejected({ x: 33 * Q, y: 800 * Q });
    accepted({ x: 34 * Q, y: 800 * Q });
    rejected({ x: 2_367 * Q, y: 800 * Q });
    accepted({ x: 2_366 * Q, y: 800 * Q });
    rejected({ x: 1_200 * Q, y: 33 * Q });
    accepted({ x: 1_200 * Q, y: 34 * Q });
    rejected({ x: 1_200 * Q, y: 1_567 * Q });
    accepted({ x: 1_200 * Q, y: 1_566 * Q });

    const obstacle = { id: 0, x: 100, y: 100, width: 160, height: 128 };
    rejected({ x: 66 * Q, y: 200 * Q }, { obstacles: [obstacle] });
    accepted({ x: 65 * Q, y: 200 * Q }, { obstacles: [obstacle] });
    rejected({ x: 200 * Q, y: 66 * Q }, { obstacles: [obstacle] });
    accepted({ x: 200 * Q, y: 65 * Q }, { obstacles: [obstacle] });
  });
});

describe('mutation-gap reducer boundary contracts', () => {
  it('distinguishes fresh shadows from existing shadows during a spawn tick', () => {
    const round = createRound(1) as AnyState;
    const state = patch(round, {
      tick: 719,
      nextShadowId: 1,
      shadows: [{ id: 0, centerQ: { x: 1_800 * Q, y: 800 * Q }, graceTicks: 5 }],
    });
    const next = tick(state).state as AnyState;
    expect(next.shadows).toHaveLength(2);
    expect(next.shadows.find((shadow: AnyState) => shadow.id === 1).graceTicks).toBe(21);
    expect(next.shadows.find((shadow: AnyState) => shadow.id === 0).graceTicks).toBe(4);
  });

  it('uses banked-star shadow capacity and preserves the generated spawn ID and safety', () => {
    const round = createRound(1) as AnyState;
    const state = patch(round, {
      tick: 2_519,
      bankedStars: 10,
      nextShadowId: 40,
      shadows: [
        { id: 3, centerQ: { x: 2_000 * Q, y: 800 * Q }, graceTicks: 21 },
        { id: 4, centerQ: { x: 2_100 * Q, y: 800 * Q }, graceTicks: 21 },
        { id: 5, centerQ: { x: 2_200 * Q, y: 800 * Q }, graceTicks: 21 },
      ],
      player: { centerQ: { x: 1_000 * Q, y: 700 * Q } },
    });
    const next = tick(state).state as AnyState;
    const spawned = next.shadows.at(-1);
    expect(next.shadows).toHaveLength(4);
    expect(spawned.id).toBe(40);
    expect(next.nextShadowId).toBe(41);

    const player = state.player.centerQ;
    const lighthouse = { x: 1_200 * Q, y: 800 * Q };
    const distanceFromPlayer =
      Math.hypot(spawned.centerQ.x - player.x, spawned.centerQ.y - player.y) / Q;
    const distanceFromLighthouse =
      Math.hypot(spawned.centerQ.x - lighthouse.x, spawned.centerQ.y - lighthouse.y) / Q;
    expect(distanceFromPlayer).toBeGreaterThanOrEqual(520);
    expect(distanceFromPlayer).toBeLessThanOrEqual(760);
    expect(distanceFromLighthouse).toBeGreaterThanOrEqual(300);

    const camera = { left: 520, top: 380, right: 1_480, bottom: 1_020 };
    expect(
      spawned.centerQ.x / Q < camera.left - 80 ||
        spawned.centerQ.x / Q > camera.right + 80 ||
        spawned.centerQ.y / Q < camera.top - 80 ||
        spawned.centerQ.y / Q > camera.bottom + 80,
    ).toBe(true);
  });

  it('does not create a respawn before cadence or when total stars are already at capacity', () => {
    const round = createRound(1) as AnyState;
    const before = patch(round, { tick: 719, availableStars: [], carriedStars: [] });
    expect(tick(before).state.pendingStarRespawn).toBeUndefined();
    const full = patch(round, {
      tick: 719,
      availableStars: round.availableStars,
      carriedStars: [99],
      player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
    });
    const next = tick(full).state as AnyState;
    expect(next.availableStars).toHaveLength(28);
    expect(next.carriedStars).toEqual([99]);
    expect(next.pendingStarRespawn).toBeUndefined();
  });

  it('distinguishes safe-zone and collision boundaries and reports gameplay events', () => {
    const round = createRound(1) as AnyState;
    const safeEdge = patch(round, {
      player: { centerQ: { x: 1_200 * Q + 150 * Q, y: 800 * Q } },
      lantern: { energyUnits: 1_000 },
    });
    expect((tick(safeEdge).state as AnyState).lantern.energyUnits).toBe(1_400);
    const unsafe = patch(round, {
      player: { centerQ: { x: 1_200 * Q + 151 * Q, y: 800 * Q } },
      lantern: { energyUnits: 1_000 },
    });
    expect((tick(unsafe).state as AnyState).lantern.energyUnits).toBe(952);

    const player = { x: 1_800 * Q, y: 800 * Q };
    const star = { id: 99, centerQ: { x: player.x + 10 * Q, y: player.y } };
    const picked = tick(patch(round, { player: { centerQ: player }, availableStars: [star] }));
    expect(picked.events).toEqual([{ kind: 'pickup' }]);
    const deposited = tick(
      patch(round, {
        player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
        carriedStars: [99],
      }),
    );
    expect(deposited.events).toEqual([{ kind: 'deposit' }]);
  });

  it('uses diagonal radial correction output rather than only its x coordinate', () => {
    const round = createRound(1) as AnyState;
    const state = patch(round, {
      player: { centerQ: { x: 1_200 * Q, y: 800 * Q } },
      shadows: [{ id: 0, centerQ: { x: 1_320 * Q, y: 920 * Q }, graceTicks: 0 }],
    });
    const next = tick(state).state as AnyState;
    expect(next.shadows[0].centerQ).toEqual({ x: 86_474_660, y: 60_260_260 });
  });
});

describe('mutation-gap reducer terminal and cadence contracts', () => {
  it('returns terminal states unchanged without events', () => {
    const round = createRound(1) as AnyState;
    for (const phase of ['won', 'lost'] as const) {
      const state = patch(round, { phase, tick: 42 });
      const transition = tick(state, EAST);
      expect(transition.state).toBe(state);
      expect(transition.events).toEqual([]);
    }
  });

  it('distinguishes the exact shadow capacity at five banked stars', () => {
    const round = createRound(1) as AnyState;
    const state = patch(round, {
      tick: 2_519,
      bankedStars: 5,
      shadows: [
        { id: 0, centerQ: { x: 1_900 * Q, y: 800 * Q }, graceTicks: 21 },
        { id: 1, centerQ: { x: 2_000 * Q, y: 800 * Q }, graceTicks: 21 },
        { id: 2, centerQ: { x: 2_100 * Q, y: 800 * Q }, graceTicks: 21 },
      ],
    });
    expect((tick(state).state as AnyState).shadows).toHaveLength(3);
  });
});

describe('mutation-gap respawn upper obstacle boundaries', () => {
  it('distinguishes every upper clearance edge of an obstacle', () => {
    const obstacle = { id: 0, x: 100, y: 100, width: 160, height: 128 };
    const attempt = (centerQ: AnyState) =>
      attemptStarRespawn(
        patch(createRound(1), {
          availableStars: [],
          shadows: [],
          obstacles: [obstacle],
          pendingStarRespawn: { dueTick: 10 },
        }),
        { currentTick: 10, nextCandidate: () => ({ centerQ, rngState: 1 }) },
      );
    expect(attempt({ x: 294 * Q, y: 200 * Q }).pendingStarRespawn).toBeDefined();
    expect(attempt({ x: 295 * Q, y: 200 * Q }).availableStars).toHaveLength(1);
    expect(attempt({ x: 200 * Q, y: 262 * Q }).pendingStarRespawn).toBeDefined();
    expect(attempt({ x: 200 * Q, y: 263 * Q }).availableStars).toHaveLength(1);
    expect(attempt({ x: 250 * Q, y: 220 * Q }).pendingStarRespawn).toBeDefined();
    expect(attempt({ x: 220 * Q, y: 250 * Q }).pendingStarRespawn).toBeDefined();
  });
});
