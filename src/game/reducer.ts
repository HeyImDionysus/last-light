import { DEPOSIT_RADIUS, LIGHTHOUSE, MAX_ENERGY_UNITS, PLAYER_RADIUS, Q, SAFE_RADIUS, SHADOW_RADIUS } from './constants';
import { scoreDeposit, scoreWinBonus } from './scoring';
import { attemptStarRespawn } from './spawn';
import type { GameEvent, GameState, Shadow, Transition, VectorQ } from './types';

const trunc0 = (value: number) => (value < 0 ? Math.ceil(value) : Math.floor(value));
const distance = (a: VectorQ, b: VectorQ) => Math.hypot(a.x - b.x, a.y - b.y);
const pixels = (a: VectorQ, b: VectorQ) => distance(a, b) / Q;
const unit = (from: VectorQ, to: VectorQ, id = 0): VectorQ => {
  const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.floor(Math.sqrt(dx * dx + dy * dy));
  if (!length) return [{ x: Q, y: 0 }, { x: 46_341, y: 46_341 }, { x: 0, y: Q }, { x: -46_341, y: 46_341 }, { x: -Q, y: 0 }, { x: -46_341, y: -46_341 }, { x: 0, y: -Q }, { x: 46_341, y: -46_341 }][id % 8]!;
  return { x: trunc0((dx * Q) / length), y: trunc0((dy * Q) / length) };
};
const displacement = (direction: VectorQ, speed: number): VectorQ => ({ x: trunc0((direction.x * speed) / 60), y: trunc0((direction.y * speed) / 60) });

function valid(state: GameState, movementQ: VectorQ): void {
  if (!state.rngState || !Number.isSafeInteger(state.rngState)) throw new Error('invalid game state');
  if (!Number.isSafeInteger(movementQ.x) || !Number.isSafeInteger(movementQ.y) || Math.floor(Math.sqrt(movementQ.x ** 2 + movementQ.y ** 2)) > Q) throw new Error('invalid movement');
  if (!Number.isSafeInteger(state.lantern.energyUnits) || state.lantern.energyUnits < 0 || state.lantern.energyUnits > MAX_ENERGY_UNITS) throw new Error('invalid lantern');
  for (const list of [state.obstacles, state.availableStars, state.shadows]) {
    const ids = list.map((item) => item.id); if (new Set(ids).size !== ids.length) throw new Error('duplicate entity id');
  }
}

function movePlayer(state: GameState, movementQ: VectorQ): VectorQ {
  const move = displacement(movementQ, 230);
  const candidate = { x: state.player.centerQ.x + move.x, y: state.player.centerQ.y + move.y };
  return { x: Math.max(PLAYER_RADIUS * Q, Math.min((2400 - PLAYER_RADIUS) * Q, candidate.x)), y: Math.max(PLAYER_RADIUS * Q, Math.min((1600 - PLAYER_RADIUS) * Q, candidate.y)) };
}

function moveShadow(shadow: Shadow, player: VectorQ, banked: number, lit: boolean): Shadow {
  const toward = unit(shadow.centerQ, player, shadow.id); const speed = 92 + 4 * Math.floor(banked / 5); const pursuit = displacement(toward, speed);
  let centerQ = { x: shadow.centerQ.x + pursuit.x, y: shadow.centerQ.y + pursuit.y };
  if (pixels(centerQ, LIGHTHOUSE) < 169) {
    const radial = unit(LIGHTHOUSE, centerQ, shadow.id); centerQ = { x: LIGHTHOUSE.x + radial.x * 169, y: LIGHTHOUSE.y + radial.y * 169 };
  }
  let graceTicks = shadow.graceTicks;
  if (lit && pixels(centerQ, player) <= 155) {
    const away = unit(player, centerQ, shadow.id); const repel = displacement(away, 300); centerQ = { x: centerQ.x + repel.x, y: centerQ.y + repel.y }; graceTicks = 21;
  }
  return { ...shadow, centerQ, graceTicks };
}

function spawnShadow(state: GameState, tick: number): GameState {
  if (tick < 720 || (tick - 720) % 1800 !== 0 || state.shadows.length >= 2 + Math.floor(state.bankedStars / 5)) return state;
  const player = state.player.centerQ; const centerQ = { x: Math.min(2381 * Q, player.x + 600 * Q), y: player.y };
  return { ...state, shadows: [...state.shadows, { id: state.nextShadowId, centerQ, graceTicks: 21 }], nextShadowId: state.nextShadowId + 1 };
}

export function advance(state: Readonly<GameState>, action: { kind: 'tick'; movementQ: VectorQ }): Transition {
  valid(state, action.movementQ);
  if (state.phase !== 'playing') return { state, events: [] };
  const events: GameEvent[] = []; const tick = state.tick + 1; const playerCenterQ = movePlayer(state, action.movementQ);
  const safe = pixels(playerCenterQ, LIGHTHOUSE) <= SAFE_RADIUS;
  let next: GameState = { ...state, tick, player: { centerQ: playerCenterQ }, lantern: { energyUnits: Math.max(0, Math.min(MAX_ENERGY_UNITS, state.lantern.energyUnits + (safe ? 400 : -48))) } };
  if (tick % 720 === 0 && next.availableStars.length + next.carriedStars.length < 28 && !next.pendingStarRespawn) next = { ...next, pendingStarRespawn: { dueTick: tick } };
  next = attemptStarRespawn(next, { currentTick: tick });
  next = spawnShadow(next, tick);
  next = { ...next, shadows: next.shadows.map((shadow) => moveShadow(shadow, playerCenterQ, next.bankedStars, next.lantern.energyUnits > 0)) };
  const picked = next.availableStars.filter((star) => next.carriedStars.length < 5 && pixels(star.centerQ, playerCenterQ) <= 34);
  if (picked.length) { next = { ...next, availableStars: next.availableStars.filter((star) => !picked.includes(star)), carriedStars: [...next.carriedStars, ...picked.map((star) => star.id)] }; events.push({ kind: 'pickup' }); }
  if (pixels(playerCenterQ, LIGHTHOUSE) <= DEPOSIT_RADIUS && next.carriedStars.length) {
    const depositedStars = next.carriedStars.length; const preRefillEnergyUnits = next.lantern.energyUnits;
    next = { ...next, bankedStars: next.bankedStars + depositedStars, carriedStars: [], score: next.score + scoreDeposit({ depositedStars, preRefillEnergyUnits }), lantern: { energyUnits: MAX_ENERGY_UNITS } }; events.push({ kind: 'deposit' });
  }
  if (next.bankedStars >= 20) { next = { ...next, phase: 'won', score: next.score + scoreWinBonus(tick) }; events.push({ kind: 'won' }); return { state: next, events }; }
  const collision = next.shadows.find((shadow) => shadow.graceTicks === 0 && pixels(shadow.centerQ, playerCenterQ) <= PLAYER_RADIUS + SHADOW_RADIUS);
  if (collision) { next = { ...next, phase: 'lost' }; events.push({ kind: 'lost' }); return { state: next, events }; }
  next = { ...next, shadows: next.shadows.map((shadow) => shadow.graceTicks === 21 ? shadow : { ...shadow, graceTicks: Math.max(0, shadow.graceTicks - 1) }) };
  return { state: next, events };
}
