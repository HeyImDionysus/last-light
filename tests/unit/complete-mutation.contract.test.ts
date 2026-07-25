import { describe, expect, it, vi } from 'vitest';
import { Q } from '../../src/game/constants';
import { createInputController } from '../../src/game/input';
import { advance } from '../../src/game/reducer';
import { createRng } from '../../src/game/rng';
import { attemptStarRespawn } from '../../src/game/spawn';
import { createRound } from '../../src/game/world';
import { createAudioController } from '../../src/platform/audio';
import { quantizeThumbVector } from '../../src/platform/input';
import { resolveReducedMotion } from '../../src/platform/preferences';
import { createFixedStepScheduler } from '../../src/platform/scheduler';
import { loadPreferences, savePreferences } from '../../src/platform/storage';
import { createVisibilityController } from '../../src/platform/visibility';

type AnyState = any;
const STILL = { x: 0, y: 0 } as const;

function tick(state: AnyState, movementQ: { x: number; y: number } = STILL) {
  return advance(state, { kind: 'tick', movementQ });
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

describe('keyboard source behavior', () => {
  it('keeps touch active when the newer keyboard state cancels to zero', () => {
    const input = createInputController();
    input.setTouch({ x: Q, y: 0 });
    input.keyDown('ArrowUp');
    input.keyDown('ArrowDown');
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
  });

  it('does not let unsupported or repeated keys steal source priority', () => {
    const input = createInputController();
    input.keyDown('ArrowLeft');
    input.setTouch({ x: Q, y: 0 });
    input.keyDown('unsupported');
    input.keyDown('ArrowLeft');
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
  });

  it('keeps a re-engaged touch newer after releasing the previous touch', () => {
    const input = createInputController();
    input.setTouch({ x: Q, y: 0 });
    input.keyDown('ArrowUp');
    input.releaseTouch();
    input.setTouch({ x: Q, y: 0 });
    expect(input.movementForTick()).toEqual({ x: Q, y: 0 });
  });

  it('re-evaluates the complete supported-code table and zero vector', async () => {
    vi.resetModules();
    const fresh = await import('../../src/game/input');
    for (const [code, expected] of [
      ['ArrowUp', { x: 0, y: -Q }],
      ['ArrowDown', { x: 0, y: Q }],
      ['ArrowLeft', { x: -Q, y: 0 }],
      ['ArrowRight', { x: Q, y: 0 }],
      ['KeyW', { x: 0, y: -Q }],
      ['KeyA', { x: -Q, y: 0 }],
      ['KeyS', { x: 0, y: Q }],
      ['KeyD', { x: Q, y: 0 }],
    ] as const) {
      const input = fresh.createInputController();
      expect(input.movementForTick()).toEqual({ x: 0, y: 0 });
      input.keyDown(code);
      expect(input.movementForTick()).toEqual(expected);
    }
  });
});

describe('RNG rejection behavior', () => {
  it('rejects a range whose width reaches the 32-bit domain', () => {
    expect(() => createRng(1).int(0, 2 ** 32)).toThrow('invalid rng range');
    expect(() => createRng(1).int(-(2 ** 31), 2 ** 31)).toThrow('invalid rng range');
  });

  it('rejects an output exactly at the unbiased limit before mapping it', () => {
    const rng = createRng(1_584_200_935);
    expect(rng.nextU32()).toBe(0xffff_ffff);
    const retried = createRng(1_584_200_935);
    expect(retried.int(0, 4)).toBe(3);
    expect(retried.state()).toBe(253_983);
  });

  it('rejects a large first output for a span with a wide rejection region', () => {
    const rng = createRng(8_192);
    expect(rng.int(0, 2_147_483_648)).toBe(13_148_770);
  });
});

describe('world and reducer behavior', () => {
  it('constructs exactly 24 seeded obstacles with stable IDs and safety spacing', async () => {
    vi.resetModules();
    const fresh = await import('../../src/game/world');
    const first = fresh.createRound(1);
    const replay = fresh.createRound(1);
    const different = fresh.createRound(2);

    expect(first.obstacles).toHaveLength(24);
    expect(first.obstacles.map(({ id }) => id)).toEqual([...Array(24).keys()]);
    expect(replay.obstacles).toEqual(first.obstacles);
    expect(different.obstacles).not.toEqual(first.obstacles);

    for (const obstacle of first.obstacles) {
      expect(obstacle.x).toBeGreaterThanOrEqual(80);
      expect(obstacle.y).toBeGreaterThanOrEqual(80);
      expect(obstacle.x + obstacle.width).toBeLessThanOrEqual(2_320);
      expect(obstacle.y + obstacle.height).toBeLessThanOrEqual(1_520);
    }
    for (let index = 0; index < first.obstacles.length; index += 1) {
      const obstacle = first.obstacles[index]!;
      for (const prior of first.obstacles.slice(0, index)) {
        expect(
          obstacle.x > prior.x + prior.width + 36 ||
            obstacle.x + obstacle.width + 36 < prior.x ||
            obstacle.y > prior.y + prior.height + 36 ||
            obstacle.y + obstacle.height + 36 < prior.y,
        ).toBe(true);
      }
      const lighthouseLeft = 1_200 - 150;
      const lighthouseRight = 1_200 + 150;
      const lighthouseTop = 800 - 150;
      const lighthouseBottom = 800 + 150;
      expect(
        obstacle.x + obstacle.width + 150 < lighthouseLeft ||
          obstacle.x - 150 > lighthouseRight ||
          obstacle.y + obstacle.height + 150 < lighthouseTop ||
          obstacle.y - 150 > lighthouseBottom,
      ).toBe(true);
    }
  });

  it('uses every deterministic fallback direction for a coincident shadow', () => {
    const origin = { x: 1_800 * Q, y: 800 * Q };
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [100_488, 0],
      [71_056, 71_056],
      [0, 100_488],
      [-71_056, 71_056],
      [-100_488, 0],
      [-71_056, -71_056],
      [0, -100_488],
      [71_056, -71_056],
    ];
    for (let id = 0; id < offsets.length; id += 1) {
      const state = {
        ...createRound(1),
        player: { centerQ: origin },
        lantern: { energyUnits: 0 },
        shadows: [{ id, centerQ: origin, graceTicks: 10 }],
      } as AnyState;
      const next = tick(state).state as AnyState;
      expect(next.shadows[0].centerQ).toEqual({
        x: origin.x + offsets[id]![0],
        y: origin.y + offsets[id]![1],
      });
    }
  });

  it('re-evaluates reducer helper functions after module reset', async () => {
    vi.resetModules();
    const [{ advance: freshAdvance }, { createRound: freshRound }] = await Promise.all([
      import('../../src/game/reducer'),
      import('../../src/game/world'),
    ]);
    const state = {
      ...freshRound(1),
      obstacles: [],
      player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
      lantern: { energyUnits: 1_000 },
      shadows: [{ id: 2, centerQ: { x: 2_000 * Q, y: 800 * Q }, graceTicks: 10 }],
    };
    const next = freshAdvance(state, { kind: 'tick', movementQ: STILL }).state;
    expect(next.tick).toBe(1);
    expect(next.lantern.energyUnits).toBe(952);
    expect(next.shadows[0]!.centerQ.x).toBe(2_000 * Q - 100_488);

    const safeState = { ...freshRound(2), lantern: { energyUnits: 1_000 } };
    expect(
      freshAdvance(safeState, { kind: 'tick', movementQ: STILL }).state.lantern.energyUnits,
    ).toBe(1_400);
  });

  it('distinguishes exact lighthouse and repel radial boundaries', () => {
    const round = createRound(1) as AnyState;
    const lighthouseTarget = { x: 1_200 * Q + 65 * Q, y: 800 * Q + 156 * Q };
    const lighthouseState = {
      ...round,
      player: { centerQ: { x: lighthouseTarget.x - 100 * Q, y: lighthouseTarget.y } },
      lantern: { energyUnits: 0 },
      shadows: [
        {
          id: 3,
          centerQ: { x: lighthouseTarget.x + 100_488, y: lighthouseTarget.y },
          graceTicks: 10,
        },
      ],
    };
    expect((tick(lighthouseState).state as AnyState).shadows[0].centerQ).toEqual(lighthouseTarget);

    const player = { x: 1_800 * Q, y: 800 * Q };
    const repelState = {
      ...round,
      player: { centerQ: player },
      lantern: { energyUnits: 1_000 },
      shadows: [
        {
          id: 4,
          centerQ: { x: player.x + 155 * Q + 100_488, y: player.y },
          graceTicks: 0,
        },
      ],
    };
    expect((tick(repelState).state as AnyState).shadows[0].graceTicks).toBe(21);
  });

  it('spawns only on cadence and only below the exact capacity', () => {
    const round = createRound(1) as AnyState;
    const beforeCadence = { ...round, tick: 718, shadows: [] };
    expect((tick(beforeCadence).state as AnyState).shadows).toEqual([]);
    const offCadence = { ...round, tick: 720, shadows: [] };
    expect((tick(offCadence).state as AnyState).shadows).toEqual([]);
    const atCapacity = {
      ...round,
      tick: 2_519,
      bankedStars: 0,
      shadows: [
        { id: 0, centerQ: { x: 2_000 * Q, y: 800 * Q }, graceTicks: 22 },
        { id: 1, centerQ: { x: 2_100 * Q, y: 800 * Q }, graceTicks: 22 },
      ],
    };
    expect((tick(atCapacity).state as AnyState).shadows).toHaveLength(2);
  });

  it('does not schedule a respawn when exactly 28 stars exist', () => {
    const round = createRound(1) as AnyState;
    const state = {
      ...round,
      tick: 719,
      player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
      availableStars: round.availableStars.slice(0, 27),
      carriedStars: [99],
    };
    const next = tick(state).state as AnyState;
    expect(next.availableStars).toHaveLength(27);
    expect(next.carriedStars).toEqual([99]);
    expect(next.pendingStarRespawn).toBeUndefined();
  });

  it('retains unpicked stars and reports exact terminal events', () => {
    const round = createRound(1) as AnyState;
    const player = { x: 1_800 * Q, y: 800 * Q };
    const pickup = tick({
      ...round,
      player: { centerQ: player },
      availableStars: [
        { id: 90, centerQ: player },
        { id: 91, centerQ: { x: 2_200 * Q, y: 1_200 * Q } },
      ],
    });
    expect(pickup.state.availableStars.map((star: AnyState) => star.id)).toEqual([91]);
    expect(pickup.events).toEqual([{ kind: 'pickup' }]);

    const won = tick({ ...round, carriedStars: [90], bankedStars: 19 });
    expect(won.events).toEqual([{ kind: 'deposit' }, { kind: 'won' }]);

    const lost = tick({
      ...round,
      player: { centerQ: player },
      lantern: { energyUnits: 0 },
      shadows: [{ id: 7, centerQ: player, graceTicks: 0 }],
    });
    expect(lost.events).toEqual([{ kind: 'lost' }]);
  });

  it('does not collide with an empty lantern when every shadow is far away', () => {
    const round = createRound(1) as AnyState;
    const next = tick({
      ...round,
      player: { centerQ: { x: 1_800 * Q, y: 800 * Q } },
      lantern: { energyUnits: 0 },
      shadows: [{ id: 1, centerQ: { x: 2_200 * Q, y: 1_200 * Q }, graceTicks: 0 }],
    }).state as AnyState;
    expect(next.phase).toBe('playing');
  });
});

describe('star respawn identity', () => {
  it('is a strict no-op without a due request', () => {
    const state = createRound(1);
    const nextCandidate = vi.fn(() => ({ centerQ: { x: 2_100 * Q, y: 1_200 * Q }, rngState: 2 }));
    expect(attemptStarRespawn(state, { currentTick: 0, nextCandidate })).toBe(state);
    expect(nextCandidate).not.toHaveBeenCalled();
  });

  it('does not consume a request before its due tick', () => {
    const state = { ...createRound(1), pendingStarRespawn: { dueTick: 11 } };
    const nextCandidate = vi.fn(() => ({ centerQ: { x: 1_600 * Q, y: 1_200 * Q }, rngState: 2 }));
    expect(attemptStarRespawn(state, { currentTick: 10, nextCandidate })).toBe(state);
    expect(nextCandidate).not.toHaveBeenCalled();
  });

  it('allocates the current ID and advances it exactly once', () => {
    const state = {
      ...createRound(1),
      obstacles: [],
      availableStars: [],
      shadows: [],
      pendingStarRespawn: { dueTick: 10 },
      nextStarId: 40,
    };
    const next = attemptStarRespawn(state, {
      currentTick: 10,
      nextCandidate: () => ({ centerQ: { x: 1_800 * Q, y: 1_300 * Q }, rngState: 7 }),
    });
    expect(next.availableStars).toEqual([{ id: 40, centerQ: { x: 1_800 * Q, y: 1_300 * Q } }]);
    expect(next.nextStarId).toBe(41);
  });
});

describe('audio failure containment', () => {
  it('activates once and schedules only while available, unmuted, and unpaused', () => {
    const close = vi.fn();
    const suspend = vi.fn();
    const createContext = vi.fn(() => ({ close, suspend }));
    const schedule = vi.fn();
    const audio = createAudioController({ createContext, schedule });
    audio.activate();
    audio.activate();
    audio.play('pickup');
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith('pickup');
    audio.setMuted(true);
    audio.play('muted');
    audio.setMuted(false);
    audio.setPaused(true);
    audio.play('paused');
    audio.setPaused(false);
    audio.play('resumed');
    expect(schedule.mock.calls.map(([sound]) => sound)).toEqual(['pickup', 'resumed']);
    expect(suspend).toHaveBeenCalledTimes(1);
  });

  it('keeps optional context, schedule, suspend, and close methods optional', () => {
    const scheduleBeforeGesture = vi.fn();
    const beforeActivation = createAudioController({
      createContext: () => ({}),
      schedule: scheduleBeforeGesture,
    });
    beforeActivation.play('before-gesture');
    expect(scheduleBeforeGesture).not.toHaveBeenCalled();
    beforeActivation.setPaused(true);
    expect(beforeActivation.isAvailable()).toBe(true);
    beforeActivation.activate();
    beforeActivation.setPaused(false);
    beforeActivation.play('pickup');
    expect(beforeActivation.isAvailable()).toBe(true);
    beforeActivation.setPaused(true);
    expect(beforeActivation.isAvailable()).toBe(true);

    const noSchedule = createAudioController({ createContext: () => ({}) });
    noSchedule.activate();
    noSchedule.play('optional-schedule');
    expect(noSchedule.isAvailable()).toBe(true);

    const failedCreation = createAudioController({
      createContext: () => {
        throw new Error('blocked');
      },
    });
    failedCreation.activate();
    expect(failedCreation.isAvailable()).toBe(false);
  });

  it('disables once when scheduling fails even when cleanup also fails', () => {
    const close = vi.fn(() => {
      throw new Error('close failed');
    });
    const suspend = vi.fn(() => {
      throw new Error('suspend failed');
    });
    const audio = createAudioController({
      createContext: () => ({ close, suspend }),
      schedule: () => {
        throw new Error('schedule failed');
      },
    });
    audio.activate();
    audio.play('loss');
    audio.setPaused(true);
    expect(audio.isAvailable()).toBe(false);
    expect(audio.notices()).toEqual(['audio-unavailable']);
    expect(close).toHaveBeenCalledTimes(2);
    expect(suspend).toHaveBeenCalledTimes(1);
  });
});

describe('platform boundaries', () => {
  it('keeps exact-radius thumb quantization stable', () => {
    expect(quantizeThumbVector(44 * 256, 0)).toEqual({ x: Q, y: 0 });
    expect(quantizeThumbVector(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('uses system reduced motion when available and safely defaults when absent', () => {
    expect(resolveReducedMotion('system', () => true)).toBe(true);
    expect(resolveReducedMotion('system')).toBe(false);
  });

  it('preserves partial scheduler accumulation and the inclusive epsilon boundary', () => {
    const onTick = vi.fn();
    const scheduler = createFixedStepScheduler({ onTick });
    scheduler.frame(1 / 120);
    expect(onTick).not.toHaveBeenCalled();
    scheduler.frame(1 / 120);
    expect(onTick).toHaveBeenCalledTimes(1);

    const epsilonTick = vi.fn();
    createFixedStepScheduler({ onTick: epsilonTick }).frame(1 / 60 - 1e-12);
    expect(epsilonTick).toHaveBeenCalledTimes(1);
  });

  it('starts visible, pauses only on hidden, and tolerates absent audio suspension', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const lifecycle = createVisibilityController({ onPause, onResume });
    expect(lifecycle.requestResume()).toBe(true);
    lifecycle.changedTo('visible');
    expect(onPause).not.toHaveBeenCalled();
    lifecycle.changedTo('hidden');
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(() => lifecycle.pageHidden()).not.toThrow();
  });
});

describe('storage schema constants and rejection', () => {
  it('re-evaluates defaults and the versioned storage key', async () => {
    vi.resetModules();
    const fresh = await import('../../src/platform/storage');
    expect(fresh.defaults).toEqual({
      version: 1,
      bestScore: 0,
      muted: false,
      highContrast: false,
      reducedMotion: 'system',
    });
    const target = storage();
    expect(fresh.savePreferences(target, { ...fresh.defaults, reducedMotion: 'on' })).toBe(true);
    expect(target.setItem).toHaveBeenCalledWith(
      'last-light:preferences:v1',
      JSON.stringify({ ...fresh.defaults, reducedMotion: 'on' }),
    );
  });

  it('accepts every reduced-motion enum and rejects primitives without writes', () => {
    for (const reducedMotion of ['system', 'on', 'off'] as const) {
      const value = { version: 1, bestScore: 0, muted: false, highContrast: false, reducedMotion };
      expect(loadPreferences(storage({ getItem: vi.fn(() => JSON.stringify(value)) }))).toEqual({
        ok: true,
        value,
      });
    }
    for (const invalid of [null, undefined, 0, 1, 'value', true, () => undefined]) {
      const target = storage();
      expect(savePreferences(target, invalid as never)).toBe(false);
      expect(target.setItem).not.toHaveBeenCalled();
    }

    const complete = {
      version: 1,
      bestScore: 0,
      muted: false,
      highContrast: false,
      reducedMotion: 'system' as const,
    };
    const nullPrototype = Object.assign(Object.create(null), complete);
    const array = Object.assign([], complete);
    class PreferenceRecord {
      version = 1;
      bestScore = 0;
      muted = false;
      highContrast = false;
      reducedMotion = 'system' as const;
    }
    for (const invalid of [nullPrototype, array, new PreferenceRecord()]) {
      const target = storage();
      expect(savePreferences(target, invalid as never)).toBe(false);
      expect(target.setItem).not.toHaveBeenCalled();
    }
  });
});
