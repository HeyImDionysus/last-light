# Last Light — Product Specification

Status: build-ready specification

Version: 1.1

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
4. Returning to the lighthouse recharges the lantern and deposits every carried star. A deposit of at least one star immediately fills it; a visit carrying no stars recharges only at the normal rate.
5. Bank 20 stars to win. If a shadow contacts the player while lantern energy is zero, lose the round.

### Deterministic constants

All distances are in world pixels, all rates are per second, and all values are game constants rather than frame-dependent values.

| Constant | Value | Rule / rationale |
|---|---:|---|
| World size | 2,400 × 1,600 | Fixed logical world; renderer scales it to viewport. |
| Lighthouse center / safe radius | (1,200, 800) / 150 px | Safe zone is `distance(playerCenter, lighthouseCenter) <= 150`; a shadow center is constrained to `distance >= 169` (150 + 19 px shadow radius). |
| Lighthouse deposit radius / player start | 132 px / (1,200, 800) | Deposit zone is the concentric circle `distance(playerCenter, lighthouseCenter) <= 132`; every round starts at the lighthouse center with lantern energy 100. |
| Player radius / speed | 18 px / 230 px/s | Fast enough for responsive touch play. |
| Star pickup radius | 34 px | A star is picked up once on entry. |
| Star carry limit | 5 | Enables meaningful multi-star trips without excessive loss frustration. |
| Goal | 20 banked stars | Four full trips are sufficient. |
| Initial available stars | 28 | Eight spares prevent an unlucky spawn from blocking a win. |
| Star respawn | 1 pending request per 12 s while `liveStars < 28` | `liveStars = available + carried`; retries and 1 s deferral are exact below; terminal ticks create none. |
| Lantern maximum | 100 energy | Gameplay range is 0–100, represented as exact integer `energyUnits` with 600 units per energy. |
| Lantern drain | 4.8 energy/s outside safe radius | Full charge gives ~20.8 seconds of exploration. |
| Lantern recharge | 40 energy/s inside safe radius | From zero, passive recharge takes exactly 2.5 seconds; depositing at least one carried star instead refills instantly. |
| Shadow target count | 2 initially, then +1 at 5, 10, 15 banked | The round starts with zero active shadows; target count is at most five. |
| Shadow radius / speed | 19 px / `92 + 4 × floor(bankedStars / 5)` px/s | Step 4 uses the current banked total; a step-6 deposit changes speed on the next active tick. Nonmultiples of five do not increase it. |
| Shadow spawn cadence | At tick 720, then every 1,800 ticks while active count is below target | A cadence opportunity creates at most one shadow; the round begins with zero shadows and none exists before tick 720. Paused/terminal ticks do not advance the cadence. |
| Shadow spawn distance | 520–760 px from player | Spawn only if also ≥300 px from lighthouse and off-screen by 80 px. |
| Lantern repel range / force | 155 px / 300 px/s outward | A lit lantern creates a visible, survivable personal space. |
| Collision grace | 21 active ticks (0.35 s) after a shadow is repelled or spawned | Avoids same-tick collision/repel ambiguity. |
| Fixed simulation step | 60 active ticks/s, max 5 steps/frame | Per-tick rate changes use exact integer division by 60; there is no encoded Q16.16 `1/60` constant. |

### Star placement and spawn safety

**Gameplay geometry and passability.** Obstacles are gameplay geometry, not decoration. Generate exactly 24 axis-aligned, solid tree-thicket rectangles from the gameplay PRNG before entities. For IDs 0–23, consume candidates in order; each candidate has integer top-left `(80 + rngInt(0, 2,079), 80 + rngInt(0, 1,279))`, width `96 + 16*rngInt(0, 13)`, and height `96 + 16*rngInt(0, 10)`. Accept the first of at most 32 candidates wholly inside the 80 px map margin, whose rectangle expanded by 150 px does not intersect the lighthouse safe circle's bounding box, and whose rectangle expanded by 36 px does not intersect an accepted obstacle expanded by 36 px. Rejected candidates are still consumed. If any ID has no accepted candidate after 32 attempts, world construction fails its invariant: do not start a partial round, omit that obstacle, renumber later IDs, or substitute a fallback; report the specified game-logic error boundary. Thus a started round always has exactly 24 obstacles with IDs `0..23`.

**Passability and collision.** A player center is passable iff it is inside `[18, 2382] × [18, 1582]` and outside every obstacle expanded by 18 px. A shadow center uses `[19, 2381] × [19, 1581]` and obstacles expanded by 19 px. Stars must have their center outside each obstacle expanded by 34 px. The lighthouse/deposit circles are always passable because obstacle generation reserves them. Resolve a movement segment by swept-circle collision: take the earliest intersection with a world boundary or expanded obstacle; move to that point minus one Q16.16 unit along the segment, discard the blocked normal component, and retry the remaining tangent displacement once. If the retry also intersects, discard it. Equal-time hits use obstacle ID, then left/right/top/bottom boundary order. Entities do not destroy, move, or pass through obstacles.

**Initial stars.** After all obstacle candidates, construct exactly 28 available-star slots in ascending ID order. IDs 0–9 use the required distance band `(250 px, 850 px]` from the lighthouse; IDs 10–19 use `(850 px, 1,500 px]`; IDs 20–27 have no distance band beyond the common rules. For each slot, make at most 32 attempts. Each attempt consumes exactly two gameplay `rngInt` calls, in order, and proposes integer center `(80 + rngInt(0, 2,240), 80 + rngInt(0, 1,440))`. Accept a proposal only when it is star-passable, its distance from the lighthouse is greater than 150 px, it meets that slot’s band, and it is more than 100 px from every already accepted available star. Rejected proposals still consume both values. If any slot has no accepted proposal after 32 attempts, world construction fails its invariant: do not start a partial round or substitute a fallback; report the specified game-logic error boundary. Thus initial IDs are always `0..27` and their quota allocation is fixed, not opportunistic.

**Respawning stars.** Define `liveStars = availableStars.length + carriedStars.length`; banked stars are not live. In the runtime-spawn stage of every active tick divisible by 720, if `liveStars < 28`, create one pending respawn request with `dueTick = currentTick` unless one is already pending. A pending request is attempted when `dueTick == currentTick`; after failure its due tick becomes `currentTick + 60`. Normal cadence ticks do not create a second request while one is pending. Each request makes at most 32 attempts using the same two-call coordinate proposal order as initial stars. A proposal is accepted only if it is star-passable, farther than 300 px from the lighthouse, at least 260 px from the current player center, at least 180 px from every active shadow center, more than 100 px from every available star, and outside the deterministic simulation camera rectangle. That rectangle is 960 × 640 world px centered on the player then clamped to the world bounds; CSS viewport, device-pixel ratio, and renderer camera must not affect it. On success, append one available star with `id = nextStarId`, increment `nextStarId`, and clear the pending request; `nextStarId` starts at 28 and increments only on a successful respawn. On all 32 failures, consume the candidates, retain the pending request with its new due tick, and do not change `liveStars`, IDs, or any safety constraint.

**Shadow spawning.** At every global cadence opportunity `720 + 1,800n` (`n >= 0`), the runtime-spawn stage performs the exact deferred-request/cadence ordering specified below. The cadence test creates a shadow request with `dueTick = currentTick` only when the round is active, no shadow request is pending, and `activeShadows.length < targetShadowCount`; otherwise it creates no request and consumes no gameplay PRNG value. A newly created request is attempted immediately in that same stage. Each request makes at most 32 attempts numbered 1–32. Each attempt consumes exactly two gameplay `rngInt` calls in this order, even if the first coordinate or any later predicate rejects the candidate: `x = 19 + rngInt(0, 2,362)`, then `y = 19 + rngInt(0, 1,562)`. The proposed center is `(x, y)` world pixels. No angle, radius, renderer value, or additional random draw is used.

For every attempt, derive the **simulation camera** solely from the player’s pre-shadow-movement center on that tick: its 960 × 640 world-pixel rectangle has `left = clamp(playerX - 480, 0, 1,440)`, `top = clamp(playerY - 320, 0, 960)`, `right = left + 960`, and `bottom = top + 640`, where `clamp(v, lo, hi) = min(max(v, lo), hi)`. It is independent of the CSS viewport, device-pixel ratio, render transform, and visible canvas. A candidate is off-screen by 80 px iff its center is outside the closed 80 px expansion of that rectangle: `x < left - 80 || x > right + 80 || y < top - 80 || y > bottom + 80`; equality is not off-screen. Accept only a candidate that is off-screen by this predicate, is 520–760 px inclusive from the player center, is at least 300 px from the lighthouse center, is shadow-passable, has a 50 px-radius circle that intersects neither a boundary nor an obstacle, and whose swept 19 px-radius disk toward the player for `speed × 1.25` px intersects neither a boundary nor an obstacle. Evaluate predicates in that written order after both RNG calls; their evaluation never changes PRNG consumption.

On success, append one active shadow with `id = nextShadowId` and `graceTicks = 21`, increment `nextShadowId`, and clear the pending request; `nextShadowId` is initialized to `0` at new-round construction and increments only after a successful shadow spawn, so it is monotonic and never reused. On all 32 failed attempts, consume all 64 `rngInt` calls (and every underlying rejected `nextU32()` draw), create no shadow, leave `nextShadowId` unchanged, retain that single request, and set its `dueTick` to exactly `currentTick + 60`. The total same-tick priority and the effect of a deferred result on a cadence opportunity are specified in the fixed-tick order below. Target increases after a cadence opportunity wait until the next opportunity.

The seed comes from the explicit new-round seed-provider boundary in TECHNICAL_DECISIONS.md and is normalized, advanced, and mapped by the one gameplay PRNG there. Tests/replays supply it; production uses the specified cryptographic source and deterministic session fallback. That seed, fixed-step tick, and ordered input stream fully determine world generation, star IDs/order, shadow behavior, score, and outcome. Cosmetic particle variation uses a separate seed and must not affect logic.

### Shadow simulation

All gameplay coordinates and velocities are Q16.16 signed integers. Convert a stated rate to Q16.16 once by the exact decimal rule in TECHNICAL_DECISIONS.md; derive its per-tick displacement by dividing the post-unit-vector Q16.16 velocity by integer 60, with signed truncation toward zero. Never encode or multiply by a Q16.16 approximation of `1/60`. This, the specified PRNG, ascending IDs, and stated tie breaks are the cross-engine simulation contract.

At each active tick, process active shadows in ascending shadow ID after the player/lantern update. `resolveShadowDisplacement(start, displacement)` means resolve that segment by the shadow swept-circle rule, then apply the lighthouse exclusion: if its resulting center is closer than 169 px to the lighthouse center, project it radially to exactly 169 px (using the `shadowId mod 8` fallback unit vector for a zero-length radial vector) and resolve that projection by the same swept-circle rule from the prior legal center; if no legal projected point exists, retain that prior legal center.

For each shadow, let `toPlayer = playerCenter - shadowCenter`; if its length is zero, use the exact `shadowId mod 8` fallback vector table in TECHNICAL_DECISIONS.md, otherwise normalize it by that document’s Q16.16 integer algorithm. For each component, first compute `velocityQ = mulQ(toPlayerUnitQ, speedQ)`, then compute `pursuitQ = trunc0(velocityQ / 60)`; call `resolveShadowDisplacement` once with that `(pursuitXQ, pursuitYQ)`. Then, and only then, evaluate the sole lantern-repulsion predicate for this tick: `lanternEnergy > 0 && distance(playerCenter, shadowCenter) <= 155 px`, using the shadow center after pursuit and lighthouse exclusion. If true, call `resolveShadowDisplacement` exactly once with each component computed as `trunc0(mulQ(-toPlayerUnitQ, encodeQ(300)) / 60)`; this is the one 5 px maximum lantern-repulsion displacement for that shadow and tick, including at overlap and everywhere in the full repel range. Set `graceTicks` to 21 whenever this predicate is true, even if terrain shortens the swept displacement. If false, make no lantern-repulsion displacement and do not reset grace. Do not apply lantern repulsion at any other stage. A spawned shadow begins with `graceTicks = 21`; otherwise decrement a positive `graceTicks` once at the end of each subsequent active tick. Grace makes that shadow ineligible to lose the round while positive; it does not stop movement. Shadows never collide with, block, or repel each other.

### Collision and simultaneous-event order

Each fixed tick uses this order, making ties reproducible:

1. Apply validated movement intent and resolve the player's swept-circle movement against the passability model.
2. Update lantern drain/recharge from the player’s post-movement safe-zone state using the exact integer-energy arithmetic in TECHNICAL_DECISIONS.md.
3. Run the single **runtime-spawn stage**, with all predicates observing state as updated by earlier work in this list. In exact priority order: (a) run the star cadence gate and, when eligible, create one star request due now; (b) if the pending star request is due now, attempt it to completion; (c) if the pending shadow request is due now, attempt it to completion; (d) if this is a global shadow cadence opportunity, run its gate against the post-(c) state, create an eligible shadow request due now, and immediately attempt it. Thus star work always consumes the gameplay PRNG before shadow work on a tie. A failed deferred shadow remains pending and suppresses (d), consuming nothing there; a successful deferred shadow clears the request, so (d) may create and attempt one additional request if the updated active count is still below target. No other stage creates or processes runtime spawn requests.
4. Snapshot the active-shadow list after step 3, then move every shadow in that snapshot in ascending ID using the deterministic Shadow simulation, including its one post-pursuit lantern-repulsion predicate/application and safe-zone exclusion. A shadow appended in step 3 therefore pursues and may be repelled on its spawn tick, but its positive `graceTicks` is not decremented on that tick; it remains 21 after step 4 whether or not repulsion resets it to 21. Existing shadows decrement grace as specified.
5. Resolve player–star overlaps in ascending star ID, up to carry limit. A star appended in step 3 is eligible.
6. If the player center is in the 132 px deposit circle, snapshot `carriedStars` and lantern energy now (after step 2's passive recharge and before any deposit refill). If the snapshot contains at least one star, bank all snapshot stars, add all three deposit-time score components using that snapshot, then set lantern energy to 100. If it contains zero stars, do not score, deposit, or refill instantly; step 2's `40 energy/s` passive recharge is the only energy change.
7. If banked stars are now 20 or more, add the win speed bonus, set `won`, emit no collision event, and stop this tick. Thus a same-tick deposit that reaches the goal always wins, including a total above 20.
8. Otherwise resolve player–shadow overlaps in ascending shadow ID. This step does not move or repel shadows. A colliding shadow loses the round only when lantern energy is zero and that shadow has zero grace ticks; set `lost` immediately and do not evaluate subsequent IDs. With positive lantern energy, collision causes no additional displacement because the sole lantern-repulsion application was already performed in step 4.

A collision is circle overlap (`distance <= playerRadius + shadowRadius`). There is no health bar, invulnerability item, or hidden damage. While the lantern is lit, a touching shadow is repelled; when it is empty, the first eligible touching shadow loses the round.

## 3. Score and completion

Score is an integer and is shown during play. It is final on win or loss.

- `100 × depositedStars` on every deposit.
- `25 × depositedStars²` delivery bonus on every deposit (1/2/3/4/5 stars: 25/100/225/400/625), rewarding multi-star trips.
- `10 × floor(preRefillLanternEnergy)` safe-delivery bonus. `preRefillLanternEnergy` is the step-6 snapshot after that tick's passive recharge and before the real-deposit instant refill, so refill never makes every deposit score as 100 energy.
- Win only: `max(0, 4,200 − 10 × floor(elapsed seconds))` speed bonus. This reaches 0 at 7:00, so speed is rewarded but not required.
- Loss gives no terminal bonus. Already banked score remains the final score.

The persistent best score is the highest final score from a completed win or loss. Ties do not overwrite the older record. A round duration is measured from the first simulation tick after Play until the terminal tick; paused and hidden time is excluded.

## 4. States, controls, and interruption behavior

### State machine

| State | Entry | Allowed actions | Exit |
|---|---|---|---|
| `title` | initial load / Title selected | Play, open instructions, settings | Play → new `playing` round |
| `instructions` | Instructions selected, with explicit `returnState` | Close; Play only when `returnState = title` | Close → exact `returnState`; title-origin Play → new `playing` round |
| `settings` | Settings selected, with explicit `returnState` | Change settings, Close | Close → exact `returnState` |
| `playing` | new seeded round / user Resume | Move, pause, Instructions, settings, restart with confirmation, mute, contrast, reduced motion | Pause or hidden document → `paused`; modal → modal state; confirmed Restart → new `playing`; win/loss → terminal |
| `paused` | user pause, hidden document, or in-round modal close | Resume when visible, Instructions, settings, restart with confirmation | Resume → same round in `playing`; modal → modal state; confirmed Restart → new `playing` |
| `won` | 20th star deposited | Restart, title, settings | Restart → new `playing`; Title → `title` |
| `lost` | eligible zero-lantern collision | Restart, title, settings | Restart → new `playing`; Title → `title` |

`paused` stores `pauseReason: 'user' | 'visibility' | 'instructions' | 'settings'`. When a playing document becomes non-visible, transition immediately to `paused` with reason `visibility`, clear all held input, and silence active audio. Becoming visible does not change that state or reason and never auto-resumes; it enables the user-controlled Resume action and shows “Welcome back — Resume when ready.” Resume is rejected while the document is non-visible and, once visible, transitions any paused reason back to the same round in `playing`. If a user- or modal-paused round becomes hidden, retain its existing reason and round. A browser `blur` alone does not pause, avoiding unwanted stops from browser chrome; a visible document regaining focus does not restore held keys. On `pagehide`, audio resources are suspended/closed when supported; no game-state persistence is required.

Opening Instructions from `playing` is an explicit action: clear held input, preserve the round unchanged as `paused` with reason `instructions`, then enter `instructions` with that paused round as `returnState`. Closing returns to that same paused round; the player must select Resume, and no seed, tick, entity, score, or round is recreated. Opening Instructions from an already paused round preserves that round and its existing pause reason as `returnState`. Only title-origin Instructions offers Play and may create a new round.

Settings uses the same return contract: opening it from `playing` clears held input, preserves the round as `paused` with reason `settings`, and closing returns to that same paused round without auto-resume; opening it from `paused`, `title`, `won`, or `lost` returns exactly to that origin. Restart means discard the current round and create a new seeded `playing` round. It requires confirmation from `playing`, `paused`, or a round-origin modal; cancelling restores that exact state. At `won`/`lost` it is immediate. The Title action discards the round and enters `title`; Restart and Title are never aliases.

### Input

- Desktop: Arrow keys and WASD move in eight directions. `Escape` and `P` request pause/resume subject to the state and visible-only Resume rules above; `R` invokes Restart (confirmation for an active preserved round, immediate at `won`/`lost`, no effect at `title`), and `M` toggles mute.
- Treat only the application shell background and game canvas as gameplay keyboard surfaces. Handle movement and prevent default scrolling for a recognized movement key only while `playing`, with no modifier or modal dialog, and when the event target is on one of those surfaces. Never handle or cancel movement keys whose target is in a native control, link, editable/contenteditable region, dialog (including its contents), or ordinary document content; those targets retain normal browser key behavior.
- Touch/tablet: expose a labelled on-screen thumb control in the lower-left safe area. It uses one active pointer ID, captures that pointer, and maps displacement from its center to a normalized movement vector with a 12 px dead zone. Releasing/cancelling the pointer immediately sends zero movement.
- Keyboard and touch use one shared movement-intent reducer. The most recently changed non-zero source wins; releasing the active source returns to the newest remaining non-zero source or stops. This makes hybrid devices predictable. Gamepad is not in v1.
- All buttons are native HTML buttons with visible focus. The game canvas is not the sole way to pause, restart, or change settings.

## 5. Responsive layout and presentation

- Use a full-window game application shell for the 2,400 × 1,600 world. Render the same 960 × 640 simulation-camera rectangle defined in spawn safety, centered on the latest post-tick player center and clamped to world bounds; CSS scales that 3:2 view with aspect ratio preserved and letterboxing rather than changing its world extent or distorting it.
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
- Status: score, carried count, lantern state, pause, win/loss, and storage notices are exposed through concise `role="status"` / `aria-live="polite"` text with rate limiting; loss/win, corrupt-data reset, and saving-unavailable failure use `role="alert"` once per applicable notice (4.1.3).
- Contrast: normal text and essential icons meet 4.5:1, large text 3:1, UI component and focus indicators 3:1 (1.4.3, 1.4.11). High-contrast mode uses a tested palette and does not depend on color alone (1.4.1).
- Motion: honor `prefers-reduced-motion` initially; users may change it in settings. Do not present flashing above safe thresholds; no essential information depends solely on motion (2.3.1, 2.3.3).
- Reflow and zoom: at 320 CSS px width and 400% browser zoom, controls and instructions remain usable without two-dimensional page scrolling except the play canvas itself (1.4.10).
- Instructions are plain-language, always reachable before/during play, and explain goal, movement, lantern, deposit, loss, pause, and settings (3.3.2).

## 7. Local-only settings and failure language

Persist only locally: best score, mute, high-contrast override, and reduced-motion override. A player can always play even when saving is unavailable or corrupt.

Treat corrupt saved data separately from unavailable storage. If a read succeeds but the stored payload fails parsing or schema validation, use defaults and announce once: “Saved settings were invalid and have been reset to defaults. You can still play.” This recoverable reset does not disable later explicit preference or best-score writes; a successful write may replace the corrupt value. If storage access throws, or a validated write/serialization fails, mark saving unavailable for the page session, retain changes only in memory, skip later writes, and announce once: “Saving is unavailable in this browser. You can still play; this session’s settings and best score will not be saved.” Do not repeat either notice or claim a successful save that did not occur.

Audio is optional. If creation, resume, or playback fails, silence audio and continue play; expose status once: “Sound is unavailable. The game is still playable.” With no saved preference, mute defaults to `false` independently of all system media queries. Reduced motion separately defaults to the OS `prefers-reduced-motion` result and never changes mute. Audio is created/resumed only after a user gesture and never fetched.

## 8. Product acceptance and definition of done

Done means all of the following are true:

1. A static build contains no backend endpoint, account flow, analytics SDK, advertising, tracking, remote asset, service dependency, or game-time network request.
2. A player can use keyboard or touch to complete a seeded round, bank at least 20 stars (the final deposit may overshoot), and see correct pre-refill score components; a zero-lantern collision loses exactly once unless that same tick's deposit has already won.
3. Simulated seeded input replays produce identical game-state snapshots at fixed tick checkpoints across supported engines.
4. The specified safety distances, obstacle/passability rules, spawn deferral behavior, and same-tick terminal ordering are unit tested; no accepted star/shadow may violate them.
5. Pause, tab hide/return, restart, win, loss, and held-input clearing satisfy the state table; hidden time does not reduce score/time/lantern.
6. Storage denial, corrupt-data recovery, write failure, and Web Audio failures are tested; each leaves a complete, playable game and produces its specified one-time notice.
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
