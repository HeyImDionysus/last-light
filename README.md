# LAST LIGHT
### A Lantern Tale · Native Godot Edition · 2.0.0

An offline, third-person 3D adventure on a sleeping island. Carry fallen stars through a haunted forest, restore three ancient wards, and wake the lighthouse before the last watch ends.

This is a native Godot project, not a browser wrapper. The previous TypeScript, Canvas renderer, npm dependencies, browser tests, and web deployment configuration have been replaced. Their history remains in Git; they are not part of the current game.

## Play

Extract the **Windows** release ZIP and open **LastLight.exe**. Godot, Python, Node.js, an account, and an Internet connection are **not** required to play. Keep the included engine notices with redistributed builds. The executable is unsigned.

On Linux, extract the Linux ZIP, make `LastLight.x86_64` executable when necessary, and run it. `Compatibility Mode.bat` / `compatibility-mode.sh` select the OpenGL fallback. The normal launch uses Forward+.

**To edit:** import `project.godot` in **Godot 4.7.2 stable**, then press **F5**. Use that pinned version for the verified build, not 4.6.x. All game meshes, animation, shaders, and audio are generated from the included source. There is no asset-download step, paid asset pack, external font dependency, or server.

## The journey

Bank **20 stars** at the lighthouse; the satchel holds **five**. Restore the **Bellwood**, **Drowned Cloister**, and **Ashen Crown**, each with a different encounter. Then begin the **Last Watch** at the lighthouse, kindle the three braziers, and return to its lens. Completion changes the island to dawn and unlocks peaceful continued exploration.

There are **40 authored stars**, **eight journal pages**, three difficulty settings, checkpoints, recoverable defeat, an ending, credits, replay, and persistent progress. The map shows all uncollected stars. Stars are not currency for purchases; all content is available offline.

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move / look | WASD or arrows / mouse | Left / right stick |
| Sprint / dodge | Shift / Space | LB / A |
| Focus lantern / pulse | Hold right mouse / left mouse | Hold RT / RB |
| Interact / map and journal | E / Tab | X / Y |
| Pause / recenter camera | Escape / Q | Start / right-stick click |

Keyboard movement and utility keys are rebindable in Controls. Focus and pulse retain their mouse and controller bindings. Optional touch controls are available in Settings; this release packages desktop builds, not an Android APK.

The lit lantern holds ordinary shadows away. Focusing reaches farther; a pulse drives enemies back but costs light. The guardian can strike through passive lantern protection, so evade its red warning. Restored wards recharge light and health; **only the lighthouse banks stars**.

## Visual and audio systems

Forward+ provides shadowed local lighting, volumetric fog, glow, and ambient occlusion. **Ultra** adds SDFGI and screen-space indirect lighting. The Low preset, resolution scale, and separate Compatibility launch are available for slower devices. These are quality options, not a promise of a particular frame rate on untested hardware.

The keeper uses a 19-bone `Skeleton3D`, bone attachments, and an `AnimationTree` blending locomotion, lantern focus, pulse, and dodge. The world uses native 3D collision, navigation agents, shared MultiMesh vegetation, custom terrain/water/foliage/cloth/sky shaders, and particles. Spatial effects, ambient beds, musical textures, and interaction sounds are synthesized locally.

## Saves and accessibility

Progress is saved at deposits, restored wards, periodic exploration intervals, and normal exits. The last watch starts from a saved checkpoint so a failed ritual can be retried. Saves are versioned and written through a temporary file, with a last-known-good backup. Failure to save is reported without preventing play.

Settings include separate audio volumes, brightness, resolution scale, quality, fullscreen, vertical sync, look sensitivity, invert look, reduced camera motion, high-contrast HUD, ambient captions, focus-loss pause, and touch controls. No flashing strobe effect is used. See [Playing and recovery](docs/PLAYING.md) for save locations and troubleshooting.

## Build and verify

Python 3.11+ is needed only for the automated build tools. From this folder:

```text
python tools/toolchain.py
python tools/build.py
```

The installer downloads the pinned official Godot engine and desktop export templates, verifies their SHA-256 digests, and keeps the editor in `.toolchain/`. Building runs the native tests, exports embedded Windows and Linux executables, smoke-tests the build native to the current OS, and creates the release ZIPs and checksums in `dist/`.

An existing Godot installation can be supplied explicitly:

```text
python tools/verify.py --godot "C:\Tools\Godot_v4.7.2-stable_win64_console.exe"
python tools/build.py --godot "C:\Tools\Godot_v4.7.2-stable_win64_console.exe"
```

Install the matching 4.7.2 desktop export templates before building this way. Tests do not need export templates. Verification uses isolated test save directories, never the player's campaign. GitHub Actions also launches the exported Windows executable on a Windows runner.

[Architecture](docs/ARCHITECTURE.md) · [Game design](docs/DESIGN.md) · [Verification scope](docs/VERIFICATION.md)
