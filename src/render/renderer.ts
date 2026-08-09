// Pixel-art renderer. Reads GameState snapshots and blits hand-defined sprite
// pixel data with nearest-neighbour sampling for a crisp, deliberate look.
// The camera snaps to sprite-pixel boundaries so sprites don't shimmer.
// The player's walk frame cycles while moving; idle frame when still. The
// background (warm sky gradient, ground, distant treeline) is rasterised ONCE
// into an offscreen canvas and blitted with drawImage. The lantern glow is
// the only per-frame radial gradient. Backing store is snapped to an integer
// multiple of the 960x640 sprite view so the CSS-to-backing scale is always
// an integer (pixel-perfect rendering at any display size via
// image-rendering: pixelated on the canvas element).

import { Q, SAFE_RADIUS, MAX_ENERGY_UNITS } from '../game/constants';
import type { GameState } from '../game/types';
import {
  PLAYER_RIGHT_IDLE, PLAYER_RIGHT_WALK_1, PLAYER_RIGHT_WALK_2,
  PLAYER_DOWN_IDLE, PLAYER_DOWN_WALK_1, PLAYER_DOWN_WALK_2,
  PLAYER_UP_IDLE, PLAYER_UP_WALK_1, PLAYER_UP_WALK_2,
  TREE_SPRITES, STAR_SPRITE, STAR_BIG, SHADOW_SPRITE, SHADOW_MENACE, LIGHTHOUSE_SPRITE,
  blitFor, type BlitSprite,
} from './sprites';

export type RenderOptions = { reducedMotion: boolean; highContrast: boolean };

const VIEW_W = 960;
const VIEW_H = 640;
const TAU = Math.PI * 2;
const MAX_BACKING_W = 1920;
const MAX_DPR = 1.5;

  type Facing = 'up' | 'down' | 'left' | 'right';
  type AnimState = {
    lastPx: number;
    lastPy: number;
    walkTimer: number;
    moving: boolean;
    facing: Facing;
  };

export type Renderer = {
  resize: (cssWidth: number, cssHeight: number, devicePixelRatio: number) => void;
  draw: (state: GameState, frame: number, options: RenderOptions) => void;
};

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const acquired = canvas.getContext('2d', { alpha: false });
  if (!acquired) throw new Error('Canvas 2D unavailable');
  const ctx: CanvasRenderingContext2D = acquired;
  ctx.imageSmoothingEnabled = false;

  let backingW = 1920;
  let backingH = 1280;
  let spriteScale = 2;
  let bgCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  let bgCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  const anim: AnimState = {
    lastPx: 1200,
    lastPy: 800,
    walkTimer: 0,
    moving: false,
    facing: 'down',
  };

  const playerRightIdle = blitFor(PLAYER_RIGHT_IDLE);
  const playerRightWalk1 = blitFor(PLAYER_RIGHT_WALK_1);
  const playerRightWalk2 = blitFor(PLAYER_RIGHT_WALK_2);
  const playerDownIdle = blitFor(PLAYER_DOWN_IDLE);
  const playerDownWalk1 = blitFor(PLAYER_DOWN_WALK_1);
  const playerDownWalk2 = blitFor(PLAYER_DOWN_WALK_2);
  const playerUpIdle = blitFor(PLAYER_UP_IDLE);
  const playerUpWalk1 = blitFor(PLAYER_UP_WALK_1);
  const playerUpWalk2 = blitFor(PLAYER_UP_WALK_2);
  const starBlit = blitFor(STAR_SPRITE);
  const starBigBlit = blitFor(STAR_BIG);
  const shadowBlit = blitFor(SHADOW_SPRITE);
  const shadowMenaceBlit = blitFor(SHADOW_MENACE);
  const lighthouseBlit = blitFor(LIGHTHOUSE_SPRITE);
  const treeBlits = TREE_SPRITES.map(blitFor);

  function rebuildBackground(): void {
    if (!bgCtx) return;
    const w = backingW;
    const h = backingH;
    bgCtx.clearRect(0, 0, w, h);
    // Warm sky gradient — deliberately NOT blue.
    const sky = bgCtx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1a0e08');
    sky.addColorStop(0.55, '#2a1810');
    sky.addColorStop(1, '#3a2218');
    bgCtx.fillStyle = sky;
    bgCtx.fillRect(0, 0, w, h);
    // Warm ground band.
    const ground = bgCtx.createLinearGradient(0, h * 0.6, 0, h);
    ground.addColorStop(0, 'rgba(14,8,5,0)');
    ground.addColorStop(1, 'rgba(8,5,2,0.9)');
    bgCtx.fillStyle = ground;
    bgCtx.fillRect(0, h * 0.6, w, h * 0.4);
    // Distant treeline silhouette (warm dark).
    drawTreeline(bgCtx, w, h, '#1a0e08');
    drawTreeline(bgCtx, w, h, '#0e0805');

    drawGroundTexture(bgCtx, w, h);
    // Warm vignette.
    const vig = bgCtx.createRadialGradient(w / 2, h * 0.55, w * 0.32, w / 2, h * 0.55, w * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    bgCtx.fillStyle = vig;
    bgCtx.fillRect(0, 0, w, h);
  }

  function drawTreeline(target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number, color: string): void {
    const horizonY = h * 0.52;
    target.fillStyle = color;
    target.beginPath();
    target.moveTo(0, h);
    const seg = 40;
    for (let i = 0; i <= seg; i += 1) {
      const x = (i / seg) * w;
      const s = (i * 37 + 11) % 100;
      const hh = 24 + (s % 30) + Math.sin(i * 1.7) * 8;
      target.lineTo(x, horizonY - hh);
    }
    target.lineTo(w, h);
    target.closePath();
    target.fill();
  }

  function drawGroundTexture(target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number): void {
    const groundTop = Math.round(h * 0.62);
    const colors = ['#2a4a1f', '#1a3a18', '#3a2218', '#5a3828', '#1a1a08'];
    for (let i = 0; i < 180; i += 1) {
      const x = Math.floor(((i * 137 + 53) % w));
      const y = groundTop + Math.floor(((i * 73 + 19) % (h - groundTop)));
      const c = colors[i % colors.length]!;
      target.fillStyle = c;
      target.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 40; i += 1) {
      const x = Math.floor(((i * 251 + 17) % w));
      const y = groundTop + Math.floor(((i * 109 + 7) % (h - groundTop)));
      target.fillStyle = i % 2 === 0 ? '#4a2a18' : '#1a0e08';
      target.fillRect(x, y, 3, 1);
    }
  }

  function resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio || 1));
    const desired = Math.round(cssWidth * dpr);
    const snapped = Math.max(VIEW_W, Math.min(MAX_BACKING_W, Math.round(desired / VIEW_W) * VIEW_W));
    spriteScale = snapped / VIEW_W;
    backingW = snapped;
    backingH = Math.round(snapped / 1.5);
    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }
    ctx.imageSmoothingEnabled = false;
    if (typeof OffscreenCanvas !== 'undefined') {
      bgCanvas = new OffscreenCanvas(backingW, backingH);
    } else {
      const c = document.createElement('canvas');
      c.width = backingW; c.height = backingH;
      bgCanvas = c;
    }
    bgCtx = bgCanvas.getContext('2d');
    if (bgCtx) (bgCtx as { imageSmoothingEnabled?: boolean }).imageSmoothingEnabled = false;
    rebuildBackground();
  }

  function draw(state: GameState, frame: number, options: RenderOptions): void {
    const time = frame / 60;

    const px = state.player.centerQ.x / Q;
    const py = state.player.centerQ.y / Q;

    const camX = Math.round(px - VIEW_W / 2);
    const camY = Math.round(py - VIEW_H / 2);

    const dx = px - anim.lastPx;
    const dy = py - anim.lastPy;
    const speed = Math.hypot(dx, dy);
    anim.moving = speed > 0.3;
    if (anim.moving) {
      anim.walkTimer += 1;
      if (Math.abs(dx) >= Math.abs(dy)) {
        anim.facing = dx >= 0 ? 'right' : 'left';
      } else {
        anim.facing = dy >= 0 ? 'down' : 'up';
      }
    } else {
      anim.walkTimer = 0;
    }
    anim.lastPx = px;
    anim.lastPy = py;

    if (bgCanvas) ctx.drawImage(bgCanvas as CanvasImageSource, 0, 0);
    else { ctx.fillStyle = '#1a0e08'; ctx.fillRect(0, 0, backingW, backingH); }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W * spriteScale, VIEW_H * spriteScale);
    ctx.clip();

    ctx.imageSmoothingEnabled = false;

    const worldToScreenX = (wx: number) => Math.round((wx - camX) * spriteScale);
    const worldToScreenY = (wy: number) => Math.round((wy - camY) * spriteScale);

    const lx = worldToScreenX(1200);
    const ly = worldToScreenY(800);
    ctx.strokeStyle = options.highContrast ? 'rgba(255,255,255,0.5)' : 'rgba(255,184,77,0.22)';
    ctx.lineWidth = Math.max(1, spriteScale);
    ctx.beginPath();
    ctx.arc(lx, ly, SAFE_RADIUS * spriteScale, 0, TAU);
    ctx.stroke();

    for (const o of state.obstacles) {
      const blit = treeBlits[o.id % treeBlits.length]!;
      const ox = worldToScreenX(o.x + o.width / 2);
      const oy = worldToScreenY(o.y + o.height / 2);
      const dw = blit.width * spriteScale * 3;
      const dh = blit.height * spriteScale * 3;
      ctx.drawImage(blit.canvas as CanvasImageSource, ox - dw / 2, oy - dh / 2, dw, dh);
    }

    for (const star of state.availableStars) {
      const sx = worldToScreenX(star.centerQ.x / Q);
      const sy = worldToScreenY(star.centerQ.y / Q);
      const scale = 2;
      const useBig = star.id % 5 === 0;
      const blit = useBig ? starBigBlit : starBlit;
      const dw = blit.width * spriteScale * scale;
      const dh = blit.height * spriteScale * scale;
      const pulse = options.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(time * 3 + star.id);
      ctx.globalAlpha = pulse;
      ctx.drawImage(blit.canvas as CanvasImageSource, sx - dw / 2, sy - dh / 2, dw, dh);
    }
    ctx.globalAlpha = 1;

    // Shadows.
    const energyFraction = state.lantern.energyUnits / MAX_ENERGY_UNITS;
    for (const shadow of state.shadows) {
      const sx = worldToScreenX(shadow.centerQ.x / Q);
      const sy = worldToScreenY(shadow.centerQ.y / Q);
      const distToPlayer = Math.hypot(shadow.centerQ.x / Q - px, shadow.centerQ.y / Q - py);
      const menace = Math.max(0, Math.min(1, 1 - distToPlayer / (260)));
      const blit = menace > 0.3 ? shadowMenaceBlit : shadowBlit;
      const dw = blit.width * spriteScale * 2;
      const dh = blit.height * spriteScale * 2;
      ctx.drawImage(blit.canvas as CanvasImageSource, sx - dw / 2, sy - dh / 2, dw, dh);
    }

    // Lighthouse.
    {
      const dw = lighthouseBlit.width * spriteScale * 3;
      const dh = lighthouseBlit.height * spriteScale * 3;
      ctx.drawImage(lighthouseBlit.canvas as CanvasImageSource, lx - dw / 2, ly - dh / 2, dw, dh);
    }

    // Lantern glow — the single per-frame gradient (centered on player).
    const ppx = worldToScreenX(px);
    const ppy = worldToScreenY(py);
    if (!options.highContrast) {
      const lightR = (50 + energyFraction * 130) * spriteScale;
      const flicker = energyFraction < 0.25 && !options.reducedMotion ? 0.88 + 0.12 * Math.sin(time * 22) : 1;
      const light = ctx.createRadialGradient(ppx, ppy, 2 * spriteScale, ppx, ppy, lightR);
      const inner = 0.45 * energyFraction * flicker;
      light.addColorStop(0, `rgba(255,184,77,${inner})`);
      light.addColorStop(0.5, `rgba(255,224,128,${inner * 0.35})`);
      light.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(ppx, ppy, lightR, 0, TAU);
      ctx.fill();
    }

    {
      const table: Record<Facing, { idle: BlitSprite; a: BlitSprite; b: BlitSprite; mirror: boolean }> = {
        left: { idle: playerRightIdle, a: playerRightWalk1, b: playerRightWalk2, mirror: true },
        right: { idle: playerRightIdle, a: playerRightWalk1, b: playerRightWalk2, mirror: false },
        up: { idle: playerUpIdle, a: playerUpWalk1, b: playerUpWalk2, mirror: false },
        down: { idle: playerDownIdle, a: playerDownWalk1, b: playerDownWalk2, mirror: false },
      };
      const entry = table[anim.facing];
      const blit = options.reducedMotion || !anim.moving
        ? entry.idle
        : (Math.floor(anim.walkTimer / 6) % 2 === 0 ? entry.a : entry.b);
      const dw = blit.width * spriteScale * 4;
      const dh = blit.height * spriteScale * 4;
      const drawX = Math.round(ppx - dw / 2);
      const drawY = Math.round(ppy - dh / 2 + spriteScale * 3);
      if (entry.mirror) {
        ctx.save();
        ctx.translate(drawX + dw, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(blit.canvas as CanvasImageSource, 0, 0, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(blit.canvas as CanvasImageSource, drawX, drawY, dw, dh);
      }
    }

    ctx.restore();
  }

  return { resize, draw };
}
