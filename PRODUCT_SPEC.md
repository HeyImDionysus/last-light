# Last Light — Product Specification

Status: build-ready specification

Version: 1.0

Research access date: 2026-07-25 (UTC)

## 1. Product definition

Last Light is a complete, offline, single-player browser arcade game set in a dark dream forest. The player carries a lantern, collects lost stars, and brings them to a sleeping lighthouse. Shadow creatures hunt the player. The lit lantern repels them; touching a creature while the lantern is empty ends the round. Deposit 20 stars to win.

The intended round duration is 3–7 minutes for a new player who follows the instructions. The game is a static site: it has no account, backend, analytics, ads, telemetry, tracking, remote configuration, remote assets, or runtime network calls. Art and sound are original and generated procedurally in the client.

### Goals

- Deliver a clear, responsive arcade loop that is immediately playable by keyboard or touch.
- Make risk/reward legible: carrying more stars earns a better bonus but leaves less lantern energy to repel threats.
- Be accessible and usable on desktop and touch-first devices, including high-contrast and reduced-motion preferences.
- Preserve the player’s best score and settings locally when browser storage is usable, without making play depend on storage or audio.

### Non-goals

- Multiplayer, sharing, leaderboards, cloud saves, accounts, progression, purchases, advertising, social features, or remote content.
- A guarantee that every player wins within 7 minutes; the target is a normal successful round, not a timer.
- Imitating identifiable copyrighted art, music, or sound effects.

## 2. Player-facing loop and rules

1. Read the instruction overlay and choose Play.
2. Move through the forest, collect stars, and return to the lighthouse to bank them.
3. The lantern starts lit and drains while away from the lighthouse. A lit lantern pushes nearby shadows outward; it does not destroy them.
4. Returning to the lighthouse refills the lantern and deposits every carried star.
5. Bank 20 stars to win. If a shadow contacts the player while lantern energy is zero, lose the round.

### Deterministic constants

All distances are in world pixels, all rates are per second, and all values are game constants rather than frame-dependent values.

| Constant | Value | Rule / rationale |
|---|---:|---|
| World size | 2,400 × 1,600 | Fixed logical world; renderer scales it to viewport. |
| Lighthouse safe radius | 150 px | No shadows may enter this radius. |
| Player radius / speed | 18 px / 230 px/s | Fast enough for responsive touch play. |
| Star pickup radius | 34 px | A star is picked up once on entry. |
| Star carry limit | 5 | Enables meaningful multi-star trips without excessive loss frustration. |
| Goal | 20 banked stars | Four full trips are sufficient. |
| Initial available stars | 28 | Eight spares prevent an unlucky spawn from blocking a win. |
| Star respawn | 1 per 12 s, while unbanked+carried+available < 28 | Stops only after 20 are banked or a terminal state. |
| Lantern maximum | 100 energy | Normalized internal range is 0–100. |
| Lantern drain | 4.8 energy/s outside safe radius | Full charge gives ~20.8 seconds of exploration. |
| Lantern recharge | 40 energy/s inside safe radius | A full refill takes 2.5 seconds. |
| Shadow base count | 2, then +1 at 5, 10, 15 banked | Maximum five; escalation is predictable. |
| Shadow radius / speed | 19 px / 92 px/s + 4 px/s per 5 banked | Threat increases slowly. |
| Shadow spawn cadence | First at 12 s, then every 30 s until current target count | Does not spawn during pause or terminal states. |
| Shadow spawn distance | 520–760 px from player | Spawn only if also ≥300 px from lighthouse and off-screen by 80 px. |
| Lantern repel range / force | 155 px / 300 px/s outward | A lit lantern creates a visible, survivable personal space. |
| Collision grace | 0.35 s after a shadow is repelled or respawned | Avoids same-frame collision/repel ambiguity. |
| Fixed simulation step | 1/60 s, max 5 steps/frame | Deterministic gameplay and no runaway catch-up. |

### Star placement and spawn safety

- Generate stars by deterministic seeded placement on passable ground only; never in the lighthouse safe radius, map margin (80 px), obstacles, or within 100 px of another available star.
- At initial generation, require at least 10 stars 250–850 px from the lighthouse and at least 10 stars 850–1,500 px away, so both safe and high-value routes exist.
- A new star may not appear within 260 px of the player, 300 px of the lighthouse, 180 px of a shadow, or inside the current camera viewport; retry up to 32 deterministic candidate positions. If no candidate is safe, defer that spawn by 1 second rather than violating safety.
- A shadow spawn must have a clear straight-line radius of 50 px, conform to the table, and have no less than 1.25 seconds of unobstructed travel time at its current speed before it could reach the player. Retry 32 candidates; defer 1 second if none qualifies.
- Seed comes from a 32-bit value created at new-round start. The seed and fixed-step tick fully determine world generation, star order, shadow behavior, score, and outcome for a given ordered input stream. Cosmetic particle variation uses a separate seed and must not affect logic.

### Collision and simultaneous-event order

Each fixed tick uses this order, making ties reproducible:

1. Apply validated movement intent and clamp the player to passable world bounds.
2. Update lantern drain/recharge from the player’s post-movement safe-zone state.
3. Move shadows; apply safe-zone exclusion and lantern repulsion for lantern energy greater than zero.
4. Resolve player–star overlaps in ascending star ID, up to carry limit.
5. Resolve player–lighthouse overlap: bank all carried stars, refill lantern, and update score.
6. Resolve player–shadow overlaps in ascending shadow ID. A shadow inside repel range with positive lantern energy is displaced and receives grace; otherwise a zero-energy collision loses immediately.
7. Evaluate win after deposits; at 20 or more banked stars, win takes precedence over a collision in the next tick only, never within the same tick.

A collision is circle overlap (`distance <= playerRadius + shadowRadius`). There is no health bar, invulnerability item, or hidden damage. While the lantern is lit, a touching shadow is repelled; when it is empty, the first eligible touching shadow loses the round.

## 3. Score and completion

Score is an integer and is shown during play. It is final on win or loss.

- `100 × stars deposited` on every deposit.
- `25 × carried stars²` delivery bonus on every deposit (1/2/3/4/5 stars: 25/100/225/400/625), rewarding multi-star trips.
- `10 × floor(lantern energy at deposit)` safe-delivery bonus, rewarding a deliberate return before empty.
- Win only: `max(0, 4,200 − 10 × floor(elapsed seconds))` speed bonus. This reaches 0 at 7:00, so speed is rewarded but not required.
- Loss gives no terminal bonus. Already banked score remains the final score.

The persistent best score is the highest final score from a completed win or loss. Ties do not overwrite the older record. A round duration is measured from the first simulation tick after Play until the terminal tick; paused and hidden time is excluded.

## 4. States, controls, and interruption behavior

### State machine

| State | Entry | Allowed actions | Exit |
|---|---|---|---|
| `title` | initial load / Restart completed | Play, open instructions, settings | Play → `playing` |
| `instructions` | Info selected | Close, Play | Close → `title`; Play → `playing` |
| `playing` | new seeded round | Move, pause, mute, contrast, reduced motion | Pause/user visibility → `paused`; win/loss → terminal |
| `paused` | Pause button/key, or document hidden | Resume (only user-paused), restart, settings | Resume → `playing`; restart → `title` then new round |
| `won` | 20th star deposited | Restart, title, settings | Restart/title |
| `lost` | eligible zero-lantern collision | Restart, title, settings | Restart/title |

`document.visibilityState !== "visible"` pauses immediately, clears all held input, silences active audio, and records a pause reason of `visibility`. The game never auto-resumes on return: it remains paused with a “Welcome back — Resume when ready” message. A browser `blur` alone does not pause, avoiding unwanted stops from browser chrome; a visible document regaining focus does not restore held keys. On `pagehide`, audio resources are suspended/closed when supported; no game-state persistence is required.

### Input

- Desktop: Arrow keys and WASD move in eight directions. `Escape` and `P` toggle pause, `R` restarts only outside active play (or after a confirmation in active play), and `M` toggles mute.
- Prevent default scrolling only for recognized movement keys while focus is inside the game application; do not prevent default in controls, dialogs, or ordinary document content.
- Touch/tablet: expose a labelled on-screen thumb control in the lower-left safe area. It uses one active pointer ID, captures that pointer, and maps displacement from its center to a normalized movement vector with a 12 px dead zone. Releasing/cancelling the pointer immediately sends zero movement.
- Keyboard and touch use one shared movement-intent reducer. The most recently changed non-zero source wins; releasing the active source returns to the newest remaining non-zero source or stops. This makes hybrid devices predictable. Gamepad is not in v1.
- All buttons are native HTML buttons with visible focus. The game canvas is not the sole way to pause, restart, or change settings.

## 5. Responsive layout and presentation

- Use a full-window game application shell with a logical canvas world; preserve aspect ratio and letterbox rather than distort play space.
- Desktop (>= 900 CSS px): HUD at top, instructions/settings in an adjacent or modal panel; keyboard hint visible.
- Compact/tablet (600–899 CSS px): HUD condensed; thumb control visible; controls remain at least 44 × 44 CSS px.
- Phone (< 600 CSS px): portrait and landscape supported. Canvas takes available space after HUD; thumb control is lower-left and action buttons lower-right/top; use `env(safe-area-inset-*)` padding. Do not require orientation lock.
- No gameplay-critical text is rendered only into canvas. Use a semantic HUD/status region and accessible controls. The canvas has a concise accessible name and described-by instructions; decorative forest rendering is hidden from accessibility APIs.
- Procedural art: Canvas 2D gradients, silhouettes, stars, particles, and lighthouse shapes generated from code. No fetched image/font/audio asset. Reduced motion removes camera shake, animated fog/particles, and pulsing, but preserves state clarity through static contrast changes.

## 6. Accessibility acceptance criteria (WCAG 2.2 AA)

The implementation must test the following relevant requirements against the current WCAG 2.2 Recommendation:

- Keyboard: all non-game-menu functions are operable by keyboard, focus order is logical, and no keyboard trap exists (2.1.1, 2.1.2, 2.4.3).
- Touch: the thumb control and buttons have 44 × 44 CSS px target size unless an equivalent accessible control is available (2.5.8); drag does not require a path and has a single-pointer alternative via keyboard (2.5.1).
- Focus: focus is clearly visible, not obscured by sticky HUD, and dialogs move focus to their heading/first control and return it on close (2.4.7, 2.4.11).
- Status: score, carried count, lantern state, pause, win/loss, and storage-saving notice are exposed through concise `role="status"` / `aria-live="polite"` text with rate limiting; loss/win and storage failure use `role="alert"` once (4.1.3).
- Contrast: normal text and essential icons meet 4.5:1, large text 3:1, UI component and focus indicators 3:1 (1.4.3, 1.4.11). High-contrast mode uses a tested palette and does not depend on color alone (1.4.1).
- Motion: honor `prefers-reduced-motion` initially; users may change it in settings. Do not present flashing above safe thresholds; no essential information depends solely on motion (2.3.1, 2.3.3).
- Reflow and zoom: at 320 CSS px width and 400% browser zoom, controls and instructions remain usable without two-dimensional page scrolling except the play canvas itself (1.4.10).
- Instructions are plain-language, always reachable before/during play, and explain goal, movement, lantern, deposit, loss, pause, and settings (3.3.2).

## 7. Local-only settings and failure language

Persist only locally: best score, mute, high-contrast override, and reduced-motion override. A player can always play even when saving is unavailable or corrupt.

On first write/read failure, show this exact nontechnical status notice: “Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.” Do not repeatedly announce it. Never offer a fake save status.

Audio is optional. If creation, resume, or playback fails, silence audio and continue play; expose status once: “Sound is unavailable. The game is still playable.” Mute starts on if the user’s system expresses reduced motion only when no saved preference exists; otherwise default is unmuted. Audio is created/resumed only after a user gesture and never fetched.

## 8. Product acceptance and definition of done

Done means all of the following are true:

1. A static build contains no backend endpoint, account flow, analytics SDK, advertising, tracking, remote asset, service dependency, or game-time network request.
2. A player can use keyboard or touch to complete a seeded round, bank exactly 20 stars, and see correct score components; a zero-lantern collision loses exactly once.
3. Simulated seeded input replays produce identical game-state snapshots at fixed tick checkpoints across supported engines.
4. The specified safety distances and spawn deferral behavior are unit tested; no star/shadow may violate them.
5. Pause, tab hide/return, restart, win, loss, and held-input clearing satisfy the state table; hidden time does not reduce score/time/lantern.
6. Storage denial/corruption and Web Audio failures are tested; each leaves a complete, playable game and produces the specified one-time notice.
7. Keyboard, touch, hybrid input arbitration, native focus, status announcements, reduced motion, high contrast, zoom/reflow, and target size meet the accessibility criteria above with manual assistive-technology checks.
8. Automated unit, browser, accessibility, and mutation test gates pass; supported-browser smoke tests pass on the latest two major Chrome, Firefox, Safari, and Edge releases at release time.
9. Performance meets the budget in TECHNICAL_DECISIONS.md on the named test profiles and degrades cosmetics, never simulation correctness, under load.
10. The production build and resulting UI have been manually exercised; no deployment or publication is performed as part of this product.

## 9. Sources

All sources below were accessed 2026-07-25 (UTC).

- W3C, “Web Content Accessibility Guidelines (WCAG) 2.2”: https://www.w3.org/TR/WCAG22/
- MDN, “Page Visibility API”: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- MDN, “Web Storage API”: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
- MDN, “Web Audio API”: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MDN, “Pointer events”: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- MDN, “Window: requestAnimationFrame() method”: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN, “Window: matchMedia() method”: https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia
