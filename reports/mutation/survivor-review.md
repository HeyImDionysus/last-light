# Expanded mutation gate after reducer cleanup

## Gate and scope

- Expanded baseline: PR #12 head `69be3c51deb2f2372354fbd78693c53193ba595d`, with the mutate glob expanded to all game and platform TypeScript.
- Testwriter pre-cleanup head: `242d12ca38fd6c3df026930cce375e7473960e41` (PR #13).
- Builder cleanup head verified here: `d712ce3a315c3e2b67f65828cf633d2780b78897` (draft PR #14), based on the exact PR #13 head.
- Mutated scope remains `src/game/**/*.ts` plus `src/platform/**/*.ts` (14 files).
- Thresholds remain high 90, low 80, break 80.
- No test, fixture, Stryker configuration, package script, lockfile, or CI workflow changed for this re-run.
- Fresh result: **97.85%**, with 815 killed, 5 timeout-detected, 18 survived, and 0 no coverage across 838 mutants.
- Report: `reports/mutation/mutation.html`.

Stryker counts timeout-detected mutants as detected. The five timeout entries below are therefore killed mutants, not unresolved survivors.

## Before/after summary

| Stage                                 |      Score |  Killed | Timeout-detected | Survived | No coverage |   Total |
| ------------------------------------- | ---------: | ------: | ---------------: | -------: | ----------: | ------: |
| Initial expanded scope (`69be3c5`)    |     82.85% |     706 |                4 |      125 |          22 |     857 |
| Testwriter before cleanup (`242d12c`) |     96.38% |     819 |                7 |       31 |           0 |     857 |
| Builder cleanup (`d712ce3`)           | **97.85%** | **815** |            **5** |   **18** |       **0** | **838** |

The cleanup removed 19 reducer mutants: 13 previously survived equivalent mutants and 6 previously killed mutants. RNG's unchanged 100% result was classified as 31 killed plus 3 timeout-detected in this run rather than 29 killed plus 5 timeout-detected; every RNG mutant remained detected.

## Per-file mutation table

K/T/S/NC = killed / timeout-detected / survived / no coverage.

| File                          | Before cleanup score | Before K/T/S/NC | After cleanup score | After K/T/S/NC |
| ----------------------------- | -------------------: | --------------: | ------------------: | -------------: |
| `src/game/input.ts`           |               94.38% |        84/0/5/0 |              94.38% |       84/0/5/0 |
| `src/game/reducer.ts`         |               94.85% |      276/0/15/0 |          **99.26%** |  **270/0/2/0** |
| `src/game/rng.ts`             |              100.00% |        29/5/0/0 |             100.00% |       31/3/0/0 |
| `src/game/scoring.ts`         |              100.00% |        12/0/0/0 |             100.00% |       12/0/0/0 |
| `src/game/spawn.ts`           |              100.00% |       111/1/0/0 |             100.00% |      111/1/0/0 |
| `src/game/world.ts`           |               94.87% |        74/0/4/0 |              94.87% |       74/0/4/0 |
| `src/platform/audio.ts`       |               95.74% |        45/0/2/0 |              95.74% |       45/0/2/0 |
| `src/platform/input.ts`       |               94.59% |        35/0/2/0 |              94.59% |       35/0/2/0 |
| `src/platform/preferences.ts` |               94.12% |        16/0/1/0 |              94.12% |       16/0/1/0 |
| `src/platform/scheduler.ts`   |              100.00% |        27/1/0/0 |             100.00% |       27/1/0/0 |
| `src/platform/storage.ts`     |               97.83% |        90/0/2/0 |              97.83% |       90/0/2/0 |
| `src/platform/visibility.ts`  |              100.00% |        20/0/0/0 |             100.00% |       20/0/0/0 |
| **All files**                 |           **96.38%** |  **819/7/31/0** |          **97.85%** | **815/5/18/0** |

## All 18 surviving mutants: line-level classification

Every survivor is behavior-equivalent at the public contract. None represents an observable change in RNG, scoring, reducer ordering, shadows/collision/loss, pickup/deposit/win, spawning/world, keyboard/touch, scheduler, visibility, audio failure containment, preferences, or storage.

### `src/game/input.ts`

- **35, line 8** (`!x && !y` → `false`) — equivalent. When keyboard axes cancel, the following conditional returns the same zero vector because neither the diagonal nor cardinal branch can produce nonzero components.
- **65, line 18** (`touch.x || touch.y` → `true`) — equivalent. Releasing an already-zero touch only rewrites zero and increments an internal sequence; zero touch is bypassed by `movementForTick()`.
- **71, line 19** (`++sequence` → `--sequence`) — equivalent. `clear()` empties both sources and assigns both sequence markers the same value; only their relative ordering is observable.
- **73, line 20** (`++sequence` → `--sequence`) — equivalent for the same reason: interruption clears both sources and leaves equal markers.
- **87, line 21** (`>` → `>=`) — equivalent. Equal sequence markers occur only after clear/interruption while both vectors are zero; any subsequent real source update breaks the tie.

### `src/game/reducer.ts`

- **92, line 6** (`value < 0` → `value <= 0`) — equivalent because `Math.ceil(0)` and `Math.floor(0)` both produce numeric zero.
- **223, line 45** (`tick < 720` → `false`) — equivalent for reachable nonnegative active ticks. Before 720, `(tick - 720) % 1800 !== 0` already rejects every value except 720; at 720 the original first guard is false.

The former fresh-shadow tracking and empty-energy collision predicates are absent. Their 13 equivalent survivors were eliminated rather than pinned by implementation-detail tests.

### `src/game/world.ts`

- **557, 560, 562, 563, line 20** (ring-local conditional/subtraction mutations) — mathematically equivalent. The mutations shift a ring-local index by 10 or 20. Ring counts are 10, 10, and 8, so the resulting angular offsets are whole `2π` rotations and yield the same rounded coordinates and IDs. Static obstacle-row removal remains killed by exact-layout module-reset coverage.

### `src/platform/audio.ts`

- **609, line 2** (`context?.close?.()` → `context?.close()`) — equivalent at the public boundary. A present context without `close` throws only inside the cleanup `try`; the catch contains it after availability and the one-time notice are already set.
- **610, line 2** (`context?.close` → `context.close`) — equivalent. A missing context likewise throws only inside that containment `try`, leaving the same unavailable state and notice.

### `src/platform/input.ts`

- **647, line 2** (`value < 0` → `value <= 0`) — equivalent because ceil and floor agree at zero.
- **666, line 7** (`length > maximum` → `length >= maximum`) — equivalent at the exact radius: multiplying by `maximum / length` multiplies by one, leaving coordinates and normalized output unchanged.

### `src/platform/preferences.ts`

- **694, line 1** (`system?.()` → `system()`) — equivalent because an absent callback throws inside the surrounding `try`, and the catch returns the same `false` fallback as optional chaining.

### `src/platform/storage.ts`

- **735, line 4** (`!value || Array.isArray(value)` → `false`) — equivalent at public load/save boundaries. Arrays are rejected by the following prototype check; null/undefined make `Object.getPrototypeOf` throw, and the public catch returns the same invalid/false result.
- **736, line 4** (`||` → `&&` in the null/array guard) — equivalent for the same reason: the prototype check rejects arrays and the public catch contains null/undefined access. Full-schema arrays, null-prototype objects, and class instances are explicitly covered.

## Static-mutant review

All **44 static mutants were killed; zero static mutants survived**.

- `src/game/input.ts` lines 3–4, IDs **0–9** — empty code table, empty keyboard strings, and removed zero-vector factory are killed by module-reset key mapping/default-vector tests.
- `src/game/reducer.ts` lines 6–8 and 14, IDs **89, 94, 97, 129** — removed numeric/vector helper bodies are killed by reducer boundary, movement, collision, and ordering tests.
- `src/game/world.ts` lines 5–11, IDs **519–543** — removed obstacle layout/rows are killed by exact deterministic layout and geometry tests.
- `src/platform/storage.ts` lines 2–3, IDs **726–730** — empty defaults, altered booleans/string, and empty storage key are killed by schema-default, round-trip, and boundary tests.

## Timeout-detected mutants (killed)

- `src/game/rng.ts` IDs **379, 380, 382**, line 16 — removing/weakening the invalid-range guard or replacing the range subtraction admits an invalid width and reaches nonterminating rejection behavior; deterministic boundary tests detect each by timeout.
- `src/game/spawn.ts` ID **501**, line 22 — decrementing the attempt counter prevents reaching the 32-attempt cap when candidates are rejected.
- `src/platform/scheduler.ts` ID **719**, line 1 — emptying the fixed-step loop body prevents accumulator/count progress.

## Gate verification

- `npm run format:check` — pass.
- `npm run lint` — pass.
- `npm run test` — 8 files, 125 tests passed.
- `npm run build` — pass.
- `npm run test:e2e` — 49 browser tests passed across Chromium, Firefox, WebKit, phone/tablet/desktop responsive projects.
- `npm run test:mutation` — pass in 4m10s; score 97.85% >= 80; zero no-coverage and zero meaningful survivors.
