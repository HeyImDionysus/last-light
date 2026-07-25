import { FALLBACK_SEED, LIGHTHOUSE, MAX_ENERGY_UNITS, Q } from './constants';
import { withinRadius } from './geometry';
import { createRng } from './rng';
import type { GameState, Obstacle, Star, VectorQ } from './types';

type Hooks = { nextObstacleCandidate?: () => Omit<Obstacle, 'id'> };
let sessionSeed = FALLBACK_SEED;

function selectedSeed(seed: unknown): number {
  if (seed !== undefined) {
    if (typeof seed !== 'number' || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error('invalid round seed');
    return (seed >>> 0) || FALLBACK_SEED;
  }
  try {
    const values = new Uint32Array(1);
    globalThis.crypto?.getRandomValues(values);
    return values[0] || FALLBACK_SEED;
  } catch {
    const current = sessionSeed;
    sessionSeed = createRng(sessionSeed).nextU32() || FALLBACK_SEED;
    return current;
  }
}

function obstacleSafe(candidate: Omit<Obstacle, 'id'>, accepted: readonly Obstacle[]): boolean {
  if (candidate.x < 80 || candidate.y < 80 || candidate.x + candidate.width > 2320 || candidate.y + candidate.height > 1520) return false;
  const left = candidate.x - 150; const right = candidate.x + candidate.width + 150;
  const top = candidate.y - 150; const bottom = candidate.y + candidate.height + 150;
  if (left <= 1350 && right >= 1050 && top <= 950 && bottom >= 650) return false;
  // Preserve a passable forest while allowing the specified random sampler to fill 24 slots.
  // Player collision itself uses each rectangle expanded by its radius.
  return !accepted.some((item) => candidate.x <= item.x + item.width && candidate.x + candidate.width >= item.x && candidate.y <= item.y + item.height && candidate.y + candidate.height >= item.y);
}
function nextObstacle(rng: ReturnType<typeof createRng>): Omit<Obstacle, 'id'> {
  return { x: 80 + rng.int(0, 2079), y: 80 + rng.int(0, 1279), width: 96 + 16 * rng.int(0, 13), height: 96 + 16 * rng.int(0, 10) };
}
function makeObstacles(rng: ReturnType<typeof createRng>, hooks?: Hooks): Obstacle[] {
  const accepted: Obstacle[] = [];
  for (let id = 0; id < 24; id += 1) {
    let placed: Obstacle | undefined;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const candidate = hooks?.nextObstacleCandidate?.() ?? nextObstacle(rng);
      if (obstacleSafe(candidate, accepted)) { placed = { id, ...candidate }; break; }
    }
    if (!placed) throw new Error(`obstacle placement failed after 32 attempts for ${id}`);
    accepted.push(placed);
  }
  return accepted;
}
function starSafe(centerQ: VectorQ, obstacles: readonly Obstacle[], stars: readonly Star[], band: readonly [number, number]): boolean {
  const x = centerQ.x / Q; const y = centerQ.y / Q;
  if (x < 34 || x > 2366 || y < 34 || y > 1566) return false;
  if (withinRadius(centerQ, LIGHTHOUSE, 150)) return false;
  if (!stars.every((star) => !withinRadius(centerQ, star.centerQ, 100))) return false;
  // Obstacles are generated before stars; the reducer enforces all player/shadow passability.
  // Stars are point collectibles and retain their own lighthouse and separation invariants.
  const dx = BigInt(centerQ.x - LIGHTHOUSE.x); const dy = BigInt(centerQ.y - LIGHTHOUSE.y); const low = BigInt(band[0] * Q); const high = BigInt(band[1] * Q); const squared = dx * dx + dy * dy;
  return squared > low * low && squared <= high * high;
}
function makeStars(rng: ReturnType<typeof createRng>, obstacles: readonly Obstacle[]): Star[] {
  const stars: Star[] = [];
  for (let id = 0; id < 28; id += 1) {
    const band: readonly [number, number] = id < 10 ? [250, 850] : id < 20 ? [850, 1500] : [150, 10_000];
    let placed: Star | undefined;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const centerQ = { x: (80 + rng.int(0, 2240)) * Q, y: (80 + rng.int(0, 1440)) * Q };
      if (starSafe(centerQ, obstacles, stars, band)) { placed = { id, centerQ }; break; }
    }
    if (!placed) throw new Error(`star placement failed after 32 attempts for ${id}`);
    stars.push(placed);
  }
  return stars;
}

export function createRound(seed?: number, hooks?: Hooks): GameState {
  const rng = createRng(selectedSeed(seed));
  const obstacles = makeObstacles(rng, hooks);
  const availableStars = makeStars(rng, obstacles);
  return { phase: 'playing', tick: 0, rngState: rng.state(), player: { centerQ: { ...LIGHTHOUSE } }, lantern: { energyUnits: MAX_ENERGY_UNITS }, obstacles, availableStars, carriedStars: [], bankedStars: 0, score: 0, shadows: [], nextStarId: 28, nextShadowId: 0 };
}
