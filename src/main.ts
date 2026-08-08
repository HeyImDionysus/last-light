import './styles.css';
import { createRound } from './game/world';
import { advance } from './game/reducer';
import { createInputController } from './game/input';
import { quantizeThumbVector } from './platform/input';
import { loadPreferences, savePreferences, type Preferences } from './platform/storage';
import { resolveReducedMotion } from './platform/preferences';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createAudioController } from './platform/audio';
import type { GameState } from './game/types';

type Screen = 'title' | 'playing' | 'paused' | 'won' | 'lost';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing application root');

app.innerHTML = `
  <section class="shell" aria-label="Last Light game application">
    <header class="hud">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">✦</span>
        <div>
          <div class="eyebrow">A quiet arcade fable</div>
          <h1>Last Light</h1>
        </div>
      </div>
      <div class="meters" aria-hidden="true">
        <div class="meter meter-stars"><span class="meter-label">Stars</span><span class="meter-val"><b id="banked">0</b>/<span id="bank-total">20</span></span></div>
        <div class="meter meter-carry"><span class="meter-label">Carrying</span><span class="meter-val"><b id="carried">0</b>/<span id="carry-max">5</span></span></div>
        <div class="meter meter-lantern">
          <span class="meter-label" id="lantern-label">Lantern ready</span>
          <span class="lantern-bar"><span class="lantern-fill" id="lantern-fill"></span></span>
        </div>
      </div>
      <div class="score-block">
        <div class="score"><span class="score-label">Score</span><b id="score">0</b></div>
        <div class="best">Best <b id="best">0</b></div>
      </div>
      <output class="readout" id="status" role="status" aria-live="polite" aria-atomic="true">Press Play to begin your lantern journey.</output>
      <div class="controls">
        <button id="play" type="button" class="btn-primary">▶ Play</button>
        <button id="pause" type="button" hidden>Pause</button>
        <button id="restart" type="button" hidden>Restart</button>
        <button id="instructions" type="button">How to play</button>
        <button id="settings" type="button">Settings</button>
      </div>
    </header>
    <section class="stage" data-gameplay-keyboard-surface aria-label="Game area">
      <canvas id="game" data-gameplay-keyboard-surface role="img" tabindex="-1" aria-label="Last Light game view" aria-describedby="tip"></canvas>
      <div id="title-overlay" class="title-overlay">
        <div class="title-card">
          <p class="title-tag">Carry the light through the dark.</p>
          <p class="title-sub">Gather fallen stars and guide them home to the sleeping lighthouse. The dark is patient — keep your lantern fed.</p>
        </div>
      </div>
      <div id="end-overlay" class="end-overlay" hidden>
        <div class="end-card">
          <h2 id="end-title"></h2>
          <p id="end-body"></p>
          <button id="end-action" type="button" class="btn-primary">Play again</button>
        </div>
      </div>
      <div id="thumb" class="thumb" role="slider" aria-label="Move thumb control" aria-valuetext="Drag to move" tabindex="0"></div>
    </section>
    <p id="tip" class="tip">Arrow keys or WASD to move · P to pause · Carry stars back to the lighthouse · Bank 20 to win</p>
    <p id="alert" class="alert" role="alert" aria-live="assertive"></p>
  </section>
  <dialog id="modal"><h2 id="modal-title"></h2><div id="modal-body"></div><div class="dialog-actions" id="modal-actions"></div></dialog>`;

const $ = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const statusEl = $('status');
const alertEl = $('alert');
const playBtn = $('play') as HTMLButtonElement;
const pauseBtn = $('pause') as HTMLButtonElement;
const restartBtn = $('restart') as HTMLButtonElement;
const instructionsBtn = $('instructions') as HTMLButtonElement;
const settingsBtn = $('settings') as HTMLButtonElement;
const thumb = $('thumb');
const titleOverlay = $('title-overlay');
const endOverlay = $('end-overlay');
const endTitle = $('end-title');
const endBody = $('end-body');
const endAction = $('end-action') as HTMLButtonElement;
const modal = document.querySelector<HTMLDialogElement>('#modal')!;
const modalTitle = $('modal-title');
const modalBody = $('modal-body');
const modalActions = $('modal-actions');

const renderer = createRenderer(canvas);
const input = createInputController();
const audio = createAudioController();
const hud = createHud({
  score: $('score'), banked: $('banked'), bankTotal: $('bank-total'),
  carried: $('carried'), carryMax: $('carry-max'),
  lanternFill: $('lantern-fill'), lanternLabel: $('lantern-label'), best: $('best'),
});

let screen: Screen = 'title';
let state: GameState | undefined;
let seedForRound: number | undefined;
let lastFrame = performance.now();
let frame = 0;
let opener: HTMLElement | undefined;
let activePointer: number | undefined;
let storageAvailable = true;
let preferences: Preferences;
let prevPhase: GameState['phase'] | undefined;
const recentCues = new Set<string>();

try {
  const result = loadPreferences(localStorage);
  preferences = result.value;
  if (!result.ok) {
    storageAvailable = result.reason !== 'unavailable';
    announce(result.reason === 'unavailable'
      ? 'Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.'
      : 'Saved settings were invalid and have been reset to defaults. You can still play.', false);
  }
} catch {
  preferences = { version: 1, bestScore: 0, muted: false, highContrast: false, reducedMotion: 'system' };
  storageAvailable = false;
  announce('Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.', false);
}

const isReduced = () => resolveReducedMotion(preferences.reducedMotion, () => matchMedia('(prefers-reduced-motion: reduce)').matches);
const applyContrast = () => document.body.classList.toggle('high-contrast', preferences.highContrast);

function announce(message: string, asAlert: boolean): void {
  // Single, one-time notices go to the alert region; status lines go to readout.
  if (asAlert) alertEl.textContent = message;
  else statusEl.textContent = message;
}

function save(): void {
  if (storageAvailable && !savePreferences(localStorage, preferences)) {
    storageAvailable = false;
    announce('Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.', false);
  }
}

function statusLine(): string {
  if (!state) return 'Press Play to begin your lantern journey.';
  const energy = Math.floor(state.lantern.energyUnits / 600);
  if (screen === 'paused') return 'Paused. Resume when ready.';
  if (state.phase === 'won') return `The lighthouse shines! Final score ${state.score}.`;
  if (state.phase === 'lost') return 'The forest has gone dark. Restart to try again.';
  return `Exploring. Score ${state.score}. Banked ${state.bankedStars} of 20. Carrying ${state.carriedStars.length} of 5. Lantern ${energy}%.`;
}

function refreshChrome(): void {
  const active = screen === 'playing' || screen === 'paused';
  playBtn.hidden = screen !== 'title';
  pauseBtn.hidden = !active;
  restartBtn.hidden = !active && screen !== 'won' && screen !== 'lost';
  pauseBtn.textContent = screen === 'paused' ? '▶ Resume' : '❚❚ Pause';
  titleOverlay.hidden = screen !== 'title';
  endOverlay.hidden = screen !== 'won' && screen !== 'lost';
  hud.update(state, preferences.bestScore, screen, statusLine());
  announce(statusLine(), false);
}

function makeSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) >>> 0 || 0x6d2b_79f5;
}

function startRound(): void {
  try {
    seedForRound = makeSeed();
    state = createRound(seedForRound);
    prevPhase = 'playing';
    screen = 'playing';
    input.clear();
    recentCues.clear();
    alertEl.textContent = '';
    audio.activate();
    refreshChrome();
    canvas.focus({ preventScroll: true });
  } catch {
    fatal();
  }
}

function fatal(): void {
  screen = 'lost';
  input.interrupt('terminal');
  announce('The game encountered a problem. Restart to try a new round.', true);
  refreshChrome();
}

function pauseGame(reason: 'user' | 'visibility' = 'user'): void {
  if (screen !== 'playing') return;
  screen = 'paused';
  input.interrupt('pause');
  audio.setPaused(true);
  refreshChrome();
  if (reason === 'visibility') announce('Welcome back — Resume when ready.', false);
}

function resume(): void {
  if (screen !== 'paused' || document.visibilityState === 'hidden') return;
  screen = 'playing';
  audio.setPaused(false);
  refreshChrome();
}

function confirmRestart(): void {
  if (screen === 'won' || screen === 'lost') { startRound(); return; }
  const previous = screen;
  pauseGame();
  openDialog('Restart this round?', '<p>Your current stars and score will be discarded.</p>', [
    button('Cancel', () => { closeDialog(); screen = previous; refreshChrome(); }),
    button('Restart', () => { closeDialog(); startRound(); }),
  ], restartBtn);
}

function endRound(phase: 'won' | 'lost'): void {
  screen = phase;
  input.interrupt('terminal');
  audio.setPaused(true);
  audio.play(phase === 'won' ? 'win' : 'lose');
  if (state && state.score > preferences.bestScore) {
    preferences.bestScore = state.score;
    save();
  }
  endTitle.textContent = phase === 'won' ? 'The lighthouse shines' : 'The forest has gone dark';
  endBody.textContent = phase === 'won'
    ? `You carried the last light home. Final score ${state?.score ?? 0}.`
    : `A shadow found you in the dark. Final score ${state?.score ?? 0}.`;
  endAction.textContent = phase === 'won' ? 'Play again' : 'Try again';
  refreshChrome();
}

function tick(): void {
  if (screen !== 'playing' || !state) return;
  try {
    const transition = advance(state, { kind: 'tick', movementQ: input.movementForTick() });
    state = transition.state as GameState;
    for (const event of transition.events) {
      if (event.kind === 'pickup') cue('pickup');
      else if (event.kind === 'deposit') cue('deposit');
    }
    if (state.phase === 'won' || state.phase === 'lost') {
      if (prevPhase !== state.phase) endRound(state.phase);
      return;
    }
    // Danger cue when an eligible shadow is close and the lantern is weak.
    if (state.lantern.energyUnits < 12000) {
      const danger = state.shadows.some((s) => s.graceTicks === 0 && dist(s.centerQ, state!.player.centerQ) < 220);
      if (danger) cue('danger');
    }
    prevPhase = state.phase;
  } catch {
    fatal();
  }
}

function cue(name: string): void {
  if (recentCues.has(name)) return;
  recentCues.add(name);
  audio.play(name as 'pickup');
  setTimeout(() => recentCues.delete(name), 220);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y) / 65536;
}

function loop(now: number): void {
  const delta = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (screen === 'playing') {
    let accumulator = delta;
    let count = 0;
    while (accumulator >= 1 / 60 && count < 5) { accumulator -= 1 / 60; tick(); count += 1; }
  }
  frame += 1;
  if (state) renderer.draw(state, frame, { reducedMotion: isReduced(), highContrast: preferences.highContrast });
  hud.update(state, preferences.bestScore, screen, statusLine());
  requestAnimationFrame(loop);
}

// ---- Dialogs ----
function button(label: string, action: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', action);
  return el;
}
function openDialog(title: string, body: string | Node, actions: HTMLButtonElement[], source: HTMLElement): void {
  opener = source;
  modalTitle.textContent = title;
  modalBody.replaceChildren();
  if (typeof body === 'string') modalBody.innerHTML = body; else modalBody.append(body);
  modalActions.replaceChildren(...actions);
  if (!modal.open) modal.showModal();
  actions[0]?.focus();
}
function closeDialog(): void {
  if (modal.open) modal.close();
  opener?.focus();
}
function showInstructions(): void {
  if (screen === 'playing') pauseGame();
  openDialog('How to play',
    '<p><b>Goal.</b> Gather fallen stars and bring them to the sleeping lighthouse. Bank <b>20 stars</b> to win.</p>' +
    '<p><b>Move.</b> Arrow keys or WASD on desktop, or drag the glowing thumb pad on touch.</p>' +
    '<p><b>Lantern.</b> It drains while you roam and recharges at the lighthouse. A lit lantern pushes shadows back. If a shadow reaches you with the lantern empty, the round ends.</p>' +
    '<p><b>Risk.</b> Carry more stars for a bigger bonus — but a heavier haul means a dimmer lantern and a longer walk home.</p>' +
    '<p>Pause any time with <b>P</b> or <b>Escape</b>. Settings are stored only on this device when available.</p>',
    [button('Close', closeDialog)], instructionsBtn);
}
function showSettings(): void {
  const panel = document.createElement('div');
  panel.className = 'settings-grid';
  const contrast = toggle('High contrast', preferences.highContrast, () => {
    preferences.highContrast = !preferences.highContrast; applyContrast(); save();
    contrast.setAttribute('aria-pressed', String(preferences.highContrast));
  });
  const motion = toggle('Reduced motion', isReduced(), () => {
    preferences.reducedMotion = isReduced() ? 'off' : 'on'; save();
    motion.setAttribute('aria-pressed', String(isReduced()));
  });
  const mute = toggle(preferences.muted ? 'Sound off' : 'Sound on', !preferences.muted, () => {
    preferences.muted = !preferences.muted; audio.setMuted(preferences.muted); save();
    mute.setAttribute('aria-pressed', String(!preferences.muted));
    mute.textContent = preferences.muted ? 'Sound off' : 'Sound on';
  });
  panel.append(contrast, motion, mute);
  openDialog('Settings', panel, [button('Close', closeDialog)], settingsBtn);
}
function toggle(label: string, pressed: boolean, action: () => void): HTMLButtonElement {
  const b = button(label, action);
  b.setAttribute('aria-pressed', String(pressed));
  return b;
}

// ---- Input wiring ----
playBtn.addEventListener('click', startRound);
pauseBtn.addEventListener('click', () => (screen === 'playing' ? pauseGame() : resume()));
restartBtn.addEventListener('click', confirmRestart);
instructionsBtn.addEventListener('click', showInstructions);
settingsBtn.addEventListener('click', showSettings);
endAction.addEventListener('click', startRound);

document.addEventListener('keydown', (event) => {
  const target = event.target as Element | null;
  const surface = target?.closest?.('[data-gameplay-keyboard-surface]');
  if (screen === 'playing' && surface && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (/^(Arrow|Key[WASD])/.test(event.code)) {
      input.keyDown(event.code);
      event.preventDefault();
      return;
    }
  }
  const k = event.key.toLowerCase();
  if (k === 'p' || event.key === 'Escape') {
    if (modal.open) { closeDialog(); return; }
    if (screen === 'playing') pauseGame();
    else if (screen === 'paused') resume();
  } else if (k === 'r') {
    confirmRestart();
  } else if (k === 'm') {
    preferences.muted = !preferences.muted; audio.setMuted(preferences.muted); save();
  }
});
document.addEventListener('keyup', (event) => input.keyUp(event.code));

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && screen === 'playing') pauseGame('visibility');
});

thumb.addEventListener('pointerdown', (event) => {
  if (activePointer !== undefined) return;
  activePointer = event.pointerId;
  thumb.setPointerCapture(event.pointerId);
  audio.activate();
});
thumb.addEventListener('pointermove', (event) => {
  if (activePointer !== event.pointerId) return;
  const box = thumb.getBoundingClientRect();
  input.setTouch(quantizeThumbVector(
    Math.trunc((event.clientX - (box.left + box.width / 2)) * 256),
    Math.trunc((event.clientY - (box.top + box.height / 2)) * 256),
  ));
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  thumb.addEventListener(name, () => { activePointer = undefined; input.releaseTouch(); });
}

// ---- Responsive canvas ----
function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
}
const ro = new ResizeObserver(resizeCanvas);
ro.observe(canvas);
window.addEventListener('resize', resizeCanvas);

applyContrast();
resizeCanvas();
refreshChrome();
requestAnimationFrame(loop);
