import { FALLBACK_SEED, LIGHTHOUSE, MAX_ENERGY_UNITS, Q } from './constants';
import { createRng } from './rng';
import type { GameState, Obstacle, Star } from './types';

const obstacleLayout: ReadonlyArray<readonly [number, number, number, number]> = [
  [100, 100, 160, 128], [420, 100, 176, 112], [760, 100, 144, 160], [1080, 100, 160, 128],
  [1400, 100, 176, 112], [1740, 100, 144, 160], [2060, 100, 160, 128], [100, 420, 160, 128],
  [2140, 420, 160, 128], [100, 740, 160, 128], [2140, 740, 160, 128], [100, 1060, 160, 128],
  [2140, 1060, 160, 128], [100, 1380, 160, 128], [420, 1380, 176, 112], [760, 1380, 144, 140],
  [1080, 1380, 160, 128], [1400, 1380, 176, 112], [1740, 1380, 144, 140], [2060, 1380, 160, 128],
  [400, 620, 112, 112], [1888, 620, 112, 112], [400, 940, 112, 112], [1888, 940, 112, 112],
];

function fixedObstacles(): Obstacle[] {
  return obstacleLayout.map(([x, y, width, height], id) => ({ id, x, y, width, height }));
}

function starAt(id: number): Star {
  const group = id < 10 ? 0 : id < 20 ? 1 : 2;
  const local = group === 0 ? id : group === 1 ? id - 10 : id - 20;
  const count = group === 0 ? 10 : group === 1 ? 10 : 8;
  const radius = group === 0 ? 500 : group === 1 ? 900 : 200;
  const angle = (Math.PI * 2 * local) / count;
  return { id, centerQ: { x: Math.round((1_200 + Math.cos(angle) * radius) * Q), y: Math.round((800 + Math.sin(angle) * radius) * Q) } };
}

export function createRound(seed = FALLBACK_SEED): GameState {
  const rng = createRng(seed);
  // Preserve a nonzero serializable gameplay state without letting cosmetic layout consume runtime entropy.
  const rngState = rng.nextU32();
  return {
    phase: 'playing', tick: 0, rngState, player: { centerQ: { ...LIGHTHOUSE } },
    lantern: { energyUnits: MAX_ENERGY_UNITS }, obstacles: fixedObstacles(),
    availableStars: Array.from({ length: 28 }, (_, id) => starAt(id)), carriedStars: [],
    bankedStars: 0, score: 0, shadows: [], nextStarId: 28, nextShadowId: 0,
  };
}
