import { describe, it, expect } from 'vitest';
import { resolveMovement, isCirclePassable, isStarPassable, obstacleIsAcceptable, distance } from '../../src/game/geometry';
import type { Obstacle } from '../../src/game/types';

const obstacle = (x: number, y: number, w: number, h: number, id = 0): Obstacle => ({ id, x, y, width: w, height: h });

describe('resolveMovement — swept-circle obstacle collision', () => {
  it('blocks a circle from passing through a solid obstacle', () => {
    const obs = [obstacle(500, 500, 200, 200)];
    // Start left of the obstacle, move right through it.
    const result = resolveMovement({ x: 400, y: 600 }, { x: 400, y: 0 }, 18, obs);
    // Should be stopped at the obstacle's left edge (expanded by radius 18).
    expect(result.x).toBeLessThanOrEqual(500 - 18);
    expect(result.x).toBeGreaterThanOrEqual(400);
  });

  it('lets the entity slide along a wall instead of entering it', () => {
    const obs = [obstacle(500, 500, 200, 200)];
    const result = resolveMovement({ x: 470, y: 400 }, { x: 60, y: 100 }, 18, obs);
    const insideX = result.x > 500 - 18 && result.x < 700 + 18;
    const insideY = result.y > 500 - 18 && result.y < 700 + 18;
    expect(insideX && insideY).toBe(false);
    expect(result.x + result.y).toBeGreaterThan(470 + 400);
  });

  it('respects world bounds on all sides', () => {
    const result = resolveMovement({ x: 2390, y: 1590 }, { x: 100, y: 100 }, 18, []);
    expect(result.x).toBe(2400 - 18);
    expect(result.y).toBe(1600 - 18);
    const left = resolveMovement({ x: 10, y: 10 }, { x: -100, y: -100 }, 18, []);
    expect(left.x).toBe(18);
    expect(left.y).toBe(18);
  });

  it('moves freely when no obstacle is in the way', () => {
    const result = resolveMovement({ x: 100, y: 100 }, { x: 50, y: 50 }, 18, [obstacle(1000, 1000, 100, 100)]);
    expect(result.x).toBeCloseTo(150, 5);
    expect(result.y).toBeCloseTo(150, 5);
  });
});

describe('passability predicates', () => {
  it('isCirclePassable rejects points inside an expanded obstacle and out of bounds', () => {
    const obs = [obstacle(500, 500, 200, 200)];
    expect(isCirclePassable({ x: 600, y: 600 }, 18, obs)).toBe(false);
    expect(isCirclePassable({ x: 1000, y: 1000 }, 18, obs)).toBe(true);
    expect(isCirclePassable({ x: 5, y: 800 }, 18, obs)).toBe(false);
  });

  it('isStarPassable uses a 34 px expansion', () => {
    const obs = [obstacle(500, 500, 200, 200)];
    expect(isStarPassable({ x: 600, y: 600 }, obs)).toBe(false);
    expect(isStarPassable({ x: 540, y: 600 }, obs)).toBe(false); // within 34 of edge
    expect(isStarPassable({ x: 450, y: 600 }, obs)).toBe(true);
  });
});

describe('obstacleIsAcceptable — generation placement rules', () => {
  it('rejects an obstacle that intersects the lighthouse safe zone', () => {
    // Lighthouse safe circle bbox is (1050,650)-(1350,950). A candidate near it
    // expanded by 150 must not overlap.
    const candidate = obstacle(1100, 700, 100, 100, 0);
    expect(obstacleIsAcceptable(candidate, [])).toBe(false);
  });

  it('accepts a well-placed obstacle away from the lighthouse', () => {
    const candidate = obstacle(200, 200, 120, 120, 0);
    expect(obstacleIsAcceptable(candidate, [])).toBe(true);
  });

  it('rejects candidates closer than 36 px total gap to an accepted obstacle', () => {
    const accepted = [obstacle(200, 200, 120, 120, 0)];
    // Place a second candidate abutting it (gap < 36).
    const tooClose = obstacle(330, 200, 120, 120, 1); // 10 px gap
    expect(obstacleIsAcceptable(tooClose, accepted)).toBe(false);
    const farEnough = obstacle(400, 200, 120, 120, 1); // 80 px gap
    expect(obstacleIsAcceptable(farEnough, accepted)).toBe(true);
  });

  it('rejects candidates outside the 80 px map margin', () => {
    expect(obstacleIsAcceptable(obstacle(40, 200, 120, 120, 0), [])).toBe(false);
    expect(obstacleIsAcceptable(obstacle(2280, 200, 200, 120, 0), [])).toBe(false);
  });
});

describe('distance', () => {
  it('computes euclidean distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 5);
  });
});
