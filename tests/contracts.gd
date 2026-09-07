extends Node
## Runs in a normal scene so the real autoloads, physics server and UI are exercised.
var checks: int = 0
var failures: Array[String] = []
var game: LastLightGame
func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	call_deferred("run")
func check(condition: bool, description: String) -> void:
	checks += 1
	if not condition:
		failures.append(description)
		print("FAIL: ",description)
func ticks(count: int) -> void:
	for i: int in range(count):
		await get_tree().physics_frame
func frames(count: int) -> void:
	for i: int in range(count):
		await get_tree().process_frame
func run() -> void:
	_test_state()
	_test_audio()
	_test_input()
	_test_storage()
	game = load("res://scenes/main.tscn").instantiate() as LastLightGame
	add_child(game)
	await game.world_ready
	await ticks(3)
	check(game.loaded,"boot completes")
	check(game.hud.mode=="menu","title is the entry point")
	check(game.world.stars.size()==40,"all 40 authored stars exist")
	check(game.world.page_nodes.size()==8,"all eight journal pages exist")
	check(game.world.interactables.size()==24,"every interaction site is constructed")
	_test_navigation()
	game.start_journey(0)
	await ticks(3)
	check(game.player.visible and game.player.active,"new journey activates and reveals keeper")
	check(game.player.rig.skeleton.get_bone_count()==19,"keeper uses its full 19-bone rig")
	await _test_movement()
	await _test_campaign()
	await _test_ui()
	get_tree().paused = false
	game.queue_free()
	await frames(4)
	var result: Dictionary = {"checks":checks,"failures":failures,"passed":failures.is_empty(),"engine":Engine.get_version_info().string}
	var json: String = JSON.stringify(result,"  ")
	var directory: String = "res://reports"
	DirAccess.make_dir_recursive_absolute(directory)
	var file: FileAccess = FileAccess.open(directory+"/contracts.json",FileAccess.WRITE)
	if file: file.store_string(json)
	print(json)
	get_tree().quit(0 if failures.is_empty() else 1)

func _test_state() -> void:
	var s: RunState = RunState.new()
	check(s.health==3 and s.energy==100 and s.banked.is_empty(),"new state defaults")
	check(not s.collect(-1) and not s.collect(40),"invalid star IDs rejected")
	for id: int in range(5):
		check(s.collect(id),"collect unique star "+str(id))
	check(not s.collect(5),"carry capacity enforced")
	check(not s.collect(0),"duplicate pickup rejected")
	s.energy = 18
	check(s.deposit()==5,"deposit returns full batch")
	check(s.carried.is_empty() and s.banked.size()==5,"deposit transfers ownership")
	check(s.energy==100 and s.health==3,"deposit restores light and health")
	check(s.score==893,"batch bonus and energy score exact")
	check(s.deposit()==0,"empty deposit has no reward")
	check(not s.collect(2),"banked star cannot be collected again")
	for id: int in range(5,20):
		check(s.collect(id),"subsequent pickup "+str(id))
		if s.carried.size()==5: s.deposit()
	check(not s.can_begin_finale(),"stars alone cannot unlock finale")
	s.wards = [true,true,true]
	check(s.can_begin_finale(),"20 stars and three wards unlock finale")
	s.finale = true
	check(not s.can_begin_finale(),"finale cannot be reset by repeated interaction")
	s.finale = false
	s.completed = true
	check(not s.can_begin_finale(),"completed game cannot award ending twice")
	s.completed = false
	var restored: RunState = RunState.from_dict(JSON.parse_string(JSON.stringify(s.as_dict())))
	check(restored.banked==s.banked and restored.wards==s.wards,"JSON round trip preserves progression")
	s = RunState.new()
	s.difficulty = 1
	s.lantern_step(10,false,false,false)
	check(is_equal_approx(s.energy,91.5),"baseline drain uses delta")
	s.energy = 1
	s.lantern_step(10,false,true,true)
	check(s.energy==0,"drain floors at zero")
	s.lantern_step(10,true,false,false)
	check(s.energy==100,"sanctuary recharge caps at 100")
	for invalid: Variant in [null,"wrong",{},[],INF,NAN]:
		check(RunState.from_dict({"version":invalid}).banked.is_empty(),"malformed version handled: "+str(invalid))
	var damaged: Dictionary = {"version":2,"banked":[0,0,1,-1,45,"2",NAN],"carried":[0,2,3,4,5,6,7,8],"energy":INF,"health":-8,"mirrors":[-1,8,{}],"seals":[-4,4,NAN],"bell_progress":3,"boss_health":0,"spawn":[999,999,999],"pages":[0,0,8,-2],"completed":true,"finale":true}
	var clean: RunState = RunState.from_dict(damaged)
	check(clean.banked==[0,1],"corrupt ownership deduplicated and filtered")
	check(clean.carried.size()==5 and not 0 in clean.carried,"carried overlap removed and capacity clamped")
	check(clean.health==1 and clean.energy==100,"malformed vitals sanitized")
	check(clean.mirrors==[0,3,0] and clean.seals==[0.0,1.0,0.0],"puzzle values sanitized")
	check(clean.bell_progress==0 and clean.boss_health==1,"incomplete puzzle state cannot index past bounds")
	check(not clean.completed and not clean.finale,"corrupt save cannot grant completion")
	check(Vector2(clean.spawn.x,clean.spawn.z).length()<77,"spawn remains inside island")
	var full: Array[Vector2] = IslandData.STAR_POSITIONS
	for i: int in range(full.size()):
		check(full[i].length()<74,"star stays within navigable island "+str(i))
		for j: int in range(i):
			check(full[i].distance_to(full[j])>.5,"unique star position %d/%d"%[i,j])

func _test_input() -> void:
	for action: String in ["move_forward","move_back","move_left","move_right","sprint","dodge","focus","pulse","map","pause","interact"]:
		check(InputMap.has_action(action) and not InputMap.action_get_events(action).is_empty(),"binding exists: "+action)
	var count: int = InputMap.action_get_events("pulse").size()
	Profile.configure_inputs()
	check(InputMap.action_get_events("pulse").size()==count,"input configuration is idempotent")
	Profile.bind_key("dodge",KEY_R,false)
	check(Profile.key_label("dodge")=="R","keyboard rebind applies")
	var joy_count: int = 0
	for event: InputEvent in InputMap.action_get_events("dodge"):
		if event is InputEventJoypadButton: joy_count += 1
	check(joy_count==1,"rebind preserves controller action")
	Profile.rebindings.clear()
	Profile.configure_inputs()

func _test_storage() -> void:
	# The runner must use a disposable XDG_DATA_HOME; never run against an operator profile.
	var s: RunState = RunState.new()
	Profile.test_mode = false
	check(Profile.save_campaign(s,true),"atomic save creates campaign")
	s.collect(0)
	check(Profile.save_campaign(s),"second atomic save replaces existing campaign")
	check(FileAccess.file_exists(Profile.BACKUP_PATH),"last-good backup is present")
	Profile.campaign.clear()
	check(Profile.load_campaign() and Profile.campaign["carried"]==[0],"saved campaign loads")
	var corrupt: FileAccess = FileAccess.open(Profile.SAVE_PATH,FileAccess.WRITE)
	corrupt.store_string("{broken")
	corrupt.close()
	Profile.campaign.clear()
	check(Profile.load_campaign() and Profile.recovered_backup,"corrupt main falls back to backup")
	check(Profile.campaign["carried"].is_empty(),"backup restores previous valid state")
	Profile.test_mode = true
	Profile.campaign.clear()
	Profile.checkpoint_data.clear()

func _test_navigation() -> void:
	var map: RID = game.world.navigation.get_navigation_map()
	check(NavigationServer3D.map_get_iteration_id(map)>0,"navigation map synchronized")
	var start: Vector3 = IslandData.point(Vector2(0,6))
	for i: int in range(IslandData.STAR_POSITIONS.size()):
		var goal: Vector3 = IslandData.point(IslandData.STAR_POSITIONS[i])
		var path: PackedVector3Array = game.world.route(start,goal)
		check(not path.is_empty() and path[path.size()-1].distance_to(goal)<1.6,"star reachable from hub: "+str(i))
	for site: Node3D in game.world.interactables:
		var path: PackedVector3Array = game.world.route(start,site.global_position)
		check(not path.is_empty() and path[path.size()-1].distance_to(site.global_position)<3.1,"site reachable: "+site.name)

func _test_movement() -> void:
	game.player.use_override = true
	game.player.yaw = 0
	game.player.teleport(IslandData.point(Vector2(0,12)))
	game.player.override_move = Vector2(1,0)
	await ticks(60)
	check(game.player.position.x>3.7 and game.player.position.x<4.8,"physics movement matches walking speed")
	check(absf(game.player.position.y-IslandData.height_at(Vector2(game.player.position.x,game.player.position.z)))<.25,"keeper follows physical terrain")
	game.player.override_move = Vector2.ZERO
	await ticks(15)
	var before: Vector3 = game.player.position
	check(game.player.request_dodge(),"dodge starts with sufficient stamina")
	check(not game.player.request_dodge(),"dodge cooldown cannot be bypassed")
	check(game.player.invulnerability>0,"dodge grants grace")
	await ticks(28)
	check(game.player.position.distance_to(before)>3,"dodge moves character through physics")
	game.player.teleport(IslandData.point(Vector2(0,6)))
	game.player.override_move = Vector2(0,-1)
	await ticks(120)
	check(game.player.position.z>2.15,"lighthouse blocks sustained movement")
	game.player.override_move = Vector2.ZERO
	game.player.use_override = false
	game.player.invulnerability = 0
	var health: int = game.state.health
	check(game.player.receive_hit(Vector3(2,0,0)),"first eligible attack deals damage")
	check(game.state.health==health-1,"health decrements once")
	check(not game.player.receive_hit(Vector3(2,0,0)),"grace prevents repeated same-window damage")
	game.state.health = 3
	game.player.invulnerability = 0

func _test_campaign() -> void:
	game.player.teleport(IslandData.point(Vector2(-43,-24)))
	game.ring_bell(0)
	check(game.state.bell_progress==0,"wrong bell resets sequence")
	for index: int in IslandData.BELL_ORDER: game.ring_bell(index)
	check(game.state.wards[0] and game.state.bell_progress==3,"bell sequence restores first ward")
	check(Profile.checkpoint_data["wards"][0],"ward checkpoint persists before death")
	var score: int = game.state.score
	game.ring_bell(2)
	check(game.state.score==score,"restored bells cannot award duplicate score")
	for index: int in range(3):
		for turns: int in range(IslandData.MIRROR_TARGETS[index]): game.turn_mirror(index)
	check(game.state.wards[1],"all mirror targets restore cloister")
	game.player.teleport(IslandData.point(Vector2(5,42)))
	var boss_health: int = game.state.boss_health
	game.guardian.receive_pulse(game.player.global_position)
	check(game.state.boss_health==boss_health,"sealed guardian is invulnerable")
	# Exercise charging through the actual fixed-step focus/raycast path, not state assignment.
	game.guardian.active = false
	for i: int in range(3):
		var seal: Vector3 = game.world.seal_nodes[i].global_position
		game.player.teleport(seal+Vector3(0,0,4))
		game.player.yaw = 0
		game.player.external_focus = true
		game.state.energy = 100
		await ticks(225)
		check(game.state.seals[i]>=1,"seal charged by focused lantern and clear ray: "+str(i))
	game.player.external_focus = false
	for i: int in range(3):
		game.guardian.receive_pulse(game.player.global_position)
	check(game.state.boss_health==0 and game.state.wards[2],"three pulses release unsealed guardian")
	check(not game.state.can_begin_finale(),"wards without stars cannot complete journey")
	# Banking uses actual fixed-step pickup and lighthouse return.
	for id: int in range(20):
		game.player.teleport(IslandData.point(IslandData.STAR_POSITIONS[id]))
		await ticks(3)
		check(id in game.state.carried or id in game.state.banked,"physical pickup collected: "+str(id))
		if game.state.carried.size()>=5:
			game.player.teleport(IslandData.point(Vector2(0,5)))
			await ticks(3)
	game.player.teleport(IslandData.point(Vector2(0,5)))
	await ticks(4)
	check(game.state.banked.size()>=20,"five-star trips bank the required 20 stars")
	check(game.state.can_begin_finale(),"entire campaign unlocks the last watch")
	game.begin_finale()
	check(game.state.finale,"last watch begins")
	game.state.ritual_time = 42
	game.interact_site("lighthouse",0)
	check(game.state.ritual_time==42,"lighthouse interaction cannot reset active finale")
	game.state.ritual_time = .01
	await ticks(3)
	check(game.dying and game.hud.mode=="death","finale timeout enters recoverable failure")
	game.retry()
	await ticks(3)
	check(not game.state.finale and game.state.can_begin_finale(),"retry restores pre-finale checkpoint")
	check(game.state.deaths==1 and game.state.health==3,"retry records death and restores health")
	game.begin_finale()
	for i: int in range(3): game.interact_site("brazier",i)
	check(game.state.braziers==[true,true,true],"all braziers can be kindled")
	game.interact_site("lighthouse",0)
	check(game.state.completed and not game.state.finale,"final interaction completes campaign")
	check(Profile.campaign["completed"],"ending persists to campaign save")
	var final_score: int = game.state.score
	game.finish_journey()
	check(game.state.score==final_score,"ending score cannot be awarded twice")
	game.ending = false
	game.resume_play()
	await ticks(3)
	check(game.state.energy==100,"dawn exploration remains playable")

func _test_ui() -> void:
	game.pause_play()
	game.hud.show_pause()
	check(get_tree().paused and game.hud.mode=="pause","pause suspends simulation")
	var elapsed: float = game.state.elapsed
	await frames(5)
	check(game.state.elapsed==elapsed,"paused frames do not advance campaign time")
	game.hud.show_settings()
	await frames(3)
	check(game.hud.mode=="settings","settings opens while paused")
	Profile.set_option("brightness",1.25)
	check(is_equal_approx(game.world.environment.tonemap_exposure,1.4),"brightness affects renderer")
	Profile.set_option("brightness",1.0)
	game.hud.show_controls()
	await frames(3)
	check(game.hud.mode=="controls","controls editor opens")
	Profile.bind_key("interact",KEY_F,false)
	game._on_action("reset_keys",null)
	check(Profile.key_label("interact")=="E" and Profile.rebindings.is_empty(),"restore default bindings resets keyboard controls")
	game.hud.awaiting_key = "interact"
	var test_button: Button = Button.new()
	game.hud.add_child(test_button)
	game.hud.key_button = test_button
	var conflict: InputEventKey = InputEventKey.new()
	conflict.physical_keycode = KEY_W
	conflict.pressed = true
	game.hud._input(conflict)
	check(game.hud.awaiting_key=="interact" and Profile.key_label("interact")=="E","rebinding rejects a key already used for movement")
	game.hud.awaiting_key = ""
	test_button.queue_free()
	game.hud.show_map(game.state,game.player)
	await frames(3)
	check(game.hud.map_widget.state==game.state,"survey uses active campaign")
	game.hud.show_page(0)
	await frames(3)
	check(game.hud.mode=="page","full journal page opens")
	game.hud.show_credits()
	await frames(3)
	check(game.hud.mode=="credits","credits screen opens")
	game.hud.show_ending(game.state)
	await frames(3)
	check(game.hud.mode=="ending","ending statistics screen opens")
	game.resume_play()
	check(not get_tree().paused and game.player.active,"resume restores simulation and input")
	game.show_title(true)
	check(not game.playing and game.hud.mode=="menu","save and return to title works")
	game.start_journey(1,true)
	await ticks(3)
	check(game.state.completed and game.player.visible,"completed save can be continued programmatically")

func _test_audio() -> void:
	check(Sound.clips.size()>=17,"original sound palette is constructed")
	for key: String in Sound.clips:
		var clip: AudioStreamWAV = Sound.clips[key]
		check(clip.data.size()>3000 and clip.get_length()>0.1,"nonempty synthesized clip: "+key)
