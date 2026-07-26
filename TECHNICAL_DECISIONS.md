# Last Light — Technical Decisions

Status: build-ready technical specification

Version: 1.1

Research access date: 2026-07-25 (UTC)

## 1. Architecture decision

Build Last Light as a TypeScript static site using Vite, HTML/CSS, and one Canvas 2D renderer. Use no runtime dependencies for the game itself. Use Vitest for pure-logic tests, Playwright for browser/end-to-end and accessibility smoke tests, and StrykerJS for mutation testing. This is the smallest maintainable stack that supports a deterministic simulation, browser automation, and a static distribution.

```
src/
  main.ts                 application composition; no rules
  game/
    constants.ts          immutable balance values
    types.ts              branded/domain types and snapshots
    rng.ts                seeded deterministic PRNG
    geometry.ts           pure vector/collision/spawn predicates
    reducer.ts            pure fixed-tick transition function
    world.ts              seeded world/round construction
    scoring.ts            pure score calculation
    input.ts              normalized input arbitration
  platform/
    storage.ts            guarded localStorage adapter and validation
    audio.ts              optional Web Audio adapter
    visibility.ts         lifecycle event adapter
    preferences.ts        matchMedia + local override adapter
  render/
    canvas-renderer.ts    reads snapshots only; procedural visuals
    hud.ts                semantic DOM status/control updates
    styles.css
  ui/
    controls.ts           native buttons, dialogs, touch-thumb component
  test/
    fixtures.ts           seeds and input timelines
```

`game/` imports no DOM, Canvas, audio, browser storage, clock, or random global. It receives a tick-sized action and immutable `GameState`, and returns next state plus presentation events. `render/` never mutates game state. `platform/` converts unreliable browser APIs into explicit success/failure results at the boundary. This separation permits deterministic replay, comprehensive unit tests, and renderer replacement without changing rules.

### Why no backend is justified

There is no user identity, shared state, server-side validation, secret, payment, multiplayer, content management, or data that must survive one browser. The only persistence is a noncritical local best score and preferences. A backend would add operational risk, privacy surface, cost, accounts/authentication questions, and network failure modes while providing no product value. Use browser-local storage only; do not add server code, cloud storage, telemetry, or a network client.

## 2. Runtime model and deterministic simulation

### Time

Use `requestAnimationFrame` only to schedule rendering. Accumulate elapsed monotonic frame time, clamp one frame delta to 250 ms, then run one reducer tick for each accumulated scheduler interval of `1/60` second, capped at five ticks per animation frame. That interval is scheduling metadata only: the reducer receives one tick, never an encoded or floating-point timestep. If the cap would be exceeded, discard excess elapsed time and record no gameplay catch-up; pausing/visibility handling ensures ordinary background throttling cannot trigger this path. Render the current snapshot (or interpolation using only prior/current snapshots) after simulation; interpolation must not feed back into gameplay.

No game rule may use `Date.now()`, frame count, rendering delta, `Math.random()`, timers, or wall-clock time. A new round starts with stored `tick = 0`. Each active reducer call first defines `currentTick = state.tick + 1`, uses that value for every cadence, due-tick, elapsed-time, and transition rule in the tick, and stores it in the returned state; paused, instructions, settings, hidden, and terminal states do not call the reducer or increment it. Thus tick 60 completes one active second and tick 720 is the first shadow opportunity at 12 seconds. Derive elapsed seconds as `tick / 60`. The round gets all random values from the one explicit 32-bit PRNG below; serialize its state in test snapshots.

`createRound(seed?: number)` is the only seed boundary. Tests and replays must pass a recorded unsigned 32-bit seed. In production with no supplied seed, request one `Uint32` from `crypto.getRandomValues`. If that API is absent or throws, use a separate session-only seed source initialized to `0x6D2B79F5`; return its current nonzero state for this round, then advance it once with the xorshift32 transition for the next fallback round. This fallback is genuinely playable but may repeat across page reloads; it consumes no gameplay PRNG value and needs no persistence. Normalize the selected seed with `seed >>> 0`; if zero, use `0x6D2B79F5`.

### Gameplay PRNG and integer mapping

The gameplay PRNG is **xorshift32**. Its state is one unsigned nonzero 32-bit integer `s`. One `nextU32()` call performs this exact transition and returns the new state as its output:

```ts
function nextU32(): number {
  let x = s >>> 0;
  x ^= (x << 13) >>> 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  s = x >>> 0;
  return s;
}
```

There is no second gameplay generator. `rngInt(min, max)` requires safe integer bounds with `0 <= max - min < 2**32`, uses an inclusive range, and is rejection-sampled so it has no modulo bias:

```ts
function rngInt(min: number, max: number): number {
  const span = max - min + 1;
  const limit = Math.floor(0x1_0000_0000 / span) * span;
  let value: number;
  do value = nextU32(); while (value >= limit);
  return min + (value % span);
}
```

Every call to `nextU32()`, including a value discarded by this rejection loop or by a rejected placement candidate, advances `s`. World construction consumes the gameplay stream in this order only: all obstacle candidates by obstacle ID and attempt, all initial-star candidates by star ID and attempt, then the one runtime-spawn stage on each active tick. That stage's total PRNG priority is due star respawn, due deferred shadow request, then a newly created same-tick global-cadence shadow request; its request-creation gates and exact processing semantics are in PRODUCT_SPEC.md. There is at most one pending request of each entity type. Within a request, consume each candidate's coordinate calls in the order PRODUCT_SPEC.md states, including all calls for rejected candidates. No request work occurs outside that stage. Cosmetics use a separately seeded non-gameplay generator and may not consume `s`.

### Q16.16 geometry and normalization

Gameplay positions, vectors, speeds, and distances use signed Q16.16 integers: one world pixel is `65,536`. The origin is the world’s upper-left; `+x` is right and `+y` is down. For all signed integer divisions below, `trunc0(a / b)` means the quotient rounded toward zero. `isqrt(n)` for nonnegative integer `n` is the greatest nonnegative integer `r` such that `r*r <= n`; it is integer-only, never a floating-point square root. A nonzero Q16.16 vector `(dx, dy)` is normalized exactly as follows:

```ts
const Q = 65_536;
const len = isqrt(dx * dx + dy * dy); // Q16.16, rounded down
const unitX = trunc0((dx * Q) / len);
const unitY = trunc0((dy * Q) / len);
```

`len` is nonzero whenever either component is nonzero. Every Q16.16 multiplication is `mulQ(a, b) = trunc0((a * b) / Q)`; evaluate multi-factor products left-to-right in source order. `encodeQ(i)` for an integer is exactly `i * Q`. If a noninteger decimal rate is ever stated as digits `p / 10^d`, convert those written digits as the exact rational `encodeQDecimal(p, d) = trunc0((p * Q) / 10^d)`; do not first parse a binary floating-point value. Negative values use the same signed truncation toward zero. Current movement rates (230, `92 + 4 * floor(bankedStars / 5)`, and 300 px/s) are integers, so their encodings are exact.

For every velocity-derived per-tick displacement component, the only permitted operation order is:

```ts
const rateQ = encodeQ(ratePixelsPerSecond); // or encodeQDecimal for a stated decimal
const velocityQ = mulQ(unitComponentQ, rateQ);
const displacementQ = trunc0(velocityQ / 60);
```

The integer `60` is the tick frequency, not a Q16.16 value. Never encode `1/60`, multiply by `1,092`, or reassociate the product and division. For an east unit vector at 92 px/s, `rateQ = 6,029,312`, `velocityXQ = 6,029,312`, and `displacementXQ = trunc0(6,029,312 / 60) = 100,488` (with `displacementYQ = 0`); west yields `-100,488`, proving signed truncation is toward zero. The Q16.16 value `100,488` is the exact contractual per-tick result, not the `100,464` produced by multiplying by an encoded `1/60`.

Do not use floating-point arithmetic, `Math.hypot`, or engine-specific rounding in gameplay geometry. For the stated world bounds, Q16.16 positions differ by less than `2,400 * Q` in x and `1,600 * Q` in y; their squared sum and all displayed normalization/multiplication intermediates fit signed 64-bit integers. Implementations without signed 64-bit intermediates must use a wider exact integer type, and invariant-fail rather than wrap on a value outside these assumptions.

For either zero-length `toPlayer` or zero-length lighthouse radial vector, use this exact `shadowId mod 8` fallback table. Its diagonal component is the fixed Q16.16 integer `46,341` (not a recomputed approximation):

| `shadowId mod 8` | Direction | `(unitX, unitY)` Q16.16 |
|---:|---|---:|
| 0 | east | `(65536, 0)` |
| 1 | south-east | `(46341, 46341)` |
| 2 | south | `(0, 65536)` |
| 3 | south-west | `(-46341, 46341)` |
| 4 | west | `(-65536, 0)` |
| 5 | north-west | `(-46341, -46341)` |
| 6 | north | `(0, -65536)` |
| 7 | north-east | `(46341, -46341)` |


### Reducer contract

```ts
type TickAction = {
  kind: 'tick';
  movementQ: { x: number; y: number }; // signed Q16.16 integers; magnitude <= Q
};

type Transition = {
  state: Readonly<GameState>;
  events: readonly GameEvent[]; // e.g. deposited, repelled, won, lost
};

function advance(state: Readonly<GameState>, action: TickAction): Transition;
```

The reducer rejects invalid state/action at the domain boundary in development/tests (non-safe integer, invalid enum, `isqrt(x*x + y*y) > Q` for movement, out-of-range energy, duplicate ID). Using the same integer norm deliberately accepts the contractual `(±46_341, ±46_341)` diagonal. Production UI does not intentionally construct invalid actions: the input boundary emits only the declared integer range. Do not catch-and-ignore a reducer invariant failure; surface it to the application error boundary, stop the round, and show a plain “The game encountered a problem. Restart to try a new round.” message. Preserve the original error in console diagnostics only; do not expose internal details to the player.

### Exact lantern energy

Lantern energy is not Q16.16 geometry. Store it as integer `energyUnits` with exactly 600 units per displayed energy point: minimum `0`, maximum `60_000`. On step 2 of each active tick, add exactly `400` units inside the safe radius or subtract exactly `48` units outside it, then clamp to `[0, 60_000]`. These are exactly `40/60` and `4.8/60` energy per active tick: passive recharge from zero reaches 100 after 150 ticks (2.5 active seconds), with no truncation remainder. `lanternEnergy > 0` means `energyUnits > 0`; `floor(preRefillLanternEnergy)` means integer division `floor(energyUnits / 600)`. A real step-6 deposit sets `energyUnits = 60_000`; a zero-carried visit does not. Snapshots and replay state store `energyUnits`.

The canonical transition/event ordering and constants are in PRODUCT_SPEC.md. Tests must snapshot selected ticks of seed + ordered input timelines, including spawn deferrals and simultaneous deposit/collision edge cases.

## 3. Rendering, graphics, and responsive behavior

- The logical world is 2,400 × 1,600, but the renderer's logical view is exactly the 960 × 640 simulation-camera rectangle from PRODUCT_SPEC.md, centered on the latest post-tick player position and clamped with the same formula. Calculate a 3:2 CSS display rectangle that fits the available game area, letterbox it, and set backing dimensions to `round(cssWidth * devicePixelRatio)` / `round(cssHeight * devicePixelRatio)`. CSS size never changes the camera's world extent or spawn predicates.
- Cap effective device pixel ratio at 2.0 to control fill rate; never let this modify logical positions/collisions.
- Resize using `ResizeObserver` (with window `resize` fallback if needed); renderer recalculates only view transform and backing store. It does not recreate a round.
- Canvas 2D is appropriate because the world is small and uses simple procedural shapes; it avoids a rendering engine dependency and works across the stated browser set. Draw low-cost layers in order: flat background, deterministic tree silhouettes, static stars/entities, player/light cone, then optional particles/fog.
- Do not fetch fonts, images, shaders, sprites, audio, or JSON. CSS uses system fonts; visual and sonic data are locally generated.
- High contrast is a CSS/application setting that changes named design tokens. Game state includes semantic lantern/shadow/star states; renderer must pair color with silhouettes, outlines, and HUD text.
- Reduced motion disables camera shake, parallax/fog drift, nonessential particle updates, pulsing, and animated transitions. It does not slow or change game rules.

## 4. Input and UI boundary

### Keyboard

Maintain a `Set<code>` for physical keyboard codes. Recognize `ArrowUp/Down/Left/Right` and `KeyW/A/S/D`; ignore `event.repeat` for state mutation (sets are idempotent). On `keyup`, delete. On application focus loss, visibility change, state change to pause/terminal, or dialog open, clear the set. Convert summed axis components to one `movementQ` vector per simulation tick: cardinal components are exactly `±65_536`; diagonal components are exactly `±46_341` from the fixed table above; opposite keys cancel on their axis.

Mark only the non-content application-shell background and game canvas with an explicit gameplay-keyboard-surface attribute. Keyboard handlers mutate movement state and call `preventDefault()` for a recognized movement code only while `playing`, no modifier key is active, no modal dialog is open, and `event.target.closest('[data-gameplay-keyboard-surface]')` exists. Never put that attribute on the HUD, instructions, settings, status text, or any interactive/editable element. Exclude any target within `button`, `input`, `select`, `textarea`, `summary`, `a[href]`, `[contenteditable]`, or `[role="textbox"]`, any native/fallback dialog and all of its contents, and ordinary document content. Excluded targets keep normal Arrow/WASD behavior and do not enter the held-key set. Escape/P/M use native button-equivalent commands without cancelling browser-reserved combinations.

### Touch thumb control

Use Pointer Events on a visible native labelled control surface with `touch-action: none`. Its maximum displacement radius is 44 CSS px. On `pointerdown`, accept only the first primary pointer, call `setPointerCapture(pointerId)`, record its ID and center. On `pointermove`, ignore other IDs; convert each `(client - center)` component to signed integer 1/256 CSS-pixel units with truncation toward zero, apply the 12 px dead zone as squared integer distance `<= (12 * 256)^2`, and emit `{0,0}` inside it. Outside it, let `len = isqrt(dx*dx + dy*dy)`; if `len > 44 * 256`, replace each component with `trunc0(component * 44 * 256 / len)`, then normalize the resulting vector with the exact integer Q16.16 algorithm above and emit that `movementQ`. Replay records this quantized action rather than raw pointer coordinates. On `pointerup`, `pointercancel`, `lostpointercapture`, pause, or terminal state, zero it and clear active ID. The control has a non-canvas text label and a 44 × 44 CSS px minimum target, although its visual hit area should be at least 112 px.

### Arbitration

The input module receives timestamped state changes from keyboard and thumb. Each source has `vector`, `lastChangedSequence`, and active flag. On each tick choose the non-zero source with greatest `lastChangedSequence`; ties prefer keyboard for deterministic tests. Releasing the selected source immediately selects the remaining latest source or `{0,0}`. Neither source generates movement while paused/terminal/hidden. This avoids summing input vectors, which would create unintentional faster diagonal motion on hybrids.

### Semantic DOM

Use a semantic application region containing:

- `h1` game title; instructions reachable before Play.
- Canvas with `role="img"`, `aria-label="Last Light game view"`, and `aria-describedby` pointing to current concise instructions; canvas is not focusable unless a tested purpose requires it.
- Native `button` elements for Play, Pause/Resume, Restart, Mute, High contrast, Reduced motion, and Instructions; toggle state uses `aria-pressed`.
- A text HUD (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) for score, banked/carried stars, lantern band, and pause state. Update on meaningful changes only (deposit, energy band boundary of 25, status change), never every tick.
- A terminal/error announcement (`role="alert"`) for win and loss, plus separate one-time alerts for corrupt-data reset, saving unavailable, and audio unavailable.
- Modal instructions/settings use native `<dialog>` where supported, with a tested fallback that traps focus only while open, restores focus to opener, and offers Escape/close.

## 5. Persistence design and validation

One localStorage key is used: `last-light:preferences:v1`. Do not persist current round state, identifiers, device information, events, or any personal data.

### Stored JSON schema

```json
{
  "version": 1,
  "bestScore": 0,
  "muted": false,
  "highContrast": false,
  "reducedMotion": "system"
}
```

Constraints:

- The serialized string must be no more than 1,024 UTF-16 code units; reject longer values before JSON parsing.
- Root is a plain object, not `null`, array, or prototype-bearing unexpected value.
- `version` is exactly integer `1`.
- `bestScore` is a safe integer in `[0, 1_000_000]`.
- `muted` and `highContrast` are booleans.
- `reducedMotion` is exactly `"system"`, `"on"`, or `"off"`.
- Unknown keys are ignored, not copied. Invalid/missing known values cause the entire stored payload to be rejected and defaults used.

### Adapter behavior

`loadPreferences(): { ok: true; value: Preferences } | { ok: false; value: Defaults; reason: 'unavailable' | 'invalid' }` wraps `getItem` and parsing. `invalid` means `getItem` succeeded but the payload failed parsing or schema validation; `unavailable` means storage access threw. `savePreferences()` validates the outgoing value, serializes it, then wraps `setItem`; it returns `false` on any Storage/serialization exception. It does not rethrow from UI event handlers or cause a game reset.

On `invalid`, use defaults and issue the exact one-time corrupt-data reset notice in PRODUCT_SPEC.md. Do not delete the malformed value immediately and do not mark storage unavailable; a later explicit user setting change or terminal best-score update must still attempt a validated write, and success replaces the corrupt value. On load `unavailable`, or after any `savePreferences()` failure, issue the exact one-time saving-unavailable notice, mark storage unavailable for this page session, skip further writes, and retain in-memory preferences. Coalesce eligible writes after user settings changes and terminal best-score updates; avoid per-tick writes. This is deliberate recovery: storage is optional, the two failure classes remain distinguishable, and neither failure is silent.

Use `matchMedia('(prefers-reduced-motion: reduce)')` only to resolve `reducedMotion: "system"`; explicit local choice takes precedence. If `matchMedia` fails or is unavailable, treat system preference as no preference and continue.

## 6. Audio boundary and fallback

Audio is synthesized with the Web Audio API: short oscillator/noise envelopes for pickup, deposit, lantern danger, repulsion, loss, and win. It uses no samples and no network access.

- Do not create or resume an `AudioContext` until a direct user activation (Play or explicit unmute).
- `AudioController` is best-effort: its public methods return `void`/a status result and must not change gameplay state.
- Catch only expected platform failures at this boundary (constructor/resume/oscillator scheduling); set the controller to disabled, release/suspend resources if possible, emit a single `audio-unavailable` presentation event, and continue silently. Keep failures visible to developer diagnostics without leaking internals to the player.
- If mute is on, do not attempt scheduling. On pause/hidden state, suspend context if supported; on resume, attempt resume only after a user gesture. If that attempt fails, continue muted.
- Use a master gain node; ramp gain smoothly (about 20 ms) on mute to avoid clicks. Limit simultaneous voices to eight, dropping lowest-priority cosmetic sounds first. Audio must never delay a reducer tick.

## 7. Error boundaries, lifecycle, and privacy

Treat these as distinct boundaries:

| Boundary | Failure policy |
|---|---|
| Pure game logic invariant | Fail the current round loudly, preserve causal error in developer diagnostics, give player a plain restart message. Never fabricate a game state. |
| Renderer draw/setup | Attempt one canvas resize/context recovery; if it remains unavailable, stop and show “This browser cannot draw the game. Try updating your browser or restarting.” |
| Corrupt stored payload | Use in-memory defaults, show the one corrupt-data reset notice, keep later explicit writes eligible, and continue play. |
| Storage access/write | Retain state in memory, show the one saving-unavailable notice, disable later writes for this page session, and continue play. |
| Audio | Disable sound, show one sound-unavailable notice, continue play. |
| Preference query | Use default preference, continue play. |
| Pointer/keyboard events | Normalize and ignore unrecognized input; clear recognized held state on interruption. |

Add no error reporting service, tracking pixel, remote logging, or analytics. Console diagnostics may be available locally during development but must contain no stored preference payload or identifying information in production builds. Static hosting is not a runtime dependency; a manual offline/network-blocked smoke test is required.

Visibility, in-round modal return, and Restart transitions are specified in PRODUCT_SPEC.md. Register event listeners once at application startup and remove them on teardown. The fixed-tick scheduler advances only in `playing` while the document is visible; `requestAnimationFrame` rendering can still render a paused, instructions, or settings overlay but must not mutate simulation. Resume is a user action accepted only while visible and always continues the preserved round.

## 8. Test and quality strategy

### Unit tests: Vitest

Use Vitest for `game/` and `platform/` modules. It should run in Node by default, with browser-like tests only where DOM APIs are required. Required examples:

- Exact xorshift32 transition/output, zero-seed normalization, inclusive rejection-sampled `rngInt`, PRNG-state snapshots, and seeded world/input timeline snapshots.
- Every balance boundary: 0/positive lantern, carry 0/5, 19/20/over-goal banked, shadow-speed steps at banked totals 4/5/9/10/14/15/19/20, pre-refill score floor, capped spawn retries, and collision grace expiry.
- Simultaneous star pickup/deposit/passive recharge/refill/win/collision ordering from the product spec, including all three deposit-time score components, a real deposit's instant refill, a zero-carried visit's passive-only recharge, and a winning deposit with a colliding empty-lantern shadow.
- Initial-star ID/band quotas and candidate consumption; exactly 24 obstacle IDs or a construction invariant failure after an exhausted 256-attempt ID; obstacle and respawn acceptance/rejection; other 32-attempt failures, 60-active-tick deferral, ID allocation, swept-circle ties, and spawn property tests across at least 1,000 fixed seeds: all accepted obstacles/stars/shadows obey stated geometry; deferred spawns do not mutate count. Assert that world generation starts successfully for every deterministic seed from 0 through 999. Include a tick where star cadence, due star retry, due shadow retry, and global shadow cadence coincide; assert the exact request gates, PRNG-state checkpoints, post-deferred cadence behavior, and append order.
- Shadow tests for exact positive/negative Q16.16 per-tick arithmetic (including east/west 92 px/s yielding `±100,488`), the post-pursuit `<= 155 px` predicate, exactly one 5 px repel attempt per tick (including overlap), terrain-shortening behavior, grace reset/expiry, and no collision-stage repulsion. Assert that a newly spawned shadow moves and may repel on its spawn tick but leaves that tick with grace 21.
- Input sets, dead zone, pointer cancellation, hybrid recency arbitration, focus/visibility clearing, all pause reasons, visible-only user Resume, and title-/round-origin Instructions close behavior without round recreation.
- Keyboard boundary tests proving movement cancellation occurs on the gameplay surface only and never on native controls, links, editable/contenteditable targets, dialog contents, ordinary content, modified keys, or non-playing states.
- Storage: missing key, blocked get/set (throwing mocks), invalid JSON, `null`, array, oversized data, wrong version/types/ranges, and valid round-trip. Assert invalid data produces only the reset notice and remains write-eligible; access/write failure produces only the saving-unavailable notice and suppresses later writes.
- Audio adapter constructor/resume/scheduling failures; game transition remains identical with audio disabled.
- Preference resolution and reduced-motion override precedence.

### Browser tests: Playwright

Use Playwright’s isolated browser contexts and accessible locators (`getByRole`, `getByLabel`, `getByText`) rather than brittle implementation selectors. Configure projects for current Chromium, Firefox, and WebKit; WebKit is the automated proxy for Safari behavior, but it does not replace required manual Safari smoke testing. Required flows:

- Keyboard and touch-capable viewport movement, Play/Pause/Resume/Restart/Mute/settings, in-round Instructions automatic pause, and close-to-the-same-paused-round behavior.
- Visibility simulation or a test seam to prove the `visibility` pause reason, no tick/drain while hidden, no auto-resume, rejected hidden Resume, and user Resume of the preserved round after return.
- High contrast/reduced motion visual-state assertions; emulate reduced motion where supported.
- Keyboard focus traversal, movement-key default behavior in each excluded target class, instructions dialog focus/return behavior, and terminal status presence.
- Storage denied/corrupted/write-failed and audio-unavailable paths with the distinct specified notices and successful play.
- Offline/network route guard: fail test if any request other than the initial static document/local bundled modules is attempted; production build contains no remote URLs.
- Viewports: 320×568, 768×1024, and 1440×900, with a touch project. Screenshot regressions cover title, active play, paused, won, lost, high contrast, and reduced motion.

Run axe-core (or equivalent maintained accessibility scanner) only as a supplement; automated scans cannot certify keyboard, contrast of canvas content, touch target usability, or screen-reader announcement quality. Manual acceptance must include Chrome+NVDA on Windows, Safari+VoiceOver on macOS/iOS where available, and Firefox keyboard navigation. The release browser matrix is the latest two major stable versions of Chrome, Firefox, Safari, and Edge at the time of release; exact versions and test dates belong in release evidence, not hardcoded product logic.

### Mutation tests: StrykerJS

Use StrykerJS with the Vitest runner against `src/game/**/*.ts`, `src/platform/storage.ts`, and `src/platform/input.ts`. Do not mutate canvas drawing/audio orchestration initially. Set an initial quality gate of at least 80% mutation score and 90% covered mutation score; every surviving mutant must be examined, classified (equivalent/irrelevant/real gap), and either killed by a meaningful test or explicitly justified in review. Do not exclude logic merely to improve the metric.

### Commands to provide in implementation

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:mutation": "stryker run",
    "preview": "vite preview"
  }
}
```

Pin tool versions in the lockfile and use the package manager’s immutable/locked install mode in CI. Do not claim tool behavior based only on this specification; implementation must verify current tool configuration against their official documentation and execute the commands.

## 9. Performance budgets and measurement

Test the production build, not a development server, using these two named, reproducible profiles. Record the exact browser build, OS build, device model (where applicable), date, and commit in release evidence; a result from another device is supplementary and cannot replace either profile.

1. **Desktop-Reference:** Chrome 126.0.6478.182 (64-bit) on Linux x86_64, 1440×900 CSS px, device scale factor 1, DevTools Performance panel CPU throttling **No throttling**, cache disabled. Run `npm run build && npm run preview -- --host 127.0.0.1 --port 4173`, open the local URL in a fresh Chrome profile, and record a Performance trace with screenshots and JS sampling enabled.
2. **Mobile-Emulated-4x:** the same Chrome build and host, DevTools device emulation set to **Moto G4**, 360×640 CSS px, device scale factor 3, CPU throttling **4× slowdown**, cache disabled, and the same local production server. This is an emulated low-end profile, not a claim about physical Android hardware.

For each profile, use the deterministic fixture that holds maximum active shadows and maximum enabled cosmetic particles, then drive a repeatable 60-second circular movement input. Do one 15-second unrecorded warm-up, collect exactly one 60-second trace, and report p95 from all `Frame` durations in the recorded interval (nearest-rank percentile: sorted value at `ceil(0.95 × N)`). A frame/long-task budget passes only if every reported metric is within its table limit. Repeat each profile three times in a fresh tab; the profile passes only if all three runs pass. Browser extensions, DevTools overlays, tracing startup/shutdown, and the first 15 seconds are excluded only as stated, never selectively removed.

| Metric | Budget | Measurement |
|---|---:|---|
| Initial compressed JS/CSS | <= 250 KB gzip, excluding browser-native APIs | Build artifact analysis. |
| Runtime network requests after load | 0 | DevTools/Playwright route guard. |
| Steady active-play frame time, Desktop-Reference | p95 <= 16.7 ms in each of 3 runs | Prescribed 60 s trace protocol. |
| Steady active-play frame time, Mobile-Emulated-4x | p95 <= 33.3 ms in each of 3 runs | Prescribed 60 s trace protocol. |
| Long task | no task > 50 ms in any recorded run | Prescribed 60 s trace protocol. |
| Heap growth | <= 5 MB median net growth across 3 runs | On Desktop-Reference: take a heap snapshot after the 15 s warm-up baseline, execute the deterministic 10-minute restart/play-cycle fixture, force GC using DevTools' Collect garbage, take a second snapshot, and subtract baseline retained size. Repeat in fresh tabs; no other pages/extensions may run. |
| Simulation | 60 Hz fixed state updates while foregrounded | Instrumented tick counter/replay. |

If the renderer exceeds budget, reduce device-pixel-ratio cap, particle count, fog resolution, and cosmetic update rate in that order. Do not lower collision precision, simulation tick rate, spawn safety constraints, or accessibility semantics as a performance fallback.

## 10. Build, compatibility, and release evidence

- Target modern evergreen browsers: latest two major stable releases of Chrome, Firefox, Safari, and Edge at release time. Verify Vite’s target/transpilation configuration against its then-current Browser Compatibility guidance; do not invent a legacy-browser promise.
- Compile TypeScript with strict mode. Linting/formatting choices may be added by implementers, but must not replace tests.
- Use semantic versioning for persistence only; a schema-breaking future change needs a new versioned key or explicit migration tested against older values.
- Static output must run over a local static server for tests. `file://` is not a supported runtime because browser storage/module behavior differs.
- No deploy, DNS, publishing, analytics configuration, or hosting credentials are in scope.

Before calling the implementation complete, a reviewer who did not author it must verify the PRODUCT_SPEC definition of done, inspect a production build in-browser, review automated results and mutation survivors, inspect no-network evidence, and confirm no out-of-scope backend/telemetry code was introduced.

## 11. Sources

All sources below were accessed 2026-07-25 (UTC). These are the authoritative current documentation to re-check when implementation begins.

- Vite, “Getting Started / Guide”: https://vite.dev/guide/
- Vitest, “Getting Started”: https://vitest.dev/guide/
- Playwright, “Installation / Introduction”: https://playwright.dev/docs/intro
- Playwright, “Best Practices”: https://playwright.dev/docs/best-practices
- StrykerJS, “Introduction”: https://stryker-mutator.io/docs/stryker-js/introduction/
- axe-core, project documentation: https://github.com/dequelabs/axe-core
- W3C, “Web Content Accessibility Guidelines (WCAG) 2.2”: https://www.w3.org/TR/WCAG22/
- WHATWG HTML, `Document.visibilityState`: https://html.spec.whatwg.org/multipage/webappapis.html#dom-document-visibilitystate
- WHATWG HTML, “Web storage”: https://html.spec.whatwg.org/multipage/webstorage.html
- W3C, “Web Audio API”: https://www.w3.org/TR/webaudio/
- W3C, “Pointer Events Level 3”: https://www.w3.org/TR/pointerevents3/
- W3C, “Resize Observer”: https://www.w3.org/TR/resize-observer/
- MDN, “Window: requestAnimationFrame() method”: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN, “Page Visibility API”: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- MDN, “Web Storage API”: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
- MDN, “Web Audio API”: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MDN, “Pointer events”: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- MDN, “ResizeObserver”: https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
- MDN, “Window: matchMedia() method”: https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia
- Chrome for Developers, “Performance features reference” (tracing and CPU throttling): https://developer.chrome.com/docs/devtools/performance/reference/
