# Native architecture

## Ownership

`scenes/main.tscn` instantiates `LastLightGame`. It coordinates campaign transitions and scene ownership; it is explicitly pausable. `GameHUD` continues to process while the game is paused. There is no hidden browser runtime, networking, or remote service.

`IslandData` contains authored coordinates, paths, star locations, journal text, encounter targets, and terrain height. Rendering, physical terrain, and navigation use the same surface. `RunState` is a renderer-independent campaign value object with bounded deserialization and explicit ownership of stars. `Profile` handles InputMap, options, checkpoint snapshots, atomic JSON writes, and backup recovery. `Sound` owns the audio buses, synthesized clips, bounded spatial voices, ambience, and danger/dawn mix.

`WorldBuilder` constructs the terrain mesh/collider, coast boundary, lighthouse, encounter sites, flora, stars, pages, lights, and navigation mesh. `Art` provides reusable original mesh/material factories. Repeated vegetation uses shared `MultiMesh` instances; solid objects have explicit physical colliders and inflated navigation blockers. The map is authored; its visual dressing has a fixed seed and is not a random-layout substitute for encounter design.

`Keeper` owns CharacterBody3D movement, resource-consuming actions, collision, camera orbit/spring arm, lantern lights, and input. `KeeperRig` provides the joint hierarchy and animation graph. `Shadow` owns navigation and the telegraphed behaviour state machine; `ShadowRig` supplies articulated creature visuals. The guardian and ordinary shadows share infrastructure but have different attack and light-response rules.

`GameHUD` builds native controls, binds actions, and renders progress, prompts, settings, endings, and modal screens. `IslandMap` reads the actual campaign and authored coordinates. Gameplay never reads screen pixels or uses the UI as authoritative state.

## Important boundaries

- RunState carries stable star/page IDs, not live Nodes. Collected/banked stars cannot be collected twice.
- The scene waits for the asynchronous navigation region to be synchronized and valid at the spawn before exposing gameplay. Queries use an explicit 32,768-polygon budget; the default query budget was insufficient for long cross-island routes.
- Player movement and encounter logic use the physics tick and delta. Camera smoothing reads interpolated player transforms without double-interpolating the top-level camera pivot.
- Input is configured idempotently. Rebinding preserves controller/mouse bindings and rejects keyboard collisions in the UI. Pause/focus loss clears touch movement.
- A pulse and focused beam require clear geometry line-of-sight. The focus ray stops in front of the target seal instead of falsely hitting its own collider.
- Starting the last watch saves its checkpoint once. Repeated lighthouse interaction cannot reset its timer, and completing it cannot award the ending twice.
- Failed saves leave the prior file available; the backup is updated only from a parseable previous save. There is no unsupported promise of protection from total disk failure.
- Test scenes use explicit input overrides/dispatch to isolate systems. `--smoke-test` is an opt-in release diagnostic that runs the actual embedded main scene without reading or writing a player save. It exits after physical movement and resource checks.

## Editing guide

Change campaign positions and narrative in `scripts/core/island_data.gd`; update both the game and tests when changing canonical rules. Encounter coordination is in `scripts/core/game.gd`. Mesh shape and decorative modelling live in `scripts/world/art.gd`; physical placement and navigation blockers live in `scripts/world/world_builder.gd`. Character proportions and animation curves are in `scripts/actors/keeper_rig.gd`. Materials and rendering effects are in `shaders/`.

All game assets are present as source-controlled procedural definitions. There is no detached asset pipeline, pending image generation task, commissioned asset dependency, or external download at runtime. Engine imports under `.godot/` are generated and must not be committed. UID sidecars for GDScript/shaders should be kept.

## Rendering and portability

Forward+ High is the desktop default. Ultra adds SDFGI/SSIL; Compatibility deliberately disables unsupported advanced effects. Physics gameplay is shared across renderers. Geometry and UI remain native 3D/Control nodes, not prerecorded visuals. Procedural audio generation occurs at boot and is cached; headless tests inspect the clips but do not start unnecessary playback threads.

The build tools target x86-64 Windows and Linux. They pin Godot 4.7.2, verify official toolchain digests, isolate verification saves, check engine error output as well as exit status, export embedded executables, and attach engine/third-party notices. Tests, reports, documentation, and development tools are excluded from exported game resources.
