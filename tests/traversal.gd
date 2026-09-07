extends Node
## Uses the actual CharacterBody3D controller to follow routes to every pickup.
## Combat is isolated in its own scenario; this test detects geometry and progression softlocks.
var game: LastLightGame
var failures: Array[String] = []
var traveled: float = 0
var simulated_ticks: int = 0
func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	call_deferred("run")
func tick() -> void:
	await get_tree().physics_frame
	simulated_ticks += 1
func walk_to(destination: Vector3, radius: float = 1.0) -> bool:
	var path: PackedVector3Array = game.world.route(game.player.global_position,destination)
	if path.is_empty():
		return false
	var cursor: int = 1 if path.size()>1 else 0
	var ticks: int = 0
	var last_position: Vector3 = game.player.global_position
	var stagnant: int = 0
	while ticks<3600:
		var delta: Vector3 = destination-game.player.global_position
		delta.y = 0
		if delta.length()<radius:
			game.player.override_move = Vector2.ZERO
			return true
		while cursor<path.size()-1 and Vector2(game.player.global_position.x,game.player.global_position.z).distance_to(Vector2(path[cursor].x,path[cursor].z))<.62:
			cursor += 1
		var toward: Vector3 = path[cursor]-game.player.global_position
		toward.y = 0
		if cursor==path.size()-1 and toward.length()<.45:
			toward = delta
		game.player.override_move = Vector2(toward.x,toward.z).normalized()
		await tick()
		var step: float = last_position.distance_to(game.player.global_position)
		traveled += step
		stagnant = stagnant+1 if step<.002 else 0
		last_position = game.player.global_position
		if stagnant>120:
			print("STUCK ",game.player.position," goal ",destination," waypoint ",path[cursor])
			return false
		ticks += 1
	print("TIMEOUT pos=",game.player.global_position," dest=",destination," cursor=",cursor," waypoint=",path[cursor]," pathsize=",path.size())
	return false
func run() -> void:
	game = load("res://scenes/main.tscn").instantiate() as LastLightGame
	add_child(game)
	await game.world_ready
	await tick()
	game.start_journey(0)
	game.shadow_timer = 100000
	for enemy: Shadow in game.shadows: enemy.active=false
	game.player.use_override = true
	game.player.yaw = 0
	for id: int in range(IslandData.STAR_POSITIONS.size()):
		var arrived: bool = await walk_to(IslandData.point(IslandData.STAR_POSITIONS[id]),.75)
		await tick()
		if not arrived or not (id in game.state.carried or id in game.state.banked):
			failures.append("pickup route "+str(id))
			print("FAIL pickup route ",id)
			break
		if game.state.carried.size()==5:
			if not await walk_to(IslandData.point(Vector2(0,5)),.8):
				failures.append("return to lighthouse after "+str(id))
				break
			await tick()
			print("BANKED ",game.state.banked.size()," travel ",int(traveled),"m")
	for site: Node3D in game.world.interactables:
		var arrived: bool = await walk_to(site.global_position,2.6)
		if not arrived:
			failures.append("interaction route "+site.name)
			break
	game.player.override_move = Vector2.ZERO
	var result: Dictionary = {"passed":failures.is_empty(),"failures":failures,"distance_m":snappedf(traveled,.01),"simulated_seconds":snappedf(simulated_ticks/60.0,.01),"banked":game.state.banked.size(),"stars":40,"sites":game.world.interactables.size()}
	var file: FileAccess = FileAccess.open("res://reports/traversal.json",FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(result,"  "))
	print(JSON.stringify(result,"  "))
	game.queue_free()
	await tick()
	await tick()
	get_tree().quit(0 if failures.is_empty() else 1)
