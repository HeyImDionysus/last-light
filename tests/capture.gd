extends Node
## Deterministic native-rendering scenes, not a simulated screenshot or concept image.
var game: LastLightGame
var directory: String = "res://reports/captures"
func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			directory = arg.trim_prefix("--capture-dir=")
	call_deferred("run")
func frames(count: int) -> void:
	for i: int in range(count):
		await get_tree().process_frame
func shot(name_value: String) -> void:
	await RenderingServer.frame_post_draw
	var error: Error = get_tree().root.get_texture().get_image().save_png(directory+"/"+name_value+".png")
	if error!=OK:
		push_error("Capture could not be written: "+name_value)
		get_tree().quit(1)
	print("CAPTURE ",name_value)
func run() -> void:
	DirAccess.make_dir_recursive_absolute(directory)
	game = load("res://scenes/main.tscn").instantiate() as LastLightGame
	get_tree().root.add_child(game)
	await game.world_ready
	await frames(10)
	await shot("01-title")
	game.start_journey(0)
	for enemy: Shadow in game.shadows:
		enemy.active = false
	await frames(18)
	await shot("02-lighthouse")
	game.player.teleport(IslandData.point(Vector2(-42,-20)))
	game.player.yaw = .0
	game.player.pitch = -.20
	await frames(12)
	await shot("03-bellwood")
	game.player.teleport(IslandData.point(Vector2(41,-23)))
	game.player.yaw = .0
	await frames(12)
	await shot("04-cloister")
	game.player.teleport(IslandData.point(Vector2(7,47)))
	game.player.yaw = PI
	game.player.rig.rotation.y = PI
	await frames(18)
	await shot("05-crown")
	game.pause_play()
	game.hud.show_map(game.state,game.player)
	await frames(4)
	await shot("06-map")
	game.hud.show_settings()
	await frames(4)
	await shot("07-settings")
	game.hud.show_controls()
	await frames(4)
	await shot("08-controls")
	game.resume_play()
	game.player.teleport(IslandData.point(Vector2(40,-27)))
	game.player.yaw = 0
	game.state.mirrors = [1,3,2]
	game.state.wards = [true,true,true]
	await frames(18)
	await shot("09-restored-cloister")
	game.player.teleport(IslandData.point(Vector2(7,12)))
	game.player.yaw = .4
	game.state.banked.assign(range(20))
	game.state.finale = true
	game.state.braziers = [true,true,true]
	await frames(18)
	await shot("10-last-watch")
	game.finish_journey()
	game.world.daylight = 1.0
	await frames(12)
	await shot("11-dawn")
	game.pause_play()
	game.hud.show_ending(game.state)
	await frames(4)
	await shot("12-ending")
	# Let the real ending timer finish before dismantling its scene.
	get_tree().paused = false
	Engine.time_scale = 64.0
	await frames(12)
	Engine.time_scale = 1.0
	get_tree().paused = false
	game.queue_free()
	await frames(3)
	await Sound.shutdown()
	print("CAPTURE_OK")
	get_tree().quit()
