import './styles.css';
import { createRound } from './game/world';
import { advance } from './game/reducer';
import { createInputController } from './game/input';
import { quantizeThumbVector } from './platform/input';
import { loadPreferences, savePreferences, type Preferences } from './platform/storage';
import { resolveReducedMotion } from './platform/preferences';
import { LIGHTHOUSE, Q, WORLD_HEIGHT, WORLD_WIDTH } from './game/constants';
import type { GameState } from './game/types';

type Screen = 'title' | 'playing' | 'paused' | 'won' | 'lost';
const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing application root');

const html = `
  <section class="shell" aria-label="Last Light game application">
    <header class="hud">
      <div class="brand"><span aria-hidden="true">✦</span><div><div class="eyebrow">A quiet arcade fable</div><h1>Last Light</h1></div></div>
      <output class="readout" id="status" role="status" aria-live="polite" aria-atomic="true">Choose Play to begin your lantern journey.</output>
      <div class="controls">
        <button id="play" type="button">Play</button><button id="pause" type="button" hidden>Pause</button>
        <button id="restart" type="button" hidden>Restart</button><button id="instructions" type="button">Instructions</button>
        <button id="settings" type="button">Settings</button>
      </div>
    </header>
    <section class="stage" data-gameplay-keyboard-surface aria-label="Game area">
      <canvas id="game" data-gameplay-keyboard-surface role="img" aria-label="Last Light game view" aria-describedby="tip" width="960" height="640"></canvas>
      <div id="thumb" class="thumb" role="slider" aria-label="Move thumb control" aria-valuetext="Use the thumb control to move" tabindex="0"></div>
    </section>
    <p id="tip" class="tip">Collect stars, return to the lighthouse to bank them, and keep your lantern glowing. Arrow keys or WASD move; P pauses.</p>
    <p id="alert" class="alert" role="alert" aria-live="assertive"></p>
  </section>
  <dialog id="modal"><h2 id="modal-title"></h2><div id="modal-body"></div><div class="dialog-actions" id="modal-actions"></div></dialog>`;
app.innerHTML = html;

const el = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const context = canvas.getContext('2d');
const status = el('status'); const alert = el('alert'); const play = el('play') as HTMLButtonElement;
const pause = el('pause') as HTMLButtonElement; const restart = el('restart') as HTMLButtonElement;
const instructions = el('instructions') as HTMLButtonElement; const settings = el('settings') as HTMLButtonElement;
const thumb = el('thumb'); const modal = document.querySelector<HTMLDialogElement>('#modal')!;
const modalTitle = el('modal-title'); const modalBody = el('modal-body'); const modalActions = el('modal-actions');
let screen: Screen = 'title'; let state: GameState | undefined; let lastFrame = performance.now(); let accumulator = 0; let frame = 0;
let opener: HTMLElement | undefined; let activePointer: number | undefined; let storageAvailable = true;
const input = createInputController();
let preferences: Preferences;
let audioContext: AudioContext | undefined; let audioFailed = false; let audioNoticeShown = false;
function audioNotice() { if (!audioNoticeShown) { audioNoticeShown = true; alert.textContent = 'Sound is unavailable. The game is still playable.'; } }
function audioFailure() { audioFailed = true; audioNotice(); try { void audioContext?.close(); } catch { /* optional platform cleanup */ } }
function activateAudio() {
  if (audioFailed || preferences.muted) return;
  try {
    const Constructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error('AudioContext unavailable');
    audioContext ??= new Constructor();
    void audioContext.resume().catch(audioFailure);
    const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.025, audioContext.currentTime); oscillator.frequency.setValueAtTime(196, audioContext.currentTime);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + 0.05);
  } catch { audioFailure(); }
}
function setAudioPaused(value: boolean) { if (!audioContext || audioFailed) return; try { const result = value ? audioContext.suspend() : audioContext.resume(); void result.catch(audioFailure); } catch { audioFailure(); } }
try { const result = loadPreferences(localStorage); preferences = result.value; if (!result.ok) { storageAvailable = result.reason !== 'unavailable'; alert.textContent = result.reason === 'unavailable' ? 'Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.' : 'Saved settings were invalid and have been reset to defaults. You can still play.'; } } catch { preferences = { version: 1, bestScore: 0, muted: false, highContrast: false, reducedMotion: 'system' }; storageAvailable = false; alert.textContent = 'Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.'; }

function button(label: string, action: () => void) { const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.addEventListener('click', action); return item; }
function save() { if (storageAvailable && !savePreferences(localStorage, preferences)) { storageAvailable = false; alert.textContent = 'Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.'; } }
function setContrast() { document.body.classList.toggle('high-contrast', preferences.highContrast); }
function isReduced() { return resolveReducedMotion(preferences.reducedMotion, () => matchMedia('(prefers-reduced-motion: reduce)').matches); }
function updateStatus() { const round = state; if (!round) { status.textContent = 'Choose Play to begin your lantern journey.'; return; } const energy = Math.floor(round.lantern.energyUnits / 600); const phase = screen === 'paused' ? 'Paused' : round.phase === 'won' ? 'The lighthouse shines!' : round.phase === 'lost' ? 'The forest has gone dark.' : 'Exploring'; status.textContent = `${phase}. Score ${round.score}. Banked ${round.bankedStars} of 20 stars. Carrying ${round.carriedStars.length} of 5. Lantern ${energy} percent.`; }
function updateControls() { const active = screen === 'playing' || screen === 'paused'; play.hidden = screen !== 'title'; pause.hidden = !active; restart.hidden = !active && screen !== 'won' && screen !== 'lost'; pause.textContent = screen === 'paused' ? 'Resume' : 'Pause'; }
function openDialog(title: string, body: string | Node, actions: HTMLButtonElement[], source: HTMLElement) { opener = source; modalTitle.textContent = title; modalBody.replaceChildren(); if (typeof body === 'string') modalBody.innerHTML = body; else modalBody.append(body); modalActions.replaceChildren(...actions); if (!modal.open) modal.showModal(); actions[0]?.focus(); }
function closeDialog() { if (modal.open) modal.close(); opener?.focus(); }
function showInstructions() { if (screen === 'playing') pauseGame('instructions'); openDialog('How to play', '<p>Collect lost stars, then return to the sleeping lighthouse to bank them. Bank 20 stars to win.</p><p>Move with Arrow keys, WASD, or the thumb control. Your lantern drains away from the lighthouse; its light repels shadows. A shadow touching you when the lantern is empty ends the round.</p><p>Pause any time with P or Escape. Settings are stored only on this device when available.</p>', [button('Close', closeDialog)], instructions); }
function showSettings() { if (screen === 'playing') pauseGame('settings'); const panel = document.createElement('div'); const contrast = button('High contrast', () => { preferences.highContrast = !preferences.highContrast; setContrast(); contrast.setAttribute('aria-pressed', String(preferences.highContrast)); save(); }); contrast.setAttribute('aria-pressed', String(preferences.highContrast)); const motion = button('Reduced motion', () => { preferences.reducedMotion = isReduced() ? 'off' : 'on'; motion.setAttribute('aria-pressed', String(isReduced())); save(); }); motion.setAttribute('aria-pressed', String(isReduced())); const mute = button('Mute', () => { preferences.muted = !preferences.muted; mute.setAttribute('aria-pressed', String(preferences.muted)); mute.textContent = preferences.muted ? 'Unmute' : 'Mute'; save(); }); mute.setAttribute('aria-pressed', String(preferences.muted)); panel.append(contrast, document.createTextNode(' '), motion, document.createTextNode(' '), mute); openDialog('Settings', panel, [button('Close', closeDialog)], settings); }
function start() { try { state = createRound(); screen = 'playing'; input.clear(); alert.textContent = ''; activateAudio(); updateControls(); updateStatus(); } catch { fatal(); } }
function pauseGame(reason = 'user') { if (screen !== 'playing') return; screen = 'paused'; input.interrupt('pause'); setAudioPaused(true); updateControls(); updateStatus(); if (reason === 'visibility') status.textContent = 'Welcome back — Resume when ready.'; }
function resume() { if (screen !== 'paused' || document.visibilityState === 'hidden') return; screen = 'playing'; setAudioPaused(false); updateControls(); updateStatus(); }
function confirmRestart() { if (screen === 'won' || screen === 'lost') { start(); return; } const previousScreen = screen; pauseGame(); openDialog('Restart this round?', '<p>Your current stars and score will be discarded.</p>', [button('Cancel', () => { closeDialog(); screen = previousScreen; updateControls(); updateStatus(); }), button('Restart', () => { closeDialog(); start(); })], restart); }
function fatal() { screen = 'lost'; input.interrupt('terminal'); alert.textContent = 'The game encountered a problem. Restart to try a new round.'; updateControls(); updateStatus(); }
function tick() { if (screen !== 'playing' || !state) return; try { const transition = advance(state, { kind: 'tick', movementQ: input.movementForTick() }); state = transition.state as GameState; if (state.phase === 'won' || state.phase === 'lost') { screen = state.phase; input.interrupt('terminal'); preferences.bestScore = Math.max(preferences.bestScore, state.score); save(); } updateControls(); updateStatus(); } catch { fatal(); } }
function draw() {
  if (!context) return; const ctx = context; const width = canvas.width; const height = canvas.height;
  ctx.clearRect(0, 0, width, height); const player = state?.player.centerQ ?? LIGHTHOUSE;
  const playerX = player.x / Q; const playerY = player.y / Q;
  const left = Math.max(0, Math.min(WORLD_WIDTH - 960, playerX - 480)); const top = Math.max(0, Math.min(WORLD_HEIGHT - 640, playerY - 320));
  const sx = width / 960; const sy = height / 640; const project = (x: number, y: number) => ({ x: (x - left) * sx, y: (y - top) * sy });
  const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, '#192a58'); sky.addColorStop(1, '#071225'); ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  if (state) for (const obstacle of state.obstacles) { const p = project(obstacle.x, obstacle.y); ctx.fillStyle = '#102f32'; ctx.fillRect(p.x, p.y, obstacle.width * sx, obstacle.height * sy); ctx.fillStyle = '#254d45'; ctx.beginPath(); ctx.arc(p.x + obstacle.width * sx * .25, p.y + obstacle.height * sy * .35, Math.min(obstacle.width * sx, obstacle.height * sy) * .32, 0, Math.PI * 2); ctx.arc(p.x + obstacle.width * sx * .72, p.y + obstacle.height * sy * .48, Math.min(obstacle.width * sx, obstacle.height * sy) * .38, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 80; i += 1) { const point = project((i * 283) % WORLD_WIDTH, (i * 149) % WORLD_HEIGHT); ctx.fillStyle = i % 6 ? '#33517a' : '#a8c7ee'; ctx.fillRect(point.x, point.y, 2, 2); }
  const lighthouse = project(1200, 800); ctx.fillStyle = '#ded3aa'; ctx.fillRect(lighthouse.x - 15 * sx, lighthouse.y - 48 * sy, 30 * sx, 64 * sy); ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(lighthouse.x, lighthouse.y - 52 * sy, 12 * sx, 0, Math.PI * 2); ctx.fill();
  if (state) { ctx.fillStyle = '#ffe680'; for (const star of state.availableStars) { const p = project(star.centerQ.x / Q, star.centerQ.y / Q); ctx.beginPath(); ctx.arc(p.x, p.y, 4 * sx, 0, Math.PI * 2); ctx.fill(); } ctx.fillStyle = '#14172c'; for (const shadow of state.shadows) { const p = project(shadow.centerQ.x / Q, shadow.centerQ.y / Q); ctx.beginPath(); ctx.arc(p.x, p.y, 11 * sx, 0, Math.PI * 2); ctx.fill(); } }
  const hero = project(playerX, playerY); ctx.fillStyle = '#fff4b5'; ctx.beginPath(); ctx.moveTo(hero.x, hero.y); ctx.lineTo(hero.x + 95 * sx, hero.y - 42 * sy); ctx.lineTo(hero.x + 95 * sx, hero.y + 42 * sy); ctx.fill(); ctx.fillStyle = '#fff7bd'; ctx.beginPath(); ctx.arc(hero.x, hero.y, 11 * sx, 0, Math.PI * 2); ctx.fill();
}
function loop(now: number) { const delta = Math.min(.25, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now; if (screen === 'playing') { accumulator += delta; let count = 0; while (accumulator >= 1 / 60 && count < 5) { accumulator -= 1 / 60; tick(); count += 1; } if (count === 5) accumulator = 0; } frame += 1; draw(); requestAnimationFrame(loop); }

play.addEventListener('click', start); pause.addEventListener('click', () => screen === 'playing' ? pauseGame() : resume()); restart.addEventListener('click', confirmRestart); instructions.addEventListener('click', showInstructions); settings.addEventListener('click', showSettings);
document.addEventListener('keydown', (event) => { const surface = (event.target as Element | null)?.closest?.('[data-gameplay-keyboard-surface]'); if (screen === 'playing' && surface && !event.altKey && !event.ctrlKey && !event.metaKey) { if (/^(Arrow|Key[WASD])/.test(event.code)) { input.keyDown(event.code); event.preventDefault(); } } if (event.key.toLowerCase() === 'p' || event.key === 'Escape') { if (screen === 'playing') pauseGame(); else if (screen === 'paused' && !modal.open) resume(); } if (event.key.toLowerCase() === 'm' && screen === 'playing') { preferences.muted = !preferences.muted; save(); if (preferences.muted) setAudioPaused(true); else { activateAudio(); setAudioPaused(false); } } if (event.key.toLowerCase() === 'r') confirmRestart(); });
document.addEventListener('keyup', (event) => input.keyUp(event.code));
document.addEventListener('visibilitychange', () => { if (screen === 'playing') pauseGame('visibility'); });
thumb.addEventListener('pointerdown', (event) => { if (activePointer !== undefined) return; activePointer = event.pointerId; thumb.setPointerCapture(event.pointerId); });
thumb.addEventListener('pointermove', (event) => { if (activePointer !== event.pointerId) return; const box = thumb.getBoundingClientRect(); input.setTouch(quantizeThumbVector(Math.trunc((event.clientX - (box.left + box.width / 2)) * 256), Math.trunc((event.clientY - (box.top + box.height / 2)) * 256))); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) thumb.addEventListener(name, () => { activePointer = undefined; input.releaseTouch(); });
setContrast(); updateControls(); updateStatus(); requestAnimationFrame(loop);
