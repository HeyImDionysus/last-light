extends Node
var game: LastLightGame
var failures: Array[String] = []
var checks: int = 0
func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	call_deferred("run")
func ticks(count: int) -> void:
	for i: int in range(count):
		await get_tree().physics_frame
func check(condition: bool, description: String) -> void:
	checks += 1
	if not condition:
		failures.append(description)
		print("FAIL: ",description)
func place(enemy: Shadow, offset: Vector3, mode: Shadow.Mode = Shadow.Mode.STALK) -> void:
	enemy.position = game.player.position+offset
	enemy.velocity = Vector3.ZERO
	enemy.home = enemy.position
	enemy.mode = mode
	enemy.wake_delay = 0
	enemy.path_timer = 0
	enemy.active = true
	enemy.timer = .01
	enemy.strike_direction = -offset.normalized()
	enemy.reset_physics_interpolation()
func run() -> void:
	game = load("res://scenes/main.tscn").instantiate() as LastLightGame
	add_child(game)
	await game.world_ready
	await ticks(2)
	game.start_journey(1)
	game.shadow_timer = 100000
	for enemy: Shadow in game.shadows: enemy.active=false
	game.player.teleport(IslandData.point(Vector2(0,18)))
	await ticks(3)
	var shade: Shadow = game._spawn_shadow(game.player.position+Vector3(0,0,3),false)
	place(shade,Vector3(0,0,3))
	game.state.energy = 100
	await ticks(6)
	check(shade.mode==Shadow.Mode.REPELLED,"ordinary shade is repelled by a lit lantern")
	check(shade.position.distance_to(game.player.position)>3,"repulsion moves shade away physically")
	place(shade,Vector3(0,0,9))
	game.player.yaw = PI
	game.player.external_focus = true
	await ticks(5)
	check(shade.mode==Shadow.Mode.REPELLED,"focused lantern repels at distance with clear line of sight")
	game.player.external_focus = false
	place(shade,Vector3(0,0,1.5),Shadow.Mode.WINDUP)
	game.state.energy = 0
	game.player.invulnerability = 0
	game.state.health = 3
	await ticks(20)
	check(game.state.health==2,"committed shade strike damages an unlit keeper")
	check(game.player.invulnerability>0,"strike grants damage grace")
	shade.active = false
	game.player.teleport(IslandData.point(Vector2(0,18)))
	game.player.invulnerability = 0
	game.player.dodge_cooldown = 0
	game.state.stamina = 100
	game.state.energy = 0
	game.state.health = 3
	place(shade,Vector3(0,0,.9),Shadow.Mode.STRIKE)
	shade.timer = .3
	check(game.player.request_dodge(),"dodge action accepted before a strike")
	await ticks(12)
	check(game.state.health==3,"dodge grace avoids the committed strike")
	shade.active = false
	var guardian: Shadow = game.guardian
	game.player.teleport(IslandData.point(Vector2(0,18)))
	game.player.dodge_time = 0
	game.player.invulnerability = 0
	game.state.energy = 100
	game.state.health = 3
	place(guardian,Vector3(0,0,2.0),Shadow.Mode.WINDUP)
	await ticks(16)
	check(game.state.health==2,"guardian strikes through passive lantern protection")
	guardian.active = false
	game.state.health = 3
	game.player.teleport(IslandData.point(Vector2(0,5)))
	game.player.invulnerability = 0
	game.state.energy = 0
	place(shade,Vector3(0,0,1.0),Shadow.Mode.STRIKE)
	shade.timer = .3
	await ticks(12)
	check(game.state.health==3,"sanctuary prevents strike damage")
	shade.active = false
	game.player.teleport(IslandData.point(Vector2(0,18)))
	game.state.energy = 17
	game.player.pulse_cooldown = 0
	check(not game.player.request_pulse(),"pulse cannot spend nonexistent light")
	game.state.energy = 100
	place(shade,Vector3(0,0,6))
	check(game.player.request_pulse(),"eligible pulse accepted")
	check(game.state.energy==82,"pulse spends exactly 18 light")
	check(shade.mode==Shadow.Mode.REPELLED,"pulse reaches a shade within range")
	check(not game.player.request_pulse(),"pulse cooldown prevents repeat activation")
	var result: Dictionary = {"passed":failures.is_empty(),"checks":checks,"failures":failures}
	var file: FileAccess = FileAccess.open("res://reports/combat.json",FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(result,"  "))
	print(JSON.stringify(result,"  "))
	game.queue_free()
	await ticks(3)
	get_tree().quit(0 if failures.is_empty() else 1)
