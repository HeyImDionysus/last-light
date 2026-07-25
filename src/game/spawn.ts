import { LIGHTHOUSE, Q } from './constants';
import type { GameState, Star, VectorQ } from './types';

type Candidate = { centerQ: VectorQ; rngState: number };
type RespawnOptions = { currentTick: number; nextCandidate?: () => Candidate };

function distancePixels(a: VectorQ, b: VectorQ): number {
  return Math.hypot(a.x - b.x, a.y - b.y) / Q;
}

function validStar(state: GameState, centerQ: VectorQ): boolean {
  if (distancePixels(centerQ, LIGHTHOUSE) <= 300 || distancePixels(centerQ, state.player.centerQ) < 260) return false;
  if (state.shadows.some((shadow) => distancePixels(centerQ, shadow.centerQ) < 180)) return false;
  if (state.availableStars.some((star) => distancePixels(centerQ, star.centerQ) <= 100)) return false;
  const x = centerQ.x / Q; const y = centerQ.y / Q;
  return x >= 34 && x <= 2366 && y >= 34 && y <= 1566 && !state.obstacles.some((item) => x >= item.x - 34 && x <= item.x + item.width + 34 && y >= item.y - 34 && y <= item.y + item.height + 34);
}

export function attemptStarRespawn(state: GameState, options: RespawnOptions): GameState {
  if (!state.pendingStarRespawn || state.pendingStarRespawn.dueTick !== options.currentTick) return state;
  let rngState = state.rngState;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = options.nextCandidate?.() ?? { centerQ: { x: 2_100 * Q, y: 1_200 * Q }, rngState };
    rngState = candidate.rngState;
    if (validStar(state, candidate.centerQ)) {
      const star: Star = { id: state.nextStarId, centerQ: candidate.centerQ };
      return { ...state, rngState, availableStars: [...state.availableStars, star], nextStarId: state.nextStarId + 1, pendingStarRespawn: undefined };
    }
  }
  return { ...state, rngState, pendingStarRespawn: { dueTick: options.currentTick + 60 } };
}
