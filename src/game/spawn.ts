// RNG-driven star respawn. When a pending respawn request is due, draw candidate
// positions from the gameplay PRNG and accept the first that satisfies the safety
// rules. On exhaustion, defer by 60 ticks. All entropy comes from state.rngState
// so the sequence stays seed-deterministic.

import { LIGHTHOUSE, Q } from './constants';
import { createRng } from './rng';
import { distance, isStarPassable, type Point } from './geometry';
import type { GameState, Star, VectorQ } from './types';

const LIGHTHOUSE_PX: Point = { x: LIGHTHOUSE.x / Q, y: LIGHTHOUSE.y / Q };

type RespawnOptions = { currentTick: number };

function validStar(state: GameState, centerPx: Point): boolean {
  if (distance(centerPx, LIGHTHOUSE_PX) <= 300) return false;
  if (distance(centerPx, { x: state.player.centerQ.x / Q, y: state.player.centerQ.y / Q }) < 260) return false;
  if (state.shadows.some((shadow) => distance(centerPx, { x: shadow.centerQ.x / Q, y: shadow.centerQ.y / Q }) < 180)) return false;
  if (state.availableStars.some((star) => distance(centerPx, { x: star.centerQ.x / Q, y: star.centerQ.y / Q }) <= 100)) return false;
  return isStarPassable(centerPx, state.obstacles);
}

export function attemptStarRespawn(state: GameState, options: RespawnOptions): GameState {
  if (!state.pendingStarRespawn || state.pendingStarRespawn.dueTick !== options.currentTick) return state;

  const rng = createRng(state.rngState);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const centerPx: Point = { x: 80 + rng.int(0, 2240), y: 80 + rng.int(0, 1440) };
    if (validStar(state, centerPx)) {
      const centerQ: VectorQ = { x: Math.round(centerPx.x * Q), y: Math.round(centerPx.y * Q) };
      const star: Star = { id: state.nextStarId, centerQ };
      return {
        ...state,
        rngState: rng.state(),
        availableStars: [...state.availableStars, star],
        nextStarId: state.nextStarId + 1,
        pendingStarRespawn: undefined,
      };
    }
  }
  return { ...state, rngState: rng.state(), pendingStarRespawn: { dueTick: options.currentTick + 60 } };
}
