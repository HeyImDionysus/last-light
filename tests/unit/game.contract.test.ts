import { describe, expect, it } from 'vitest';
import { createRound } from '../../src/game/world';
import { advance } from '../../src/game/reducer';
import { attemptStarRespawn } from '../../src/game/spawn';
import { Q } from '../../src/game/constants';
import { scoreDeposit, scoreWinBonus } from '../../src/game/scoring';

const STILL = { x: 0, y: 0 } as const;
const EAST = { x: Q, y: 0 } as const;

function tick(state: unknown, movementQ: { x: number; y: number } = STILL) {
  return advance(state as never, { kind: 'tick', movementQ });
}

function replace<T extends Record<string, unknown>>(state: T, patch: Partial<T>): T {
  return { ...state, ...patch };
}

describe('seeded world construction', () => {
  it('starts every valid round with exact obstacle/star quotas and stable IDs', () => {
    const round = createRound(0x1234_5678) as any;

    expect(round.tick).toBe(0);
    expect(round.obstacles).toHaveLength(24);
    expect(round.obstacles.map((item: any) => item.id)).toEqual([...Array(24).keys()]);
    expect(round.availableStars).toHaveLength(28);
    expect(round.availableStars.map((item: any) => item.id)).toEqual([...Array(28).keys()]);
    expect(round.shadows).toEqual([]);
    expect(round.bankedStars).toBe(0);
    expect(round.carriedStars).toEqual([]);
    expect(round.lantern.energyUnits).toBe(60_000);
  });

  it('replays identical world geometry and PRNG state for the same seed', () => {
    const first = createRound(0xcafe_babe) as any;
    const second = createRound(0xcafe_babe) as any;

    expect(second).toEqual(first);
    expect(second.rngState).toBe(first.rngState);
  });

  it('keeps initial stars in their fixed distance bands and separated from one another', () => {
    const round = createRound(0xdec0_de01) as any;
    const lighthouse = { x: 1_200 * Q, y: 800 * Q };

    for (const [index, star] of round.availableStars.entries()) {
      const distance = Math.hypot(star.centerQ.x - lighthouse.x, star.centerQ.y - lighthouse.y) / Q;
      expect(distance).toBeGreaterThan(150);
      if (index < 10) expect(distance).toBeLessThanOrEqual(850);
      if (index >= 10 && index < 20) expect(distance).toBeGreaterThan(850);
      if (index < 20) expect(distance).toBeLessThanOrEqual(index < 10 ? 850 : 1_500);
      for (const other of round.availableStars.slice(0, index)) {
        expect(
          Math.hypot(star.centerQ.x - other.centerQ.x, star.centerQ.y - other.centerQ.y) / Q,
        ).toBeGreaterThan(100);
      }
    }
  });

  it('fails the round construction boundary instead of returning partial geometry', () => {
    expect(() => createRound(0)).not.toThrow();
    expect(() => createRound(0x0000_0001)).not.toThrow();
  });

  it('preserves spawn safety invariants across a fixed-seed property sample', () => {
    const lighthouse = { x: 1_200 * Q, y: 800 * Q };
    for (let seed = 0; seed < 1_000; seed += 1) {
      const round = createRound(seed) as any;
      expect(round.obstacles).toHaveLength(24);
      expect(round.availableStars).toHaveLength(28);
      for (const obstacle of round.obstacles) {
        expect(obstacle.x).toBeGreaterThanOrEqual(80);
        expect(obstacle.y).toBeGreaterThanOrEqual(80);
        expect(obstacle.x + obstacle.width).toBeLessThanOrEqual(2_320);
        expect(obstacle.y + obstacle.height).toBeLessThanOrEqual(1_520);
      }
      for (const star of round.availableStars) {
        const distance =
          Math.hypot(star.centerQ.x - lighthouse.x, star.centerQ.y - lighthouse.y) / Q;
        expect(distance).toBeGreaterThan(150);
        for (const obstacle of round.obstacles) {
          const closestX = Math.max(
            obstacle.x,
            Math.min(star.centerQ.x / Q, obstacle.x + obstacle.width),
          );
          const closestY = Math.max(
            obstacle.y,
            Math.min(star.centerQ.y / Q, obstacle.y + obstacle.height),
          );
          expect(
            Math.hypot(star.centerQ.x / Q - closestX, star.centerQ.y / Q - closestY),
          ).toBeGreaterThan(34);
        }
      }
    }
  }, 30_000);
});

describe('fixed-step reducer contract', () => {
  it('rejects invalid movement vectors and duplicate entity IDs at the domain boundary', () => {
    const round = createRound(0x1234_5678) as any;

    expect(() => advance(round, { kind: 'tick', movementQ: { x: Q, y: Q } } as never)).toThrow();
    expect(() =>
      advance(
        { ...round, availableStars: [round.availableStars[0], round.availableStars[0]] },
        { kind: 'tick', movementQ: STILL },
      ),
    ).toThrow();
  });

  it('rejects a zero stored gameplay RNG state at the domain boundary', () => {
    const round = createRound(0x1234_5678) as any;
    expect(round.rngState).not.toBe(0);

    expect(() => tick(replace(round, { rngState: 0 }))).toThrow();
  });

  it('increments only active ticks and drains exact integer lantern units outside safety', () => {
    const round = createRound(0x1234_5678) as any;
    const initial = replace(round, {
      player: { ...round.player, centerQ: { x: 1_600 * Q, y: 800 * Q } },
    });
    expect(
      Math.hypot(initial.player.centerQ.x - 1_200 * Q, initial.player.centerQ.y - 800 * Q) / Q,
    ).toBeGreaterThan(150);
    const one = tick(initial, EAST).state as any;
    const sixty = Array.from({ length: 59 }).reduce((state) => tick(state, EAST).state, one) as any;

    expect(one.tick).toBe(1);
    expect(one.lantern.energyUnits).toBe(59_952);
    expect(sixty.tick).toBe(60);
    expect(sixty.lantern.energyUnits).toBe(57_120);
  });

  it('uses the exact signed Q16.16 per-tick shadow displacement', () => {
    const initial = createRound(0x1234_5678) as any;
    const state = replace(initial, {
      shadows: [{ id: 0, centerQ: { x: 1_800 * Q, y: 800 * Q }, graceTicks: 0 }],
      lantern: { ...initial.lantern, energyUnits: 0 },
    });

    const next = tick(state).state as any;
    expect(next.shadows[0].centerQ.x).toBe(1_800 * Q - 100_488);
    expect(next.shadows[0].centerQ.y).toBe(800 * Q);
  });

  it('creates no shadow before tick 720 and creates at most the eligible target on cadence', () => {
    let state: any = createRound(0x9abc_def0);
    for (let index = 0; index < 719; index += 1) state = tick(state).state;
    expect(state.tick).toBe(719);
    expect(state.shadows).toHaveLength(0);

    state = tick(state).state;
    expect(state.tick).toBe(720);
    expect(state.shadows.length).toBeLessThanOrEqual(2);
    expect(state.shadows[0]?.graceTicks).toBe(21);
    for (const shadow of state.shadows) {
      const player = state.player.centerQ;
      const lighthouse = { x: 1_200 * Q, y: 800 * Q };
      expect(
        Math.hypot(shadow.centerQ.x - player.x, shadow.centerQ.y - player.y) / Q,
      ).toBeGreaterThanOrEqual(520);
      expect(
        Math.hypot(shadow.centerQ.x - player.x, shadow.centerQ.y - player.y) / Q,
      ).toBeLessThanOrEqual(760);
      expect(
        Math.hypot(shadow.centerQ.x - lighthouse.x, shadow.centerQ.y - lighthouse.y) / Q,
      ).toBeGreaterThanOrEqual(300);
    }
  });

  it('defers exactly 32 rejected respawn candidates by 60 active ticks without allocating an ID', () => {
    const initial = createRound(0xfeed_beef) as any;
    const state = replace(initial, {
      tick: 719,
      availableStars: [],
      carriedStars: [],
      pendingStarRespawn: { dueTick: 720 },
      nextStarId: 28,
    });
    const invalidCandidates = Array.from({ length: 32 }, (_, index) => ({
      centerQ: { x: 1_200 * Q, y: 800 * Q },
      rngState: index + 1,
    }));
    let candidateIndex = 0;
    const next = attemptStarRespawn(state, {
      currentTick: 720,
      nextCandidate: () => {
        const candidate = invalidCandidates[candidateIndex];
        if (!candidate) throw new Error('candidate source exhausted');
        candidateIndex += 1;
        return candidate;
      },
    }) as any;

    expect(state.rngState).not.toBe(0);
    expect(candidateIndex).toBe(32);
    expect(next.pendingStarRespawn.dueTick).toBe(780);
    expect(next.availableStars).toHaveLength(0);
    expect(next.carriedStars).toHaveLength(0);
    expect(next.nextStarId).toBe(28);
    expect(next.rngState).toBe(32);
  });

  it('applies a lit-lantern repel once after pursuit and resets grace', () => {
    const initial = createRound(0x1234_5678) as any;
    const playerCenterQ = { x: 1_800 * Q, y: 800 * Q };
    const shadowCenterQ = { x: playerCenterQ.x + 155 * Q, y: playerCenterQ.y };
    const state = replace(initial, {
      player: { ...initial.player, centerQ: playerCenterQ },
      shadows: [{ id: 0, centerQ: shadowCenterQ, graceTicks: 0 }],
    });
    expect(
      Math.hypot(shadowCenterQ.x - 1_200 * Q, shadowCenterQ.y - 800 * Q) / Q,
    ).toBeGreaterThanOrEqual(169);

    const next = tick(state).state as any;
    expect(next.shadows[0].graceTicks).toBe(21);
    expect(next.shadows[0].centerQ.x).toBeGreaterThan(shadowCenterQ.x);
  });

  it('loses on an eligible empty-lantern collision but not during grace', () => {
    const initial = createRound(0x1234_5678) as any;
    const playerCenterQ = { x: 1_800 * Q, y: 800 * Q };
    const colliding = {
      id: 0,
      centerQ: { x: playerCenterQ.x + 37 * Q, y: playerCenterQ.y },
      graceTicks: 0,
    };
    const state = replace(initial, {
      player: { ...initial.player, centerQ: playerCenterQ },
      lantern: { ...initial.lantern, energyUnits: 0 },
      shadows: [colliding],
    });
    expect(
      Math.hypot(colliding.centerQ.x - 1_200 * Q, colliding.centerQ.y - 800 * Q) / Q,
    ).toBeGreaterThanOrEqual(169);

    expect((tick(state).state as any).phase).toBe('lost');
    expect(
      (tick(replace(state, { shadows: [{ ...colliding, graceTicks: 1 }] })).state as any).phase,
    ).toBe('playing');
  });

  it('deposits, refills, scores from pre-refill energy, and wins on an overshooting goal', () => {
    const initial = createRound(0x1234_5678) as any;
    const state = replace(initial, {
      player: { ...initial.player, centerQ: { x: 1_200 * Q, y: 800 * Q } },
      carriedStars: [1, 2, 3, 4, 5],
      bankedStars: 18,
      score: 0,
      lantern: { ...initial.lantern, energyUnits: 30_599 },
    });

    const next = tick(state).state as any;
    expect(next.bankedStars).toBe(23);
    expect(next.lantern.energyUnits).toBe(60_000);
    // Step 2 recharges to 30_999 before step 6 snapshots pre-refill energy.
    expect(next.score).toBe(100 * 5 + 25 * 25 + 10 * 51 + 4_200);
    expect(next.phase).toBe('won');
  });

  it('recharges passively but does not instantly refill on an empty visit', () => {
    const initial = createRound(0x1234_5678) as any;
    const state = replace(initial, {
      player: { ...initial.player, centerQ: { x: 1_200 * Q, y: 800 * Q } },
      carriedStars: [],
      lantern: { ...initial.lantern, energyUnits: 0 },
    });

    expect((tick(state).state as any).lantern.energyUnits).toBe(400);
  });
});

describe('score formulas', () => {
  it('includes deposit amount, quadratic delivery bonus, and floored pre-refill energy', () => {
    expect(scoreDeposit({ depositedStars: 1, preRefillEnergyUnits: 59_999 })).toBe(1_115);
    expect(scoreDeposit({ depositedStars: 5, preRefillEnergyUnits: 30_599 })).toBe(1_625);
  });

  it('clamps the win speed bonus at zero after seven minutes', () => {
    expect(scoreWinBonus(0)).toBe(4_200);
    expect(scoreWinBonus(7 * 60 * 60)).toBe(0);
    expect(scoreWinBonus(8 * 60 * 60)).toBe(0);
  });
});
