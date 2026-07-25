import { LIGHTHOUSE, Q } from './constants';
import { cameraFor, shadowPassable, starPassable, withinRadius } from './geometry';
import { createRng } from './rng';
import type { GameState, Star, VectorQ } from './types';

type Candidate = { centerQ: VectorQ; rngState: number };
type RespawnOptions = { currentTick: number; nextCandidate?: () => Candidate };

function runtimeStarSafe(state: GameState, centerQ: VectorQ): boolean {
  if (!starPassable(centerQ, state.obstacles) || !withinRadius(centerQ, LIGHTHOUSE, 10_000) || withinRadius(centerQ, LIGHTHOUSE, 300)) return false;
  if (withinRadius(centerQ, state.player.centerQ, 259)) return false;
  if (state.shadows.some((shadow) => withinRadius(centerQ, shadow.centerQ, 179))) return false;
  if (state.availableStars.some((star) => withinRadius(centerQ, star.centerQ, 100))) return false;
  const camera = cameraFor(state.player.centerQ); const x = centerQ.x / Q; const y = centerQ.y / Q;
  return x < camera.left || x > camera.right || y < camera.top || y > camera.bottom;
}
function stateCandidate(state: GameState): Candidate {
  const rng = createRng(state.rngState);
  return { centerQ: { x: (80 + rng.int(0, 2240)) * Q, y: (80 + rng.int(0, 1440)) * Q }, rngState: rng.state() };
}

export function attemptStarRespawn(state: GameState, options: RespawnOptions): GameState {
  if (!state.pendingStarRespawn || state.pendingStarRespawn.dueTick !== options.currentTick) return state;
  let working = state;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = options.nextCandidate?.() ?? stateCandidate(working);
    working = { ...working, rngState: candidate.rngState };
    if (runtimeStarSafe(working, candidate.centerQ)) {
      const star: Star = { id: state.nextStarId, centerQ: candidate.centerQ };
      return { ...working, availableStars: [...state.availableStars, star], nextStarId: state.nextStarId + 1, pendingStarRespawn: undefined };
    }
  }
  return { ...working, pendingStarRespawn: { dueTick: options.currentTick + 60 } };
}

export function attemptShadowSpawn(state: GameState, currentTick: number): GameState {
  if (!state.pendingShadowSpawn || state.pendingShadowSpawn.dueTick !== currentTick) return state;
  let working = state;
  const camera = cameraFor(state.player.centerQ);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const rng = createRng(working.rngState);
    const centerQ = { x: (19 + rng.int(0, 2362)) * Q, y: (19 + rng.int(0, 1562)) * Q };
    working = { ...working, rngState: rng.state() };
    const x = centerQ.x / Q; const y = centerQ.y / Q;
    const offscreen = x < camera.left - 80 || x > camera.right + 80 || y < camera.top - 80 || y > camera.bottom + 80;
    if (offscreen && !withinRadius(centerQ, state.player.centerQ, 519) && withinRadius(centerQ, state.player.centerQ, 760) && !withinRadius(centerQ, LIGHTHOUSE, 299) && shadowPassable(centerQ, state.obstacles)) {
      return { ...working, shadows: [...state.shadows, { id: state.nextShadowId, centerQ, graceTicks: 21 }], nextShadowId: state.nextShadowId + 1, pendingShadowSpawn: undefined };
    }
  }
  return { ...working, pendingShadowSpawn: { dueTick: currentTick + 60 } };
}
