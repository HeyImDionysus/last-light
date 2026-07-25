# Last Light — Technical Decisions

Status: build-ready technical specification

Version: 1.0

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

Use `requestAnimationFrame` only to schedule rendering. Accumulate elapsed monotonic frame time, clamp one frame delta to 250 ms, then run zero or more `1/60`-second reducer ticks, capped at five ticks per animation frame. If the cap would be exceeded, discard excess elapsed time and record no gameplay catch-up; pausing/visibility handling ensures ordinary background throttling cannot trigger this path. Render the current snapshot (or interpolation using only prior/current snapshots) after simulation.

No game rule may use `Date.now()`, frame count, rendering delta, `Math.random()`, timers, or wall-clock time. The round stores `tick`, derives elapsed seconds as `tick / 60`, and gets all random values from an explicit 32-bit PRNG state. Use a small documented algorithm such as mulberry32/xorshift32 implemented locally; serialize its state in test snapshots. The seed must be nonzero (map a zero supplied seed to `0x6D2B79F5`).

### Reducer contract

```ts
type TickAction = {
  kind: 'tick';
  movement: { x: number; y: number }; // each component [-1, 1], normalized if magnitude > 1
};

type Transition = {
  state: Readonly<GameState>;
  events: readonly GameEvent[]; // e.g. deposited, repelled, won, lost
};

function advance(state: Readonly<GameState>, action: TickAction): Transition;
```

The reducer rejects invalid state/action at the domain boundary in development/tests (non-finite number, invalid enum, out-of-range energy, duplicate ID). Production UI does not intentionally construct invalid actions: it clamps input to the declared range. Do not catch-and-ignore a reducer invariant failure; surface it to the application error boundary, stop the round, and show a plain “The game encountered a problem. Restart to try a new round.” message. Preserve the original error in console diagnostics only; do not expose internal details to the player.

The canonical transition/event ordering and constants are in PRODUCT_SPEC.md. Tests must snapshot selected ticks of seed + ordered input timelines, including spawn deferrals and simultaneous deposit/collision edge cases.

## 3. Rendering, graphics, and responsive behavior

- Canvas logical size is 2,400 × 1,600. Calculate a CSS display rectangle that fits available game area while preserving ratio, and set internal backing dimensions to `round(cssWidth * devicePixelRatio)` / `round(cssHeight * devicePixelRatio)`.
- Cap effective device pixel ratio at 2.0 to control fill rate; never let this modify logical positions/collisions.
- Resize using `ResizeObserver` (with window `resize` fallback if needed); renderer recalculates only view transform and backing store. It does not recreate a round.
- Canvas 2D is appropriate because the world is small and uses simple procedural shapes; it avoids a rendering engine dependency and works across the stated browser set. Draw low-cost layers in order: flat background, deterministic tree silhouettes, static stars/entities, player/light cone, then optional particles/fog.
- Do not fetch fonts, images, shaders, sprites, audio, or JSON. CSS uses system fonts; visual and sonic data are locally generated.
- High contrast is a CSS/application setting that changes named design tokens. Game state includes semantic lantern/shadow/star states; renderer must pair color with silhouettes, outlines, and HUD text.
- Reduced motion disables camera shake, parallax/fog drift, nonessential particle updates, pulsing, and animated transitions. It does not slow or change game rules.

## 4. Input and UI boundary

### Keyboard

Maintain a `Set<code>` for physical keyboard codes. Recognize `ArrowUp/Down/Left/Right` and `KeyW/A/S/D`; ignore `event.repeat` for state mutation (sets are idempotent). On `keyup`, delete. On application focus loss, visibility change, state change to pause/terminal, or dialog open, clear the set. Convert it to one normalized vector once per simulation frame/tick.

Keyboard handlers only call `preventDefault()` for recognized movement commands while `playing` and the event target is not an editable control. Escape/P/M are handled through native button-equivalent commands. Do not remap browser-reserved key combinations.

### Touch thumb control

Use Pointer Events on a visible native labelled control surface with `touch-action: none`. On `pointerdown`, accept only the first primary pointer, call `setPointerCapture(pointerId)`, record its ID and center. On `pointermove`, ignore other IDs, clamp radius, apply 12 px dead zone, and emit normalized vector. On `pointerup`, `pointercancel`, `lostpointercapture`, pause, or terminal state, zero it and clear active ID. The control has a non-canvas text label and an 44 × 44 CSS px minimum target, although its visual hit area should be at least 112 px.

### Arbitration

The input module receives timestamped state changes from keyboard and thumb. Each source has `vector`, `lastChangedSequence`, and active flag. On each tick choose the non-zero source with greatest `lastChangedSequence`; ties prefer keyboard for deterministic tests. Releasing the selected source immediately selects the remaining latest source or `{0,0}`. Neither source generates movement while paused/terminal/hidden. This avoids summing input vectors, which would create unintentional faster diagonal motion on hybrids.

### Semantic DOM

Use a semantic application region containing:

- `h1` game title; instructions reachable before Play.
- Canvas with `role="img"`, `aria-label="Last Light game view"`, and `aria-describedby` pointing to current concise instructions; canvas is not focusable unless a tested purpose requires it.
- Native `button` elements for Play, Pause/Resume, Restart, Mute, High contrast, Reduced motion, and Instructions; toggle state uses `aria-pressed`.
- A text HUD (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) for score, banked/carried stars, lantern band, and pause state. Update on meaningful changes only (deposit, energy band boundary of 25, status change), never every tick.
- A terminal/error announcement (`role="alert"`) for win, loss, and first saving/audio failure.
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

`loadPreferences(): { ok: true; value: Preferences } | { ok: false; value: Defaults; reason: 'unavailable' | 'invalid' }` wraps `getItem` and parsing. `savePreferences()` validates the outgoing value, serializes it, then wraps `setItem`; it returns `false` on any Storage/serialization exception. It does not rethrow from UI event handlers or cause a game reset.

On load invalidity or access failure, use defaults for this session and issue the exact first-failure notice specified in PRODUCT_SPEC.md. Do not attempt to delete malformed data unless a later explicit successful user preference write replaces it. Coalesce preference writes after user settings changes and after terminal best-score updates; avoid per-tick storage writes. If one save fails, mark storage unavailable for this page session and skip further writes, while retaining in-memory preferences. This is deliberate recovery: storage is optional, and the player receives a clear notice.

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
| Storage | Use in-memory defaults, show one saving-unavailable notice, continue play. |
| Audio | Disable sound, show one sound-unavailable notice, continue play. |
| Preference query | Use default preference, continue play. |
| Pointer/keyboard events | Normalize and ignore unrecognized input; clear recognized held state on interruption. |

Add no error reporting service, tracking pixel, remote logging, or analytics. Console diagnostics may be available locally during development but must contain no stored preference payload or identifying information in production builds. Static hosting is not a runtime dependency; a manual offline/network-blocked smoke test is required.

Visibility behavior is specified in PRODUCT_SPEC.md. Register event listeners once at application startup and remove them on teardown. The fixed-tick scheduler checks state/visibility before advancing; `requestAnimationFrame` rendering can still render a paused overlay but must not mutate simulation.

## 8. Test and quality strategy

### Unit tests: Vitest

Use Vitest for `game/` and `platform/` modules. It should run in Node by default, with browser-like tests only where DOM APIs are required. Required examples:

- PRNG repeatability; seed/world snapshots and input timeline snapshots.
- Every balance boundary: 0/positive lantern, carry 0/5, 19/20 banked, score floor, capped spawn retries, and collision grace expiry.
- Simultaneous event ordering from the product spec.
- Spawn property tests across at least 1,000 fixed seeds: all accepted stars/shadows obey stated distances; deferred spawns do not mutate count.
- Input sets, dead zone, pointer cancellation, hybrid recency arbitration, focus/visibility clearing.
- Storage: missing key, blocked get/set (throwing mocks), invalid JSON, `null`, array, oversized data, wrong version/types/ranges, and valid round-trip.
- Audio adapter constructor/resume/scheduling failures; game transition remains identical with audio disabled.
- Preference resolution and reduced-motion override precedence.

### Browser tests: Playwright

Use Playwright’s isolated browser contexts and accessible locators (`getByRole`, `getByLabel`, `getByText`) rather than brittle implementation selectors. Configure projects for current Chromium, Firefox, and WebKit; WebKit is the automated proxy for Safari behavior, but it does not replace required manual Safari smoke testing. Required flows:

- Keyboard and touch-capable viewport movement, Play/Pause/Resume/Restart/Mute/settings.
- Visibility simulation or a test seam to prove no tick/drain on hidden state and no auto-resume.
- High contrast/reduced motion visual-state assertions; emulate reduced motion where supported.
- Keyboard focus traversal, native controls, instructions dialog focus behavior, and terminal status presence.
- Storage denied/corrupted and audio unavailable paths with the specified notices and successful play.
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

Test production build, not development server, on a representative low-end Android phone or CPU-throttled profile and an ordinary desktop. Record device/browser/version/date in release evidence.

| Metric | Budget | Measurement |
|---|---:|---|
| Initial compressed JS/CSS | <= 250 KB gzip, excluding browser-native APIs | Build artifact analysis. |
| Runtime network requests after load | 0 | DevTools/Playwright route guard. |
| Steady active-play frame time, desktop | p95 <= 16.7 ms | Performance trace over 60 s at max shadows/particles. |
| Steady active-play frame time, low-end mobile | p95 <= 33.3 ms | Performance trace over 60 s at max shadows/particles. |
| Long task | no task > 50 ms during active play | Performance trace. |
| Heap growth | <= 5 MB after 10 minutes of restart/play cycling, excluding browser noise | Heap snapshots/profiling. |
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
