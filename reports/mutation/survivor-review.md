# Expanded mutation survivor review

## Gate and scope

- Baseline: PR #12 head `69be3c51deb2f2372354fbd78693c53193ba595d` with only the mutate glob expanded.
- Production baseline preserved: `9cf0f5dd71c2924dd1d126fcc40407f639da5264` (no `src/` edits).
- Mutated scope: `src/game/**/*.ts` and `src/platform/**/*.ts` (14 files, 857 mutants).
- Thresholds: high 90, low 80, break 80.
- Expanded baseline: 82.85% total; 706 killed, 4 timeout-detected, 125 survived, 22 no coverage.
- Final: 96.38% total; 819 killed, 7 timeout-detected, 31 survived, 0 no coverage.
- Final report: `reports/mutation/mutation.html`.

Stryker includes timeout-detected mutants in the mutation score because the suite detects their nontermination. All seven final timeouts below are therefore killed mutants, not unresolved survivors.

## Before/after by file

| File                          | Baseline score | Baseline K/T/S/NC | Final score | Final K/T/S/NC |
| ----------------------------- | -------------: | ----------------: | ----------: | -------------: |
| `src/game/input.ts`           |         78.65% |         70/0/19/0 |      94.38% |       84/0/5/0 |
| `src/game/reducer.ts`         |         88.73% |       243/1/31/16 |      94.85% |     276/0/15/0 |
| `src/game/rng.ts`             |         82.35% |          27/1/6/0 |     100.00% |       29/5/0/0 |
| `src/game/scoring.ts`         |        100.00% |          12/0/0/0 |     100.00% |       12/0/0/0 |
| `src/game/spawn.ts`           |         98.21% |         109/1/2/0 |     100.00% |      111/1/0/0 |
| `src/game/world.ts`           |         62.82% |         49/0/29/0 |      94.87% |       74/0/4/0 |
| `src/platform/audio.ts`       |         56.10% |         23/0/18/6 |      95.74% |       45/0/2/0 |
| `src/platform/input.ts`       |         94.59% |          35/0/2/0 |      94.59% |       35/0/2/0 |
| `src/platform/preferences.ts` |         94.12% |          16/0/1/0 |      94.12% |       16/0/1/0 |
| `src/platform/scheduler.ts`   |         92.86% |          25/1/2/0 |     100.00% |       27/1/0/0 |
| `src/platform/storage.ts`     |         88.04% |         81/0/11/0 |      97.83% |       90/0/2/0 |
| `src/platform/visibility.ts`  |         80.00% |          16/0/4/0 |     100.00% |       20/0/0/0 |
| **All files**                 |     **82.85%** |  **706/4/125/22** |  **96.38%** | **819/7/31/0** |

K/T/S/NC = killed / timeout-detected / survived / no coverage.

## Remaining survived mutants: line-level classification

Every final survivor is behavior-equivalent at the public contract. No removed event, empty keyboard-code table, empty default object, altered cadence/capacity, removed obstacle row, RNG error, spawn identity error, or platform failure behavior remains survived.

### `src/game/input.ts`

- **35, line 8** (`!x && !y` → `false`) — equivalent. If keyboard axes cancel, the later arbitration returns touch when touch is nonzero and returns the identical zero keyboard vector when touch is zero.
- **65, line 18** (`touch.x || touch.y` → `true`) — equivalent. Releasing an already-zero touch only rewrites zero and an internal sequence number; zero sources are bypassed by arbitration.

- **71, line 19** (`++sequence` → `--sequence`) — equivalent. `clear()` empties both sources and then assigns both source sequence markers the same value; only their relative ordering is observable.
- **73, line 20** (`++sequence` → `--sequence`) — equivalent for the same reason as 71: interruption clears both sources and leaves equal markers.
- **87, line 21** (`>` → `>=`) — equivalent. Equal sequence markers are only created by clear/interruption while both vectors are zero; any subsequent real source change breaks the tie.

### `src/game/reducer.ts`

- **92, line 6** (`value < 0` → `value <= 0`) — equivalent because `Math.ceil(0)` and `Math.floor(0)` both produce the same numeric zero.
- **223, line 45** (`tick < 720` → `false`) — equivalent for reachable nonnegative active ticks. Before 720, `(tick - 720) % 1800 !== 0` already rejects every tick except 720 itself; at 720 the original first guard is also false.
- **281, 283–293, line 59** (fresh-shadow set filter/map mutations) — equivalent dead computation. Every fresh shadow starts at grace 21 and `moveShadow` leaves or resets it to 21. The final grace update independently preserves every `shadow.graceTicks === 21`, so changing or emptying `newlySpawned` cannot alter state, identity, collision, or grace. A builder follow-up should remove the redundant set rather than pinning its implementation in tests.
- **361, line 69** (`energyUnits === 0` → `true`) — equivalent under the current reducer order. Any positive-energy shadow inside the collision radius is first repelled (the repel radius is 155 versus collision radius 38), receives grace 21, and is no longer an eligible collision. A collision can therefore remain eligible only when energy is already zero. A builder follow-up should simplify this redundant predicate or change ordering if a distinct behavior was intended.

### `src/game/world.ts`

- **576, 579, 581, 582, line 20** (ring-local index branch/subtraction mutations) — mathematically equivalent. The mutations shift local indices by 10, 20, or 40. Ring counts are 10, 10, and 8 respectively, so each shift is an integer number of full `2π` rotations and produces the same rounded coordinates and IDs. Obstacle-row removal mutants 538–562 are all killed by module-reset exact-layout coverage.

### `src/platform/audio.ts`

- **628, line 2** (`context?.close?.()` → `context?.close()`) — equivalent at the public boundary. A present context with no `close` throws only inside the cleanup `try`; the catch intentionally contains it after availability and the single notice were already set.
- **629, line 2** (`context?.close` → `context.close`) — equivalent. A missing context likewise throws only inside that same containment `try`, leaving the same unavailable state and notice.

### `src/platform/input.ts`

- **666, line 2** (`value < 0` → `value <= 0`) — equivalent because ceil and floor agree at zero.
- **685, line 7** (`length > maximum` → `length >= maximum`) — equivalent at exact radius: multiplying by `maximum / length` is multiplication by one, so both coordinates and normalized output are unchanged.

### `src/platform/preferences.ts`

- **713, line 1** (`system?.()` → `system()`) — equivalent because an absent callback throws inside the surrounding `try` and the catch returns the same `false` fallback as optional chaining.

### `src/platform/storage.ts`

- **754, line 4** (`!value || Array.isArray(value)` → `false`) — equivalent at the public load/save boundaries. Arrays are still rejected by the following prototype check; null/undefined make `Object.getPrototypeOf` throw and the public `try/catch` returns the same invalid/false result.
- **755, line 4** (`||` → `&&` inside the null/array guard) — equivalent for the same reason: the prototype check rejects arrays and the public catch contains null/undefined property access. Full-schema arrays, null-prototype objects, and class instances are explicitly tested.

## Timeout-detected mutants (killed)

- **`src/game/rng.ts` 387, 398, 399, 401, line 16** — removing or weakening invalid-range guards admits a 32-bit-width invalid span and reaches nonterminating rejection behavior; deterministic boundary tests make each mutant time out.
- **`src/game/rng.ts` 409, line 20** — reversing `output >= limit` to `output < limit` nonterminates for the crafted seed whose first xorshift output is exactly the rejection limit.
- **`src/game/spawn.ts` 520, line 22** — decrementing the attempt counter never reaches the 32-attempt cap when candidates are rejected.
- **`src/platform/scheduler.ts` 738, line 1** — emptying the fixed-step loop body prevents accumulator/count progress and is detected as an infinite loop.

## No-coverage review

Final no-coverage count is **zero** in every game and platform file. The original reducer fallback-vector mutants 108–123 and audio failure-path mutants are now executed and killed. All static keyboard-code/default/obstacle-layout mutants are re-evaluated through deterministic `vi.resetModules()` tests and killed.
