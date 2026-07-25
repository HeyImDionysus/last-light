import { LIGHTHOUSE, PLAYER_RADIUS, Q, SHADOW_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import type { Obstacle, VectorQ } from './types';

export const trunc0 = (value: number) => (value < 0 ? Math.ceil(value) : Math.floor(value));
export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Integer square root for gameplay geometry; inputs are Q16.16 squared values. */
export function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error('negative geometry square');
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low + 1n < high) {
    const middle = (low + high) >> 1n;
    if (middle * middle <= value) low = middle;
    else high = middle;
  }
  return low;
}

export function lengthQ(vector: VectorQ): number {
  return Number(isqrt(BigInt(vector.x) * BigInt(vector.x) + BigInt(vector.y) * BigInt(vector.y)));
}

export function withinRadius(a: VectorQ, b: VectorQ, pixels: number): boolean {
  const dx = BigInt(a.x - b.x); const dy = BigInt(a.y - b.y); const radius = BigInt(pixels * Q);
  return dx * dx + dy * dy <= radius * radius;
}

export function unitQ(from: VectorQ, to: VectorQ, id = 0): VectorQ {
  const dx = to.x - from.x; const dy = to.y - from.y; const length = lengthQ({ x: dx, y: dy });
  if (!length) return [{ x: Q, y: 0 }, { x: 46_341, y: 46_341 }, { x: 0, y: Q }, { x: -46_341, y: 46_341 }, { x: -Q, y: 0 }, { x: -46_341, y: -46_341 }, { x: 0, y: -Q }, { x: 46_341, y: -46_341 }][id % 8]!;
  return { x: trunc0((dx * Q) / length), y: trunc0((dy * Q) / length) };
}

export function displacementQ(unit: VectorQ, speedPixels: number): VectorQ {
  return { x: trunc0((unit.x * (speedPixels * Q)) / Q / 60), y: trunc0((unit.y * (speedPixels * Q)) / Q / 60) };
}

type RectQ = { left: number; right: number; top: number; bottom: number; id: number };
function expandedRects(obstacles: readonly Obstacle[], radius: number): RectQ[] {
  return obstacles.map((item) => ({ left: (item.x - radius) * Q, right: (item.x + item.width + radius) * Q, top: (item.y - radius) * Q, bottom: (item.y + item.height + radius) * Q, id: item.id }));
}

/** Resolve a Q16.16 swept disk against walls and expanded obstacle AABBs. */
export function resolveDisplacement(start: VectorQ, displacement: VectorQ, obstacles: readonly Obstacle[], radius: number): VectorQ {
  const minX = radius * Q; const maxX = (WORLD_WIDTH - radius) * Q;
  const minY = radius * Q; const maxY = (WORLD_HEIGHT - radius) * Q;
  const end = { x: start.x + displacement.x, y: start.y + displacement.y };
  let best = 1;
  let normal: 'x' | 'y' | undefined;
  const consider = (t: number, axis: 'x' | 'y') => { if (t >= 0 && t <= best) { best = t; normal = axis; } };
  if (displacement.x > 0 && end.x > maxX) consider((maxX - start.x) / displacement.x, 'x');
  if (displacement.x < 0 && end.x < minX) consider((minX - start.x) / displacement.x, 'x');
  if (displacement.y > 0 && end.y > maxY) consider((maxY - start.y) / displacement.y, 'y');
  if (displacement.y < 0 && end.y < minY) consider((minY - start.y) / displacement.y, 'y');
  for (const rect of expandedRects(obstacles, radius).sort((a, b) => a.id - b.id)) {
    const dx = displacement.x; const dy = displacement.y;
    const tx1 = dx === 0 ? -Infinity : (rect.left - start.x) / dx;
    const tx2 = dx === 0 ? Infinity : (rect.right - start.x) / dx;
    const ty1 = dy === 0 ? -Infinity : (rect.top - start.y) / dy;
    const ty2 = dy === 0 ? Infinity : (rect.bottom - start.y) / dy;
    const enter = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
    const leave = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
    if (enter >= 0 && enter <= leave && enter <= best) {
      best = enter;
      normal = Math.min(tx1, tx2) >= Math.min(ty1, ty2) ? 'x' : 'y';
    }
  }
  if (best === 1) return end;
  const first = { x: start.x + Math.round(displacement.x * best) - (displacement.x ? Math.sign(displacement.x) : 0), y: start.y + Math.round(displacement.y * best) - (displacement.y ? Math.sign(displacement.y) : 0) };
  const remaining = { x: normal === 'x' ? 0 : trunc0(displacement.x * (1 - best)), y: normal === 'y' ? 0 : trunc0(displacement.y * (1 - best)) };
  if (!remaining.x && !remaining.y) return first;
  // The remaining tangent component gets one attempt only. A second collision is discarded.
  const retryCandidate = { x: first.x + remaining.x, y: first.y + remaining.y };
  const retryBlocked = retryCandidate.x < minX || retryCandidate.x > maxX || retryCandidate.y < minY || retryCandidate.y > maxY || expandedRects(obstacles, radius).some((rect) => retryCandidate.x >= rect.left && retryCandidate.x <= rect.right && retryCandidate.y >= rect.top && retryCandidate.y <= rect.bottom);
  return retryBlocked ? first : retryCandidate;
}

export function cameraFor(centerQ: VectorQ) {
  const x = trunc0(centerQ.x / Q); const y = trunc0(centerQ.y / Q);
  const left = clamp(x - 480, 0, WORLD_WIDTH - 960); const top = clamp(y - 320, 0, WORLD_HEIGHT - 640);
  return { left, top, right: left + 960, bottom: top + 640 };
}
export function starPassable(centerQ: VectorQ, obstacles: readonly Obstacle[]): boolean {
  const x = centerQ.x / Q; const y = centerQ.y / Q;
  return x >= 34 && x <= WORLD_WIDTH - 34 && y >= 34 && y <= WORLD_HEIGHT - 34 && !obstacles.some((item) => x >= item.x - 34 && x <= item.x + item.width + 34 && y >= item.y - 34 && y <= item.y + item.height + 34);
}
export function shadowPassable(centerQ: VectorQ, obstacles: readonly Obstacle[]): boolean {
  const x = centerQ.x / Q; const y = centerQ.y / Q;
  return x >= SHADOW_RADIUS && x <= WORLD_WIDTH - SHADOW_RADIUS && y >= SHADOW_RADIUS && y <= WORLD_HEIGHT - SHADOW_RADIUS && !obstacles.some((item) => x >= item.x - SHADOW_RADIUS && x <= item.x + item.width + SHADOW_RADIUS && y >= item.y - SHADOW_RADIUS && y <= item.y + item.height + SHADOW_RADIUS);
}
export const playerPassable = (centerQ: VectorQ, obstacles: readonly Obstacle[]) => resolveDisplacement(centerQ, { x: 0, y: 0 }, obstacles, PLAYER_RADIUS);
export const lighthouseDistanceAtLeast = (point: VectorQ, pixels: number) => !withinRadius(point, LIGHTHOUSE, pixels - 1);
