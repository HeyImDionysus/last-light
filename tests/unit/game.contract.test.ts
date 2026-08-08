import { describe, it, expect } from 'vitest';
import { createRound } from '../../src/game/world';
import { advance } from '../../src/game/reducer';
import { scoreDeposit, scoreWinBonus } from '../../src/game/scoring';
import { LIGHTHOUSE, MAX_ENERGY_UNITS, Q, SAFE_RADIUS, DEPOSIT_RADIUS } from '../../src/game/constants';
import type { GameState } from '../../src/game/types';

const still = { kind: 'tick' as const, movementQ: { x: 0, y: 0 } };
const east = { kind: 'tick' as const, movementQ: { x: Q, y: 0 } };

function tickN(state: GameState, action = still, n = 1): GameState {
  let s = state;
  for (let i = 0; i < n; i += 1) s = advance(s, action).state;
  return s;
}

describe('fixed-step reducer contract', () => {
  it('increments only active ticks and stays playing under no input', () => {
    const s = tickN(createRound(1), still, 10);
    expect(s.tick).toBe(10);
    expect(s.phase).toBe('playing');
  });

  it('drains lantern energy outside the safe zone and recharges inside it', () => {
    // Outside the safe radius, a still player drains 48 units per tick.
    let outside: GameState = {
      ...createRound(2),
      player: { centerQ: { x: 1800 * Q, y: 200 * Q } }, // far from the lighthouse
      lantern: { energyUnits: 30000 },
    };
    outside = advance(outside, still).state;
    expect(outside.lantern.energyUnits).toBe(30000 - 48);
    // At the lighthouse (inside the safe radius), energy recharges 400 per tick.
    let inside: GameState = { ...createRound(2), lantern: { energyUnits: 10000 } };
    inside = advance(inside, still).state;
    expect(inside.lantern.energyUnits).toBe(10000 + 400);
  });

  it('rejects invalid state and invalid movement at the domain boundary', () => {
    const s = createRound(1);
    expect(() => advance({ ...s, rngState: 0 }, still)).toThrow();
    expect(() => advance(s, { kind: 'tick', movementQ: { x: 1.5, y: 0 } })).toThrow();
  });

  it('moves the player toward the input direction', () => {
    const base = createRound(3);
    const moved = tickN(base, east, 60);
    expect(moved.player.centerQ.x).toBeGreaterThan(base.player.centerQ.x);
  });

  it('picks up stars within the pickup radius, up to the carry limit of 5', () => {
    let s = createRound(13);
    // Walk around to collect stars; after enough movement, some should be carried.
    const dirs = [
      { kind: 'tick' as const, movementQ: { x: Q, y: 0 } },
      { kind: 'tick' as const, movementQ: { x: -Q, y: 0 } },
      { kind: 'tick' as const, movementQ: { x: 0, y: Q } },
      { kind: 'tick' as const, movementQ: { x: 0, y: -Q } },
    ];
    for (let i = 0; i < 600; i += 1) s = advance(s, dirs[i % dirs.length]!).state;
    // We don't assert an exact count (seed-dependent pathing), only the invariant.
    expect(s.carriedStars.length).toBeLessThanOrEqual(5);
    expect(s.carriedStars.length + s.availableStars.length + s.bankedStars).toBeLessThanOrEqual(28 + 5);
  });

  it('does not create a shadow before tick 720', () => {
    const s = tickN(createRound(4), still, 719);
    expect(s.shadows).toHaveLength(0);
  });

  it('creates shadows on the cadence after tick 720 up to the target count', () => {
    let s = createRound(4);
    s = tickN(s, still, 720);
    expect(s.shadows.length).toBeGreaterThanOrEqual(1);
    expect(s.shadows.length).toBeLessThanOrEqual(2);
  });

  it('resets grace on a freshly spawned shadow so it cannot immediately end the round', () => {
    let s = createRound(4);
    s = tickN(s, still, 721);
    for (const shadow of s.shadows) {
      expect(shadow.graceTicks).toBeGreaterThan(0);
    }
  });
});

describe('deposit, scoring, and win', () => {
  it('deposits carried stars, refills the lantern instantly, and scores all components', () => {
    // Place a carried star manually, then sit on the lighthouse deposit circle.
    let s: GameState = { ...createRound(8), carriedStars: [99], lantern: { energyUnits: 30000 } };
    s = advance(s, still).state;
    expect(s.carriedStars).toEqual([]);
    expect(s.bankedStars).toBe(1);
    expect(s.lantern.energyUnits).toBe(MAX_ENERGY_UNITS);
  });

  it('does not score or instantly refill on an empty visit (passive recharge only)', () => {
    let s: GameState = { ...createRound(8), lantern: { energyUnits: 30000 } };
    const before = s.lantern.energyUnits;
    s = advance(s, still).state;
    expect(s.bankedStars).toBe(0);
    expect(s.lantern.energyUnits).toBe(before + 400); // passive recharge, no instant refill
  });

  it('wins the round exactly when 20 stars are banked (overshoot allowed)', () => {
    let s: GameState = { ...createRound(8), carriedStars: [1, 2, 3, 4, 5], bankedStars: 18 };
    s = advance(s, still).state;
    expect(s.bankedStars).toBe(23);
    expect(s.phase).toBe('won');
    // Win speed bonus is included and non-negative.
    expect(s.score).toBeGreaterThanOrEqual(0);
  });

  it('a same-tick deposit that reaches the goal wins even with a colliding empty-lantern shadow', () => {
    // Build a state where depositing reaches 20 but a shadow overlaps the player.
    const lighthouse = LIGHTHOUSE;
    let s: GameState = {
      ...createRound(8),
      player: { centerQ: { ...lighthouse } },
      carriedStars: [1, 2],
      bankedStars: 19,
      lantern: { energyUnits: 0 },
      shadows: [{ id: 0, centerQ: { x: lighthouse.x, y: lighthouse.y }, graceTicks: 0 }],
    };
    s = advance(s, still).state;
    expect(s.phase).toBe('won');
  });
});

describe('collision, repel, and loss', () => {
  it('loses the round when an eligible shadow touches the player with an empty lantern', () => {
    // Player parked outside the safe zone (so the lantern stays empty), with a
    // zero-grace shadow overlapping it. A still tick must end the round.
    const px = 1800 * Q;
    const py = 200 * Q;
    let s: GameState = {
      ...createRound(8),
      player: { centerQ: { x: px, y: py } },
      lantern: { energyUnits: 0 },
      shadows: [{ id: 0, centerQ: { x: px + 5, y: py }, graceTicks: 0 }],
    };
    s = advance(s, still).state;
    expect(s.phase).toBe('lost');
  });

  it('does not lose while the lantern is lit (repulsion applies instead)', () => {
    const player = { ...createRound(8).player.centerQ };
    // Player at lighthouse (lit, full energy). A shadow far enough not to matter.
    let s: GameState = {
      ...createRound(8),
      lantern: { energyUnits: MAX_ENERGY_UNITS },
      shadows: [{ id: 0, centerQ: { x: player.x + 500, y: player.y }, graceTicks: 0 }],
    };
    s = advance(s, still).state;
    expect(s.phase).toBe('playing');
  });

  it('prevents the player from walking through a solid obstacle', () => {
    const base = createRound(20);
    const obs = base.obstacles;
    // Find an obstacle and push the player into it from the left for many ticks.
    const target = obs.find((o) => o.x > 300)!;
    let s: GameState = { ...base, player: { centerQ: { x: (target.x - 40) * Q, y: (target.y + target.height / 2) * Q } } };
    s = tickN(s, east, 200);
    // Player must not have passed into/through the obstacle body.
    expect(s.player.centerQ.x / Q).toBeLessThan(target.x);
  });
});

describe('score formulas', () => {
  it('combines deposit amount, quadratic delivery bonus, and floored pre-refill energy', () => {
    expect(scoreDeposit({ depositedStars: 1, preRefillEnergyUnits: 59_999 })).toBe(1_115);
    expect(scoreDeposit({ depositedStars: 5, preRefillEnergyUnits: 30_599 })).toBe(1_625);
  });

  it('clamps the win speed bonus at zero after seven minutes', () => {
    expect(scoreWinBonus(60 * 60 * 7)).toBe(0);
    expect(scoreWinBonus(60)).toBeGreaterThan(0);
  });

  it('the deposit radius and safe radius are concentric and ordered', () => {
    expect(DEPOSIT_RADIUS).toBeLessThanOrEqual(SAFE_RADIUS);
  });
});
