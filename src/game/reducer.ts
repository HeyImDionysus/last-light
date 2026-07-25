import { DEPOSIT_RADIUS, LIGHTHOUSE, MAX_ENERGY_UNITS, PLAYER_RADIUS, Q, SAFE_RADIUS, SHADOW_RADIUS } from './constants';
import { displacementQ, lengthQ, resolveDisplacement, trunc0, unitQ, withinRadius } from './geometry';
import { scoreDeposit, scoreWinBonus } from './scoring';
import { attemptShadowSpawn, attemptStarRespawn } from './spawn';
import type { GameEvent, GameState, Shadow, Transition, VectorQ } from './types';

function valid(state: GameState, movementQ: VectorQ): void {
  if (!state.rngState || !Number.isSafeInteger(state.rngState)) throw new Error('invalid game state');
  if (!Number.isSafeInteger(movementQ.x) || !Number.isSafeInteger(movementQ.y) || lengthQ(movementQ) > Q) throw new Error('invalid movement');
  if (!Number.isSafeInteger(state.lantern.energyUnits) || state.lantern.energyUnits < 0 || state.lantern.energyUnits > MAX_ENERGY_UNITS) throw new Error('invalid lantern');
  for (const list of [state.obstacles, state.availableStars, state.shadows]) { const ids = list.map((item) => item.id); if (new Set(ids).size !== ids.length) throw new Error('duplicate entity id'); }
}
function movePlayer(state: GameState, movementQ: VectorQ): VectorQ { return resolveDisplacement(state.player.centerQ, displacementQ(movementQ, 230), state.obstacles, PLAYER_RADIUS); }
function moveShadow(state: GameState, shadow: Shadow, player: VectorQ): Shadow {
  const pursuitUnit = unitQ(shadow.centerQ, player, shadow.id);
  const speed = 92 + 4 * Math.floor(state.bankedStars / 5);
  let centerQ = resolveDisplacement(shadow.centerQ, displacementQ(pursuitUnit, speed), state.obstacles, SHADOW_RADIUS);
  if (withinRadius(centerQ, LIGHTHOUSE, 168)) {
    const radial = unitQ(LIGHTHOUSE, centerQ, shadow.id);
    const projected = { x: LIGHTHOUSE.x + radial.x * 169, y: LIGHTHOUSE.y + radial.y * 169 };
    centerQ = resolveDisplacement(centerQ, { x: projected.x - centerQ.x, y: projected.y - centerQ.y }, state.obstacles, SHADOW_RADIUS);
  }
  let graceTicks = shadow.graceTicks;
  if (state.lantern.energyUnits > 0 && withinRadius(centerQ, player, 155)) {
    const away = unitQ(player, centerQ, shadow.id);
    centerQ = resolveDisplacement(centerQ, displacementQ(away, 300), state.obstacles, SHADOW_RADIUS);
    graceTicks = 21;
  }
  return { ...shadow, centerQ, graceTicks };
}
function shadowTarget(state: GameState) { return 2 + Math.floor(state.bankedStars / 5); }
function runtimeSpawnStage(state: GameState, tick: number): GameState {
  let next = state;
  if (tick % 720 === 0 && next.availableStars.length + next.carriedStars.length < 28 && !next.pendingStarRespawn) next = { ...next, pendingStarRespawn: { dueTick: tick } };
  next = attemptStarRespawn(next, { currentTick: tick });
  next = attemptShadowSpawn(next, tick);
  if (tick >= 720 && (tick - 720) % 1800 === 0 && !next.pendingShadowSpawn && next.shadows.length < shadowTarget(next)) {
    next = attemptShadowSpawn({ ...next, pendingShadowSpawn: { dueTick: tick } }, tick);
  }
  return next;
}

export function advance(state: Readonly<GameState>, action: { kind: 'tick'; movementQ: VectorQ }): Transition {
  valid(state, action.movementQ);
  if (state.phase !== 'playing') return { state, events: [] };
  const events: GameEvent[] = []; const tick = state.tick + 1; const playerCenterQ = movePlayer(state, action.movementQ);
  const safe = withinRadius(playerCenterQ, LIGHTHOUSE, SAFE_RADIUS);
  let next: GameState = { ...state, tick, player: { centerQ: playerCenterQ }, lantern: { energyUnits: Math.max(0, Math.min(MAX_ENERGY_UNITS, state.lantern.energyUnits + (safe ? 400 : -48))) } };
  next = runtimeSpawnStage(next, tick);
  const spawnedIds = new Set(next.shadows.filter((shadow) => !state.shadows.some((prior) => prior.id === shadow.id)).map((shadow) => shadow.id));
  next = { ...next, shadows: next.shadows.map((shadow) => moveShadow(next, shadow, playerCenterQ)) };
  const picked = next.availableStars.filter((star) => next.carriedStars.length < 5 && withinRadius(star.centerQ, playerCenterQ, 34));
  if (picked.length) { next = { ...next, availableStars: next.availableStars.filter((star) => !picked.includes(star)), carriedStars: [...next.carriedStars, ...picked.map((star) => star.id)] }; events.push({ kind: 'pickup' }); }
  if (withinRadius(playerCenterQ, LIGHTHOUSE, DEPOSIT_RADIUS) && next.carriedStars.length) {
    const depositedStars = next.carriedStars.length; const preRefillEnergyUnits = next.lantern.energyUnits;
    next = { ...next, bankedStars: next.bankedStars + depositedStars, carriedStars: [], score: next.score + scoreDeposit({ depositedStars, preRefillEnergyUnits }), lantern: { energyUnits: MAX_ENERGY_UNITS } }; events.push({ kind: 'deposit' });
  }
  if (next.bankedStars >= 20) { next = { ...next, phase: 'won', score: next.score + scoreWinBonus(tick) }; events.push({ kind: 'won' }); return { state: next, events }; }
  const collision = next.shadows.find((shadow) => shadow.graceTicks === 0 && next.lantern.energyUnits === 0 && withinRadius(shadow.centerQ, playerCenterQ, PLAYER_RADIUS + SHADOW_RADIUS));
  if (collision) { next = { ...next, phase: 'lost' }; events.push({ kind: 'lost' }); return { state: next, events }; }
  next = { ...next, shadows: next.shadows.map((shadow) => spawnedIds.has(shadow.id) ? shadow : { ...shadow, graceTicks: Math.max(0, shadow.graceTicks - 1) }) };
  return { state: next, events };
}
