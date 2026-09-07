LAST LIGHT — PLAYING AND RECOVERY
Native Godot Edition 2.0.0

START
Extract the Windows ZIP completely, then open LastLight.exe. No editor or installation is required. Begin a new journey and select Story, Standard, or Eclipse. The Windows executable is unsigned; this release does not claim a publisher signing certificate.

Linux: extract the Linux ZIP, give LastLight.x86_64 execute permission if your extractor did not retain it, then run that file. The included compatibility-mode.sh is also executable. Desktop graphics drivers and normal operating-system graphics libraries are required; no game services or network connection are used.

GOAL
Return twenty stars and awaken all three wards. Carry at most five stars per trip. Deposit automatically when close to the lighthouse. Its wider circle is safe, but depositing requires approaching the tower. Your map and journal open with Tab. Gold markers are restored sanctuaries; crosses are remaining stars.

Bellwood: ring the bells with E in the order TWO, ONE, THREE. The glowing dots identify their numbers. A wrong note resets only the sequence.

Drowned Cloister: turn each mirror with E until its gold pointer meets the blue notch. An aligned mirror sends a visible thread of light to the ward. Keep all three aligned.

Ashen Crown: hold the right mouse button to focus on each of the three seals until its segments fill. Stay within ten metres, aim toward it, and keep a clear line of sight. Charge all three, then land three nearby lantern pulses on the guardian. Avoid the red windup marker; the guardian commits to its attack direction. The ward becomes a sanctuary when the guardian is released.

Last Watch: with twenty banked stars and all three wards restored, approach the lighthouse and press E. Kindle the three surrounding braziers with E, then return to the lens and press E. The watch lasts 90 seconds on Standard/Eclipse and 120 on Story. Lighting a brazier returns some lantern energy. Defeat or timeout lets you retry from the pre-watch checkpoint.

CONTROLS
WASD / arrows: move. Mouse: look. Shift: sprint. Space: dodge.
Right mouse, held: focus. Left mouse: pulse. E: interact.
Tab: map and journal. Escape: pause. Q: recenter.
Controller: left stick move, right stick look, LB sprint, A dodge, RT focus, RB pulse, X interact, Y map, Start pause, right-stick click recenter.
Optional touch: left-side drag to move, right-side drag to look, on-screen action buttons. Desktop touch and gamepad hardware have not been exhaustively certified.

A pulse costs 18 light; dodge costs 24 stamina. Stamina returns when not sprinting. Ordinary shadows are held back by a lit lantern. The guardian is not. Restored wards return health and light and establish a checkpoint, but do not bank stars. Energy depletes more quickly while focusing or carrying stars. Story reduces lantern pressure and enemy damage opportunities; Eclipse increases pressure. Difficulty is selected when starting a new journey.

SAVES
Windows: %APPDATA%\Godot\app_userdata\Last Light\
Linux: ~/.local/share/godot/app_userdata/Last Light/ (or beneath XDG_DATA_HOME when set).
Files: campaign.json, campaign.backup.json, settings.cfg.

Do not edit a save while the game is running. To make a personal backup, close the game and copy this folder. A malformed main campaign file is recovered from the previous valid backup when available. The game reports storage failures. A completely missing/unrecoverable save starts a new journey instead of preventing launch. There is one campaign slot; beginning again replaces it, with an explicit confirmation. Settings and best score remain.

For a normal exit, use Pause > Save and return to title, or Quit. An operating-system crash can still lose progress after the most recent save. A failed last watch does not overwrite its pre-ritual checkpoint. The browser edition's old localStorage save is not migrated to this different campaign.

GRAPHICS
Normal launch uses Forward+. High is the default. Ultra enables additional indirect lighting and is substantially more demanding. Lower quality or the 3D resolution scale before changing desktop resolution. Brightness changes exposure, not gameplay lantern energy. No measured minimum GPU specification or universal FPS guarantee is claimed.

If Vulkan/Forward+ fails to launch on your graphics driver, close the game and use Compatibility Mode.bat (Windows) or compatibility-mode.sh (Linux). Compatibility uses OpenGL and omits Forward+-only fog and indirect-lighting effects. Update graphics drivers through their manufacturer when necessary. These builds are 64-bit desktop executables, not browser files or APKs.

EDITING
Open project.godot in Godot 4.7.2 stable and press F5. An older 4.6.x editor is not the verified target. Models, animation, sound, and terrain are built from included source at startup. There are no missing asset packs to purchase or generate separately. Complete source, tests, build instructions, and engine notices accompany this release.
