// Player-following camera. The logical view is a 960x640 world-pixel rectangle
// centered on the player and clamped to the world bounds, exactly as the spawn
// safety rules define. The renderer maps world coordinates into a 3:2 rectangle
// fit inside the canvas backing store (letterboxed), independent of CSS size or
// device pixel ratio.

import { WORLD_HEIGHT, WORLD_WIDTH } from '../game/constants';
import { clamp } from '../game/geometry';

export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 640;

export type Camera = {
  left: number;
  top: number;
};

export function cameraFor(playerWorldX: number, playerWorldY: number): Camera {
  return {
    left: clamp(playerWorldX - VIEW_WIDTH / 2, 0, WORLD_WIDTH - VIEW_WIDTH),
    top: clamp(playerWorldY - VIEW_HEIGHT / 2, 0, WORLD_HEIGHT - VIEW_HEIGHT),
  };
}

export type Viewport = {
  /** Backing-store pixels. */
  backingWidth: number;
  backingHeight: number;
  /** The 3:2 letterboxed rectangle inside the backing store. */
  viewX: number;
  viewY: number;
  viewW: number;
  viewH: number;
  /** World-px to backing-px scale within the view rectangle. */
  scale: number;
};

export function computeViewport(backingWidth: number, backingHeight: number): Viewport {
  const aspect = VIEW_WIDTH / VIEW_HEIGHT; // 1.5
  let viewW = backingWidth;
  let viewH = backingWidth / aspect;
  if (viewH > backingHeight) {
    viewH = backingHeight;
    viewW = backingHeight * aspect;
  }
  return {
    backingWidth,
    backingHeight,
    viewX: (backingWidth - viewW) / 2,
    viewY: (backingHeight - viewH) / 2,
    viewW,
    viewH,
    scale: viewW / VIEW_WIDTH,
  };
}

export type Transform = {
  sx: (worldX: number, camera: Camera, vp: Viewport) => number;
  sy: (worldY: number, camera: Camera, vp: Viewport) => number;
};

export function screenX(worldX: number, camera: Camera, vp: Viewport): number {
  return vp.viewX + (worldX - camera.left) * vp.scale;
}
export function screenY(worldY: number, camera: Camera, vp: Viewport): number {
  return vp.viewY + (worldY - camera.top) * vp.scale;
}
export function screenScale(vp: Viewport): number {
  return vp.scale;
}
