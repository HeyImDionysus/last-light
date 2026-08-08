// Canvas 2D renderer. Reads GameState snapshots only and paints the dream forest:
// a player-following 960x640 camera, a lit lighthouse with a safe-zone ring,
// organic tree-thicket clusters (overlapping canopy blobs, not flat rectangles),
// glowing collectible stars, dark shadow creatures, and a focused warm lantern
// glow whose size tracks lantern energy. Reduced-motion disables drift/twinkle.
//
// Performance: the background (sky gradient + vignette) is rasterised ONCE into
// an OffscreenCanvas at resize and blitted with a single drawImage per frame.
// The lantern glow is the only per-frame radial gradient. Trees, stars, and
// shadows are plain solid fills (no per-entity gradients). The backing store
// is capped so a giant monitor + full DPR cannot lock the GPU.

import { Q, SAFE_RADIUS, SHADOW_RADIUS, PLAYER_RADIUS, MAX_ENERGY_UNITS } from '../game/constants';
import type { GameState, Obstacle } from '../game/types';
import { cameraFor, computeViewport, screenX, screenY, type Viewport, VIEW_WIDTH, VIEW_HEIGHT } from './camera';

export type RenderOptions = { reducedMotion: boolean; highContrast: boolean };

const TAU = Math.PI * 2;
const MAX_BACKING_W = 1600;
const MAX_DPR = 1.5;

type Canopy = { dx: number; dy: number; r: number; tone: number };
type CanopyEntry = { sig: string; canopy: Canopy[] };

function hash(n: number): number {
  let x = (n << 13) ^ n; x >>>= 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x << 5) ^ x; x >>>= 0;
  return x >>> 0;
}

function canopyFor(o: Obstacle): Canopy[] {
  const seed = hash(((o.id + 1) * 0x9e3779b1) ^ ((o.x | 0) * 0x85ebca6b) ^ ((o.y | 0) * 0xc2b2ae35));
  let s = seed >>> 0;
  const rand = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 0x1_0000_0000;
  };
  const cluster: Canopy[] = [];
  const count = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i += 1) {
    const lateral = (rand() - 0.5) * o.width * 0.85;
    const heightUp = (0.55 + rand() * 0.35) * o.height;
    const r = (0.38 + rand() * 0.28) * Math.min(o.width, o.height);
    cluster.push({ dx: lateral, dy: -(heightUp + r * 0.15), r, tone: rand() });
  }
  return cluster;
}

export type Renderer = {
  resize: (cssWidth: number, cssHeight: number, devicePixelRatio: number) => void;
  draw: (state: GameState, frame: number, options: RenderOptions) => void;
};

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const acquired = canvas.getContext('2d', { alpha: false });
  if (!acquired) throw new Error('Canvas 2D unavailable');
  const ctx: CanvasRenderingContext2D = acquired;

  let vp: Viewport = computeViewport(canvas.width, canvas.height);
  let bgCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  let bgCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  let ambient: { x: number; y: number; r: number; phase: number; speed: number }[] = [];
  let canopyCache = new Map<number, CanopyEntry>();
  let lastObstacleSig = '';

  function rebuildBackground(): void {
    if (!bgCtx) return;
    const w = vp.backingWidth;
    const h = vp.backingHeight;
    bgCtx.clearRect(0, 0, w, h);
    const sky = bgCtx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#070d20');
    sky.addColorStop(0.55, '#0f1a36');
    sky.addColorStop(1, '#16254a');
    bgCtx.fillStyle = sky;
    bgCtx.fillRect(0, 0, w, h);
    const vig = bgCtx.createRadialGradient(w / 2, h * 0.5, w * 0.28, w / 2, h * 0.5, w * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    bgCtx.fillStyle = vig;
    bgCtx.fillRect(0, 0, w, h);
  }

  function resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio || 1));
    const cssW = Math.max(320, Math.min(cssWidth, 1280));
    const desired = Math.round(cssW * dpr);
    const w = Math.max(1, Math.min(MAX_BACKING_W, desired));
    const h = Math.max(1, Math.round(w / 1.5));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    vp = computeViewport(w, h);
    if (typeof OffscreenCanvas !== 'undefined') {
      bgCanvas = new OffscreenCanvas(w, h);
    } else {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      bgCanvas = c;
    }
    bgCtx = bgCanvas.getContext('2d');
    rebuildBackground();
    const seedRand = (() => {
      let s = 0x51a7e3 >>> 0;
      return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x1_0000_0000; };
    })();
    ambient = Array.from({ length: 110 }, () => ({
      x: seedRand() * VIEW_WIDTH,
      y: seedRand() * VIEW_HEIGHT,
      r: 0.5 + seedRand() * 1.3,
      phase: seedRand() * TAU,
      speed: 0.4 + seedRand() * 1.4,
    }));
    canopyCache = new Map();
    lastObstacleSig = '';
  }

  function canopyForObstacle(o: Obstacle): Canopy[] {
    const sig = `${o.x},${o.y}`;
    const hit = canopyCache.get(o.id);
    if (hit && hit.sig === sig) return hit.canopy;
    const canopy = canopyFor(o);
    canopyCache.set(o.id, { sig, canopy });
    return canopy;
  }

  function detectNewRound(state: GameState): void {
    const sig = state.obstacles.length > 0
      ? `${state.obstacles[0]!.x},${state.obstacles[0]!.y}`
      : '';
    if (sig !== lastObstacleSig) {
      lastObstacleSig = sig;
      canopyCache = new Map();
    }
  }

  function draw(state: GameState, frame: number, options: RenderOptions): void {
    const time = frame / 60;
    detectNewRound(state);

    const px = state.player.centerQ.x / Q;
    const py = state.player.centerQ.y / Q;
    const camera = cameraFor(px, py);
    const reduced = options.reducedMotion;

    if (bgCanvas) ctx.drawImage(bgCanvas as CanvasImageSource, 0, 0);
    else { ctx.fillStyle = '#0a1230'; ctx.fillRect(0, 0, vp.backingWidth, vp.backingHeight); }

    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.viewX, vp.viewY, vp.viewW, vp.viewH);
    ctx.clip();

    const sx = (wx: number) => screenX(wx, camera, vp);
    const sy = (wy: number) => screenY(wy, camera, vp);
    const sc = vp.scale;

    // Ambient distant stars.
    for (const a of ambient) {
      const tw = reduced ? 0.75 : 0.55 + 0.45 * Math.sin(time * a.speed + a.phase);
      ctx.globalAlpha = 0.25 + 0.45 * tw;
      ctx.fillStyle = options.highContrast ? '#ffffff' : '#a8bce6';
      ctx.beginPath();
      ctx.arc(vp.viewX + a.x * sc, vp.viewY + a.y * sc, a.r * sc, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ground plane: a subtle dark floor so the figure stands on something.
    if (!options.highContrast) {
      const ground = ctx.createLinearGradient(0, vp.viewY + vp.viewH * 0.55, 0, vp.viewY + vp.viewH);
      ground.addColorStop(0, 'rgba(10,18,34,0)');
      ground.addColorStop(1, 'rgba(6,10,22,0.85)');
      ctx.fillStyle = ground;
      ctx.fillRect(vp.viewX, vp.viewY, vp.viewW, vp.viewH);
    }

    // Distant forest horizon: a continuous dark band of treeline at the horizon.
    if (!options.highContrast) {
      drawForestHorizon(ctx, camera, vp, sc);
    }

    // Horizon fog band for depth.
    if (!options.highContrast) {
      const fog = ctx.createLinearGradient(0, vp.viewY, 0, vp.viewY + vp.viewH);
      fog.addColorStop(0, 'rgba(8,13,29,0)');
      fog.addColorStop(1, 'rgba(8,13,29,0.4)');
      ctx.fillStyle = fog;
      ctx.fillRect(vp.viewX, vp.viewY, vp.viewW, vp.viewH);
    }

    // Lighthouse safe-zone ring.
    const lx = sx(1200); const ly = sy(800);
    ctx.beginPath();
    ctx.arc(lx, ly, SAFE_RADIUS * sc, 0, TAU);
    ctx.strokeStyle = options.highContrast ? 'rgba(255,255,255,0.45)' : 'rgba(255,215,120,0.18)';
    ctx.lineWidth = Math.max(1, 1.5 * sc);
    ctx.stroke();

    // Trees: solid dark canopy masses.
    for (const o of state.obstacles) {
      const ox = sx(o.x); const oy = sy(o.y);
      const ow = o.width * sc; const oh = o.height * sc;
      if (ox + ow < vp.viewX - 40 || ox > vp.viewX + vp.viewW + 40) continue;
      drawTree(ctx, ox, oy, ow, oh, canopyForObstacle(o), options.highContrast);
    }

    // Stars.
    for (const star of state.availableStars) {
      const x = sx(star.centerQ.x / Q);
      const y = sy(star.centerQ.y / Q);
      if (x < vp.viewX - 24 || x > vp.viewX + vp.viewW + 24 || y < vp.viewY - 24 || y > vp.viewY + vp.viewH + 24) continue;
      drawStar(ctx, x, y, 6 * sc, reduced ? 1 : 0.7 + 0.3 * Math.sin(time * 3 + star.id), options.highContrast);
    }

    // Shadows.
    const energyFraction = state.lantern.energyUnits / MAX_ENERGY_UNITS;
    for (const shadow of state.shadows) {
      const x = sx(shadow.centerQ.x / Q);
      const y = sy(shadow.centerQ.y / Q);
      const distToPlayer = Math.hypot(x - sx(px), y - sy(py));
      const menace = Math.max(0, Math.min(1, 1 - distToPlayer / (260 * sc)));
      drawShadow(ctx, x, y, SHADOW_RADIUS * sc, menace, reduced, time, shadow.id, options.highContrast);
    }

    // Lighthouse.
    drawLighthouse(ctx, lx, ly, sc, time, options);

    // Lantern glow — the single per-frame gradient.
    const ppx = sx(px); const ppy = sy(py);
    const lanternX = ppx + 14 * sc;
    const lanternY = ppy + 10 * sc;
    if (!options.highContrast) {
      const lightR = (70 + energyFraction * 180) * sc;
      const flicker = energyFraction < 0.25 && !reduced ? 0.88 + 0.12 * Math.sin(time * 22) : 1;
      const light = ctx.createRadialGradient(lanternX, lanternY, 2 * sc, lanternX, lanternY, lightR);
      const inner = 0.55 * energyFraction * flicker;
      light.addColorStop(0, `rgba(255,232,168,${inner})`);
      light.addColorStop(0.4, `rgba(255,210,130,${inner * 0.45})`);
      light.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, lightR, 0, TAU);
      ctx.fill();
    }

    // Player.
    drawPlayer(ctx, ppx, ppy, PLAYER_RADIUS * sc, options);

    // Lantern bulb (bright dot in hand, on top of the gradient).
    if (!options.highContrast) {
      ctx.fillStyle = '#fff7d4';
      ctx.beginPath();
      ctx.arc(lanternX, lanternY, Math.max(2, 3.5 * sc), 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  return { resize, draw };
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number, ow: number, oh: number,
  canopy: Canopy[],
  highContrast: boolean,
): void {
  ctx.save();
  // Trunk shadow at the base.
  if (!highContrast) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.ellipse(ox + ow / 2, oy + oh - 2, ow * 0.35, oh * 0.06, 0, 0, TAU);
    ctx.fill();
  }
  // Pass 1: a single solid dark silhouette that merges all canopy blobs into one mass.
  ctx.globalAlpha = 1;
  ctx.fillStyle = highContrast ? '#000' : '#060b18';
  for (const c of canopy) {
    const cx = ox + ow / 2 + c.dx * (ow / 160);
    const cy = oy + oh + c.dy * (oh / 160) - 4;
    const r = c.r * Math.min(ow, oh) / 60;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
  // Pass 2: subtle moonlight rim on the upper edge of the topmost blob only —
  // a narrow arc, not a full inset (so it reads as light catching the canopy,
  // not a donut hole).
  if (!highContrast) {
    let topBlob: Canopy | null = null;
    for (const c of canopy) {
      if (topBlob === null || c.dy < topBlob.dy) topBlob = c;
    }
    if (topBlob) {
      const cx = ox + ow / 2 + topBlob.dx * (ow / 160);
      const cy = oy + oh + topBlob.dy * (oh / 160) - 4;
      const r = topBlob.r * Math.min(ow, oh) / 60;
      ctx.strokeStyle = 'rgba(100,140,180,0.35)';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.95, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawForestHorizon(
  ctx: CanvasRenderingContext2D,
  camera: { left: number; top: number },
  vp: Viewport,
  sc: number,
): void {
  // A continuous dark treeline at the far horizon, parallax-locked to the camera
  // horizontally. Drawn as overlapping dark mounds so the forest never reads as
  // empty void, even when the player is in a clearing near the lighthouse.
  const horizonY = vp.viewY + vp.viewH * 0.48;
  const hillCount = 26;
  const span = vp.viewW + 240;
  const startX = vp.viewX - 120 - (camera.left * sc * 0.08) % span;
  ctx.fillStyle = '#080e1e';
  ctx.beginPath();
  ctx.moveTo(vp.viewX, vp.viewY + vp.viewH);
  for (let i = 0; i <= hillCount; i += 1) {
    const x = startX + (i / hillCount) * span;
    const seed = ((i * 37 + 11) | 0) % 100;
    const h = 24 + (seed % 30) + Math.sin(i * 1.7) * 8;
    ctx.lineTo(x, horizonY - h);
  }
  ctx.lineTo(vp.viewX + vp.viewW, vp.viewY + vp.viewH);
  ctx.closePath();
  ctx.fill();
  // A slightly darker nearer ridge for depth.
  ctx.fillStyle = '#050a16';
  ctx.beginPath();
  ctx.moveTo(vp.viewX, vp.viewY + vp.viewH);
  for (let i = 0; i <= hillCount; i += 1) {
    const x = startX + (i / hillCount) * span;
    const seed = ((i * 53 + 7) | 0) % 100;
    const h = 18 + (seed % 22) + Math.cos(i * 1.3) * 6;
    ctx.lineTo(x, horizonY + 8 - h);
  }
  ctx.lineTo(vp.viewX + vp.viewW, vp.viewY + vp.viewH);
  ctx.closePath();
  ctx.fill();
}

function drawStar(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  pulse: number, highContrast: boolean,
): void {
  if (!highContrast) {
    ctx.fillStyle = `rgba(255,230,150,${0.32 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.5, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = highContrast ? '#ffff00' : '#fff0b8';
  ctx.beginPath();
  ctx.arc(x, y, r * (0.85 + 0.15 * pulse), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = highContrast ? '#ffff00' : 'rgba(255,236,180,0.95)';
  ctx.lineWidth = Math.max(1, r * 0.32);
  ctx.beginPath();
  ctx.moveTo(x - r * 2.2, y); ctx.lineTo(x + r * 2.2, y);
  ctx.moveTo(x, y - r * 2.2); ctx.lineTo(x, y + r * 2.2);
  ctx.stroke();
}

function drawShadow(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  menace: number, reduced: boolean, time: number, id: number, highContrast: boolean,
): void {
  const wobble = reduced ? 0 : Math.sin(time * 4 + id) * 0.12;
  const rx = r * (1.45 + wobble);
  ctx.fillStyle = highContrast ? '#000' : (menace > 0.4 ? 'rgba(45,15,38,0.85)' : 'rgba(28,18,42,0.78)');
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.85, 0, 0, TAU);
  ctx.fill();
  if (menace > 0.12) {
    ctx.fillStyle = `rgba(255,90,80,${0.32 + menace * 0.55})`;
    ctx.beginPath();
    ctx.arc(x - r * 0.4, y - r * 0.1, r * 0.18, 0, TAU);
    ctx.arc(x + r * 0.4, y - r * 0.1, r * 0.18, 0, TAU);
    ctx.fill();
  }
}

function drawLighthouse(
  ctx: CanvasRenderingContext2D, x: number, y: number, sc: number,
  time: number, options: RenderOptions,
): void {
  const w = 22 * sc;
  const h = 62 * sc;
  ctx.fillStyle = options.highContrast ? '#ddd' : '#c8b48a';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + 14 * sc);
  ctx.lineTo(x - w / 3, y - h);
  ctx.lineTo(x + w / 3, y - h);
  ctx.lineTo(x + w / 2, y + 14 * sc);
  ctx.closePath();
  ctx.fill();
  if (!options.highContrast) {
    ctx.fillStyle = 'rgba(60,40,20,0.45)';
    ctx.fillRect(x - w / 2 - 1, y - 8 * sc, w + 2, 4 * sc);
  }
  const pulse = options.reducedMotion ? 0.85 : 0.72 + 0.28 * Math.sin(time * 2);
  if (!options.highContrast) {
    ctx.fillStyle = `rgba(255,220,130,${0.22 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y - h + 6 * sc, 38 * sc, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = options.highContrast ? '#fff' : '#ffe39a';
  ctx.beginPath();
  ctx.arc(x, y - h + 6 * sc, 6 * sc, 0, TAU);
  ctx.fill();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  options: RenderOptions,
): void {
  const cloak = options.highContrast ? '#ffffff' : '#5a3f72';
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.6);
  ctx.bezierCurveTo(x + r * 1.3, y - r * 0.4, x + r * 0.9, y + r * 1.3, x, y + r * 1.6);
  ctx.bezierCurveTo(x - r * 0.9, y + r * 1.3, x - r * 1.3, y - r * 0.4, x, y - r * 1.6);
  ctx.closePath();
  ctx.fill();
  if (!options.highContrast) {
    ctx.strokeStyle = 'rgba(180,155,220,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = options.highContrast ? '#ffffff' : '#3a2a4a';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.7, r * 0.7, 0, TAU);
  ctx.fill();
  if (!options.highContrast) {
    ctx.fillStyle = 'rgba(255,220,150,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.55, r * 0.2, r * 0.12, 0, 0, TAU);
    ctx.fill();
  }
}
