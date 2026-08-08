// Pure fixed-tick transition function. Each call advances the round by exactly
// one active tick following the spec's ordered stages:
//   1. player movement (with swept-circle obstacle collision + sliding)
//   2. lantern drain/recharge
//   3. runtime spawn stage (star respawn, then shadow spawn)
//   4. shadow pursuit + lantern repulsion (with obstacle collision)
//   5. star pickup
//   6. lighthouse deposit + instant refill
//   7. win check
//   8. shadow collision / loss check
//
// All geometry is in pixel space (float). Q16.16 conversion happens at the
// boundaries so GameState stays in the same Q units the rest of the code expects.

import { DEPOSIT_RADIUS, LIGHTHOUSE, MAX_ENERGY_UNITS, PLAYER_RADIUS, Q, SAFE_RADIUS, SHADOW_RADIUS } from './constants';
import { distance, resolveMovement, clamp, type Point } from './geometry';
import { scoreDeposit, scoreWinBonus } from './scoring';
import { attemptStarRespawn } from './spawn';
import { createRng } from './rng';
import type { GameEvent, GameState, Shadow, Transition, VectorQ } from './types';

const LIGHTHOUSE_PX: Point = { x: LIGHTHOUSE.x / Q, y: LIGHTHOUSE.y / Q };

function toPx(q: VectorQ): Point {
  return { x: q.x / Q, y: q.y / Q };
}
function toQ(p: Point): VectorQ {
  return { x: Math.round(p.x * Q), y: Math.round(p.y * Q) };
}

function unitToward(from: Point, to: Point, fallbackId: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    const table: Point[] = [
      { x: 1, y: 0 }, { x: 0.7071, y: 0.7071 }, { x: 0, y: 1 }, { x: -0.7071, y: 0.7071 },
      { x: -1, y: 0 }, { x: -0.7071, y: -0.7071 }, { x: 0, y: -1 }, { x: 0.7071, y: -0.7071 },
    ];
    return table[fallbackId % 8]!;
  }
  return { x: dx / len, y: dy / len };
}

function validate(state: GameState, movementQ: VectorQ): void {
  if (!state.rngState || !Number.isSafeInteger(state.rngState)) throw new Error('invalid game state');
  const len = Math.hypot(movementQ.x, movementQ.y);
  if (!Number.isSafeInteger(movementQ.x) || !Number.isSafeInteger(movementQ.y) || len > Q + 1) {
    throw new Error('invalid movement');
  }
  const energy = state.lantern.energyUnits;
  if (!Number.isSafeInteger(energy) || energy < 0 || energy > MAX_ENERGY_UNITS) throw new Error('invalid lantern');
  for (const list of [state.obstacles, state.availableStars, state.shadows]) {
    const ids = list.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error('duplicate entity id');
  }
}

function movePlayer(state: GameState, movementQ: VectorQ): Point {
  const pos = toPx(state.player.centerQ);
  const len = Math.hypot(movementQ.x, movementQ.y);
  if (len === 0) return pos;
  const speed = 230 / 60; // px per tick
  const delta = { x: (movementQ.x / len) * speed, y: (movementQ.y / len) * speed };
  return resolveMovement(pos, delta, PLAYER_RADIUS, state.obstacles);
}

function moveShadow(shadow: Shadow, player: Point, banked: number, lit: boolean, obstacles: GameState['obstacles']): Shadow {
  const speed = (92 + 4 * Math.floor(banked / 5)) / 60;
  const from = toPx(shadow.centerQ);

  // Pursuit toward the player, resolved against obstacles.
  const pursuitDir = unitToward(from, player, shadow.id);
  let center = resolveMovement(from, { x: pursuitDir.x * speed, y: pursuitDir.y * speed }, SHADOW_RADIUS, obstacles);

  // Lighthouse exclusion: shadows cannot enter the safe radius.
  if (distance(center, LIGHTHOUSE_PX) < 169) {
    const radial = unitToward(LIGHTHOUSE_PX, center, shadow.id);
    const projected = { x: LIGHTHOUSE_PX.x + radial.x * 169, y: LIGHTHOUSE_PX.y + radial.y * 169 };
    center = resolveMovement(center, { x: projected.x - center.x, y: projected.y - center.y }, SHADOW_RADIUS, obstacles);
    if (distance(center, LIGHTHOUSE_PX) < 169) center = from; // cannot place legally; hold position
  }

  let graceTicks = shadow.graceTicks;
  // Lantern repulsion: one push outward when lit and within range.
  if (lit && distance(center, player) <= 155) {
    const away = unitToward(player, center, shadow.id);
    const repelSpeed = 300 / 60;
    center = resolveMovement(center, { x: away.x * repelSpeed, y: away.y * repelSpeed }, SHADOW_RADIUS, obstacles);
    graceTicks = 21;
  }
  return { ...shadow, centerQ: toQ(center), graceTicks };
}

/** Shadow target count grows as the player banks more stars (max 5). */
function targetShadowCount(banked: number): number {
  return Math.min(5, 2 + Math.floor(banked / 5));
}

/** Fair, RNG-driven shadow spawn: off-screen by the camera, 520-760 px from the
 * player, at least 300 px from the lighthouse, and not inside an obstacle. */
function spawnShadow(state: GameState, tick: number): GameState {
  const isCadence = tick >= 720 && (tick - 720) % 1800 === 0;
  if (!isCadence || state.shadows.length >= targetShadowCount(state.bankedStars)) return state;

  const rng = createRng(state.rngState);
  const player = toPx(state.player.centerQ);
  const camLeft = clamp(player.x - 480, 0, 1440);
  const camTop = clamp(player.y - 320, 0, 960);

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const angle = (rng.int(0, 359) * Math.PI) / 180;
    const dist = rng.int(520, 760);
    const candidate: Point = { x: player.x + Math.cos(angle) * dist, y: player.y + Math.sin(angle) * dist };

    const offScreen =
      candidate.x < camLeft - 80 || candidate.x > camLeft + 960 + 80 ||
      candidate.y < camTop - 80 || candidate.y > camTop + 640 + 80;
    const farFromLighthouse = distance(candidate, LIGHTHOUSE_PX) >= 300;
    // A clear 50 px disk around the spawn (use radius 31 as a generous passable check).
    const clearOfObstacles = !state.obstacles.some((o) =>
      candidate.x > o.x - 31 && candidate.x < o.x + o.width + 31 &&
      candidate.y > o.y - 31 && candidate.y < o.y + o.height + 31,
    );
    const inBounds = candidate.x >= SHADOW_RADIUS && candidate.x <= 2400 - SHADOW_RADIUS &&
      candidate.y >= SHADOW_RADIUS && candidate.y <= 1600 - SHADOW_RADIUS;

    if (offScreen && farFromLighthouse && clearOfObstacles && inBounds) {
      return {
        ...state,
        rngState: rng.state(),
        shadows: [...state.shadows, { id: state.nextShadowId, centerQ: toQ(candidate), graceTicks: 21 }],
        nextShadowId: state.nextShadowId + 1,
      };
    }
  }
  // All attempts rejected: consume the entropy, no spawn this cadence.
  return { ...state, rngState: rng.state() };
}

export function advance(state: Readonly<GameState>, action: { kind: 'tick'; movementQ: VectorQ }): Transition {
  validate(state, action.movementQ);
  if (state.phase !== 'playing') return { state, events: [] };

  const events: GameEvent[] = [];
  const tick = state.tick + 1;

  // 1. Player movement (with obstacle collision).
  const playerCenter = movePlayer(state, action.movementQ);

  // 2. Lantern drain/recharge based on safe-zone state after moving.
  const safe = distance(playerCenter, LIGHTHOUSE_PX) <= SAFE_RADIUS;
  const energyUnits = clamp(state.lantern.energyUnits + (safe ? 400 : -48), 0, MAX_ENERGY_UNITS);
  let next: GameState = {
    ...state,
    tick,
    player: { centerQ: toQ(playerCenter) },
    lantern: { energyUnits },
  };

  // 3. Runtime spawn stage: star cadence + respawn, then shadow cadence.
  const liveStars = next.availableStars.length + next.carriedStars.length;
  if (tick % 720 === 0 && liveStars < 28 && !next.pendingStarRespawn) {
    next = { ...next, pendingStarRespawn: { dueTick: tick } };
  }
  next = attemptStarRespawn(next, { currentTick: tick });
  next = spawnShadow(next, tick);

  // 4. Shadow pursuit + repulsion (with obstacle collision), in ascending id.
  const lit = next.lantern.energyUnits > 0;
  next = {
    ...next,
    shadows: next.shadows.map((shadow) => moveShadow(shadow, playerCenter, next.bankedStars, lit, next.obstacles)),
  };

  // 5. Star pickup (up to carry limit 5).
  const picked = next.availableStars.filter((star) => next.carriedStars.length < 5 && distance(toPx(star.centerQ), playerCenter) <= 34);
  if (picked.length) {
    next = {
      ...next,
      availableStars: next.availableStars.filter((star) => !picked.includes(star)),
      carriedStars: [...next.carriedStars, ...picked.map((star) => star.id)],
    };
    events.push({ kind: 'pickup' });
  }

  // 6. Lighthouse deposit: bank carried stars, score from pre-refill energy, refill.
  if (distance(playerCenter, LIGHTHOUSE_PX) <= DEPOSIT_RADIUS && next.carriedStars.length) {
    const depositedStars = next.carriedStars.length;
    const preRefillEnergyUnits = next.lantern.energyUnits;
    next = {
      ...next,
      bankedStars: next.bankedStars + depositedStars,
      carriedStars: [],
      score: next.score + scoreDeposit({ depositedStars, preRefillEnergyUnits }),
      lantern: { energyUnits: MAX_ENERGY_UNITS },
    };
    events.push({ kind: 'deposit' });
  }

  // 7. Win check (a same-tick deposit reaching 20 always wins).
  if (next.bankedStars >= 20) {
    next = { ...next, phase: 'won', score: next.score + scoreWinBonus(tick) };
    events.push({ kind: 'won' });
    return { state: next, events };
  }

  // 8. Shadow collision: an eligible (zero-grace) shadow touching the player ends
  // the round only when the lantern is empty.
  const collision = next.shadows.find(
    (shadow) => shadow.graceTicks === 0 && distance(toPx(shadow.centerQ), playerCenter) <= PLAYER_RADIUS + SHADOW_RADIUS,
  );
  if (collision) {
    next = { ...next, phase: 'lost' };
    events.push({ kind: 'lost' });
    return { state: next, events };
  }

  // Decrement grace on shadows that were not freshly repelled.
  next = {
    ...next,
    shadows: next.shadows.map((shadow) =>
      shadow.graceTicks === 21 ? shadow : { ...shadow, graceTicks: Math.max(0, shadow.graceTicks - 1) },
    ),
  };

  return { state: next, events };
}
