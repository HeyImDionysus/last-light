# Verification and release scope

## Automated checks

Run `python tools/verify.py`. This launches Godot scenes using the real engine, scene tree, physics, native UI, navigation server, autoloads, and save code. The report files are machine-generated; source size and test count alone are not evidence of visual quality.

**Contracts:** state and deserialization invariants, collection/deposit ownership and scoring, input setup, corrupt-save fallback, atomic-save path, startup readiness, navigation reachability, actual movement, puzzle state changes, focus charging, guardian progression, twenty-star goal, finale timeout/retry, completion/idempotence, pause/resume, native menus, and synthesized audio data. This suite mixes value-object tests with live-scene integration; it is not represented as one uninterrupted human playthrough.

**Combat:** actual physics-tick scenarios for light repulsion, directional focus, dark-state attacks, damage grace, dodge evasion, guardian attacks, sanctuary protection, pulse range, resource cost, and cooldown.

**Traversal:** a route-following keeper walks the authored island using CharacterBody3D, collects all forty stars, banks them in eight trips, and reaches all twenty-four interaction sites. Enemies are disabled in this isolated traversal test. It is a geometry/navigation/collectible acceptance test, not a claim that a human completed the campaign without interruption. The measured route is approximately 3.2 km of simulated travel.

**Standalone smoke:** launch the exported executable with the opt-in `--smoke-test` diagnostic. It loads the embedded main scene, constructs the full world, confirms all collectible/interaction resources, physically moves the keeper, and exits with structured evidence. The native CI tests Windows exports on Windows and Linux exports on Linux. This does not certify every GPU or desktop configuration.

Tests have disposable application-data folders. Repeated runs must not alter a real campaign or settings file. Tooling fails on an error exit, an explicit Godot `ERROR`/`SCRIPT ERROR`, a missing expected report, or a failed assertion.

## Visual evidence

`tests/capture.tscn` stages reproducible title, region, map, settings, controls, restoration, last-watch, dawn, and ending scenes and captures the **actual viewport**. There is no concept-art substitution or post-render reconstruction. To use it from an interactive graphics session:

```text
godot --path . --rendering-method forward_plus --fixed-fps 60 res://tests/capture.tscn -- --capture
```

Output defaults to `reports/captures/`. Override with `--capture-dir=/absolute/folder`. A headless display driver cannot provide rendering evidence; on Linux CI/workstations without a display, use a real renderer under Xvfb. Software Vulkan is useful for correctness review, **not** representative performance benchmarking.

During this rebuild, Linux software Vulkan/Forward+ and OpenGL Compatibility rendering were exercised. Native screenshots were inspected for scene visibility, interface clipping, character/camera composition, and active effect states. Native Windows startup/movement is a separate release check. No Windows GPU performance certification, physical gamepad/touch certification, headphone listening evaluation, or professional accessibility audit is claimed.

## Release hygiene

The active tree contains native source and its applicable tests/tools/docs. The old browser implementation, Node manifests/lockfile, obsolete specifications, mutation-report HTML, web tests and web workflows are removed. Git history is retained. Exported resources exclude tests, reports, build tools, and documentation. Source packages include editable source and build instructions; binaries carry the engine notices and offline playing guide. SHA-256 sums identify each distributed ZIP.
