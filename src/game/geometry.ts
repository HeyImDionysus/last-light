// Pure geometry helpers: swept-circle collision with sliding, and passability
// predicates. All math is in pixel space (float, deterministic within a single
// engine). Q16.16 conversion happens at the reducer boundary, not here.

import type { Obstacle } from './types';
import { WORLD_HEIGHT, WORLD_WIDTH } from './constants';

export type Point = { x: number; y: number };

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Two axis-aligned rectangles intersect (closed intervals). */
function rectsIntersect(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Resolve a circle (center `pos`, radius `r`) travelling by `delta` against the
 * world bounds and every solid obstacle. Uses iterative minimum-translation
 * push-out with sliding: when a wall blocks motion, the blocked component is
 * discarded and the perpendicular (tangent) component is retained, so the entity
 * slides along walls instead of sticking. Robust for the per-tick step sizes in
 * this game (<= ~4 px) against obstacles >= 96 px.
 */
export function resolveMovement(
  pos: Point,
  delta: Point,
  radius: number,
  obstacles: readonly Obstacle[],
): Point {
  // Substep the displacement so a large delta cannot tunnel through an obstacle.
  // Each substep is at most half the radius, then overlaps are resolved by
  // minimum-translation push-out with sliding. For the game's real per-tick step
  // (<= ~4 px) this is a single step; substepping only kicks in for big jumps.
  const stepSize = Math.max(2, radius * 0.5);
  const travel = Math.hypot(delta.x, delta.y);
  const steps = Math.max(1, Math.ceil(travel / stepSize));
  const stepX = delta.x / steps;
  const stepY = delta.y / steps;
  let x = pos.x;
  let y = pos.y;

  for (let step = 0; step < steps; step += 1) {
    x = clamp(x + stepX, radius, WORLD_WIDTH - radius);
    y = clamp(y + stepY, radius, WORLD_HEIGHT - radius);
    for (let iteration = 0; iteration < 4; iteration += 1) {
      let collided = false;
      for (const o of obstacles) {
        const left = o.x - radius;
        const right = o.x + o.width + radius;
        const top = o.y - radius;
        const bottom = o.y + o.height + radius;
        if (x > left && x < right && y > top && y < bottom) {
          const pushLeft = x - left;
          const pushRight = right - x;
          const pushTop = y - top;
          const pushBottom = bottom - y;
          const min = Math.min(pushLeft, pushRight, pushTop, pushBottom);
          if (min === pushLeft) x = left;
          else if (min === pushRight) x = right;
          else if (min === pushTop) y = top;
          else y = bottom;
          collided = true;
        }
      }
      if (!collided) break;
    }
  }
  return { x, y };
}

/** A point is passable for a circle of `radius`: inside bounds and clear of every
 * obstacle expanded by the radius. Touching the expanded boundary counts as clear. */
export function isCirclePassable(point: Point, radius: number, obstacles: readonly Obstacle[]): boolean {
  if (point.x < radius || point.x > WORLD_WIDTH - radius) return false;
  if (point.y < radius || point.y > WORLD_HEIGHT - radius) return false;
  return !obstacles.some(
    (o) =>
      point.x > o.x - radius &&
      point.x < o.x + o.width + radius &&
      point.y > o.y - radius &&
      point.y < o.y + o.height + radius,
  );
}

/** Star passability: center must be clear of every obstacle expanded by 34 px. */
export function isStarPassable(point: Point, obstacles: readonly Obstacle[]): boolean {
  return isCirclePassable(point, 34, obstacles);
}

/** A candidate obstacle satisfies the generation placement rules: wholly inside
 * the 80 px map margin, clear of the lighthouse safe circle, and a >= 36 px total
 * gap from every already-accepted obstacle. */
export function obstacleIsAcceptable(
  candidate: Obstacle,
  accepted: readonly Obstacle[],
): boolean {
  // Wholly inside the 80 px margin.
  if (candidate.x < 80 || candidate.y < 80) return false;
  if (candidate.x + candidate.width > WORLD_WIDTH - 80) return false;
  if (candidate.y + candidate.height > WORLD_HEIGHT - 80) return false;

  // Expanded by 150 px must not intersect the lighthouse safe-circle bounding box.
  // Safe circle: center (1200, 800), radius 150 -> bbox (1050, 650)-(1350, 950).
  if (
    rectsIntersect(
      candidate.x - 150, candidate.y - 150, candidate.width + 300, candidate.height + 300,
      1050, 650, 300, 300,
    )
  ) {
    return false;
  }

  // Expanded by 18 px must not intersect any accepted obstacle expanded by 18 px
  // (a 36 px total gap between the unexpanded rectangles).
  for (const o of accepted) {
    if (
      rectsIntersect(
        candidate.x - 18, candidate.y - 18, candidate.width + 36, candidate.height + 36,
        o.x - 18, o.y - 18, o.width + 36, o.height + 36,
      )
    ) {
      return false;
    }
  }
  return true;
}
