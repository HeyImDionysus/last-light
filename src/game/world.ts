// Seeded procedural world construction. Driven entirely by the gameplay PRNG so
// that a seed fully determines the forest layout: obstacle candidates are
// accepted/rejected in order, then initial stars are placed in their distance
// bands. Same seed -> identical world. Different seed -> a fresh forest.

import { FALLBACK_SEED, LIGHTHOUSE, MAX_ENERGY_UNITS, Q } from './constants';
import { createRng } from './rng';
import { distance, isStarPassable, obstacleIsAcceptable, type Point } from './geometry';
import type { GameState, Obstacle, Star } from './types';

const OBSTACLE_COUNT = 24;
const INITIAL_STAR_COUNT = 28;
const LIGHTHOUSE_PX: Point = { x: LIGHTHOUSE.x / Q, y: LIGHTHOUSE.y / Q };

function generateObstacles(rng: ReturnType<typeof createRng>): Obstacle[] {
  const accepted: Obstacle[] = [];
  for (let id = 0; id < OBSTACLE_COUNT; id += 1) {
    let chosen: Obstacle | undefined;
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const x = 80 + rng.int(0, 2079);
      const y = 80 + rng.int(0, 1279);
      const width = 96 + 16 * rng.int(0, 13);
      const height = 96 + 16 * rng.int(0, 10);
      const candidate: Obstacle = { id, x, y, width, height };
      if (obstacleIsAcceptable(candidate, accepted)) {
        chosen = candidate;
        break;
      }
    }
    // Deterministic spiral fallback: astronomically unlikely (256 attempts in a
    // sparse world), but guarantees a playable, fully-populated forest instead of
    // crashing the round. Keeps generation robust and still seed-deterministic.
    if (!chosen) {
      chosen = spiralFallbackObstacle(id, accepted);
    }
    accepted.push(chosen);
  }
  return accepted;
}

function spiralFallbackObstacle(id: number, accepted: readonly Obstacle[]): Obstacle {
  for (let r = 200; r < 1100; r += 40) {
    for (let a = 0; a < 360; a += 17) {
      const rad = (a * Math.PI) / 180;
      const x = Math.round(LIGHTHOUSE_PX.x + Math.cos(rad) * r);
      const y = Math.round(LIGHTHOUSE_PX.y + Math.sin(rad) * r);
      const candidate: Obstacle = { id, x: x - 100, y: y - 80, width: 128, height: 112 };
      if (obstacleIsAcceptable(candidate, accepted)) return candidate;
    }
  }
  // Absolute last resort: a known-clear corner slot. Never reached in practice.
  return { id, x: 120, y: 120, width: 96, height: 96 };
}

function starBand(id: number): { lo: number; hi: number } | null {
  if (id < 10) return { lo: 250, hi: 850 };
  if (id < 20) return { lo: 850, hi: 1500 };
  return null;
}

function generateStars(rng: ReturnType<typeof createRng>, obstacles: readonly Obstacle[]): Star[] {
  const stars: Star[] = [];
  for (let id = 0; id < INITIAL_STAR_COUNT; id += 1) {
    const band = starBand(id);
    let chosen: Point | undefined;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const x = 80 + rng.int(0, 2240);
      const y = 80 + rng.int(0, 1440);
      const candidate: Point = { x, y };
      const dist = distance(candidate, LIGHTHOUSE_PX);
      if (dist <= 150) continue;
      if (band !== null && (dist <= band.lo || dist > band.hi)) continue;
      if (!isStarPassable(candidate, obstacles)) continue;
      if (stars.some((s) => distance(candidate, { x: s.centerQ.x / Q, y: s.centerQ.y / Q }) <= 100)) continue;
      chosen = candidate;
      break;
    }
    // Deterministic outward spiral fallback so every star slot is always filled.
    if (!chosen) {
      chosen = spiralFallbackStar(id, band, obstacles, stars);
    }
    stars.push({ id, centerQ: { x: Math.round(chosen.x * Q), y: Math.round(chosen.y * Q) } });
  }
  return stars;
}

function spiralFallbackStar(
  id: number,
  band: { lo: number; hi: number } | null,
  obstacles: readonly Obstacle[],
  accepted: Star[],
): Point {
  const ring = band ?? { lo: 150, hi: 1500 };
  for (let r = Math.max(260, ring.lo); r < ring.hi + 200; r += 30) {
    for (let a = 0; a < 360; a += 13) {
      const rad = (a * Math.PI) / 180;
      const candidate: Point = {
        x: LIGHTHOUSE_PX.x + Math.cos(rad) * r,
        y: LIGHTHOUSE_PX.y + Math.sin(rad) * r,
      };
      const dist = distance(candidate, LIGHTHOUSE_PX);
      if (dist <= 150) continue;
      if (band && (dist <= band.lo || dist > band.hi)) continue;
      if (!isStarPassable(candidate, obstacles)) continue;
      if (accepted.some((s) => distance(candidate, { x: s.centerQ.x / Q, y: s.centerQ.y / Q }) <= 100)) continue;
      return candidate;
    }
  }
  // Unreachable last resort.
  return { x: LIGHTHOUSE_PX.x + 300, y: LIGHTHOUSE_PX.y };
}

export function createRound(seed: number = FALLBACK_SEED): GameState {
  const normalized = seed >>> 0 || FALLBACK_SEED;
  const rng = createRng(normalized);
  const obstacles = generateObstacles(rng);
  const availableStars = generateStars(rng, obstacles);
  return {
    phase: 'playing',
    tick: 0,
    rngState: rng.state(),
    player: { centerQ: { ...LIGHTHOUSE } },
    lantern: { energyUnits: MAX_ENERGY_UNITS },
    obstacles,
    availableStars,
    carriedStars: [],
    bankedStars: 0,
    score: 0,
    shadows: [],
    nextStarId: INITIAL_STAR_COUNT,
    nextShadowId: 0,
  };
}
