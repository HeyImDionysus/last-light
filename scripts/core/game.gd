class_name LastLightGame
extends Node3D
## Campaign coordinator. Simulation is paused by the scene tree; UI continues independently.
signal world_ready
signal campaign_finished
var world: WorldBuilder
var player: Keeper
var hud: GameHUD
var title_camera: Camera3D
var state: RunState = RunState.new()
var shadows: Array[Shadow] = []
var guardian: Shadow
var loaded: bool = false
var playing: bool = false
var dying: bool = false
var ending: bool = false
var nearest: Node3D
var hud_timer: float = 0
var shadow_timer: float = 35
var autosave_timer: float = 30
var warning_timer: float = 0
var last_safe: int = -99
var last_region: int = -99
var back_target: String = "menu"
var page_from_map: bool = false
var last_caption: float = 0
var pulse_effects: Array[Dictionary] = []
var manual_scene: bool = false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE
	get_tree().auto_accept_quit = false
	name = "LastLight"
	hud = GameHUD.new()
	add_child(hud)
	hud.action_requested.connect(_on_action)
	Profile.storage_error.connect(func(message: String) -> void: notify(message,6))
	world = WorldBuilder.new()
	world.name = "Island"
	add_child(world)
	await world.build()
	player = Keeper.new()
	player.game = self
	player.state = state
	player.position = state.spawn
	add_child(player)
	player.pulse_requested.connect(pulse)
	player.interacted.connect(interact)
	hud.touch_keeper = player
	title_camera = Camera3D.new()
	title_camera.name = "TitleCamera"
	title_camera.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	title_camera.position = Vector3(9,5.6,17)
	title_camera.fov = 48
	title_camera.far = 240
	add_child(title_camera)
	title_camera.look_at(Vector3(-4,5.2,0))
	title_camera.make_current()
	Profile.settings_changed.connect(world.apply_quality)
	await get_tree().physics_frame
	var nav_map: RID = world.navigation.get_navigation_map()
	var nav_deadline: int = Time.get_ticks_msec()+20000
	while NavigationServer3D.map_get_iteration_id(nav_map)==0 or NavigationServer3D.map_get_closest_point(nav_map,state.spawn).distance_to(state.spawn)>1.0:
		if Time.get_ticks_msec()>nav_deadline:
			push_error("Island navigation failed to synchronize within 20 seconds.")
			get_tree().quit(1)
			return
		await get_tree().physics_frame
	loaded = true
	world_ready.emit()
	show_title(false)
	if "--smoke-test" in OS.get_cmdline_user_args():
		call_deferred("_export_smoke")

func _process(delta: float) -> void:
	if not loaded:
		return
	world.update_visuals(state,delta)
	_update_effects(delta)
	if not playing:
		state.elapsed += delta
		if not Profile.options["reduce_motion"]:
			var t: float = Time.get_ticks_msec()*.000035
			title_camera.position = Vector3(9+sin(t)*1.5,5.6+sin(t*.7)*.2,17+cos(t)*1.0)
			title_camera.look_at(Vector3(-4,5.2,0))
		return
	hud_timer -= delta
	if hud_timer<=0:
		hud_timer = .08
		_update_hud()
	Sound.dawn = world.daylight
	var closest_shadow: float = 30.0
	for shadow: Shadow in shadows:
		if shadow.active and shadow.visible:
			closest_shadow = minf(closest_shadow,shadow.global_position.distance_to(player.global_position))
	Sound.danger = 1.0-clampf((closest_shadow-3)/15.0,0,1)

func _physics_process(delta: float) -> void:
	if not loaded or not playing or dying or ending:
		return
	state.elapsed += delta
	state.spawn = player.global_position
	var safe: bool = is_safe(player.global_position)
	if not state.completed:
		state.lantern_step(delta,safe,player.focused,player.sprinting)
	else:
		state.energy = 100
		state.health = 3
	for i: int in range(world.stars.size()):
		if world.stars[i].visible and player.global_position.distance_squared_to(world.stars[i].global_position)<2.35:
			if state.collect(i):
				world.stars[i].hide()
				Sound.at("pickup",world.stars[i].global_position,-8,1.0+state.carried.size()*.065)
				if not "first_star" in state.tutorial:
					state.tutorial.append("first_star")
					notify("A fallen star. Carry it back to the lighthouse. Your satchel holds five.",5)
	if not state.finale and Vector2(player.position.x,player.position.z).length()<6.3:
		var count: int = state.deposit()
		if count>0:
			Sound.at("deposit",player.position,-3)
			notify("%d stars returned. Lantern restored. Journey saved."%count,4)
			state.checkpoint = -1
			Profile.save_campaign(state,true)
		elif last_safe!=-1:
			state.health = 3
			state.checkpoint = -1
			Profile.save_campaign(state,true)
		last_safe = -1
	else:
		var current_safe: int = -99
		for i: int in range(3):
			if state.wards[i] and player.global_position.distance_to(world.ward_nodes[i].global_position)<5:
				current_safe = i
				if last_safe!=i:
					state.health = 3
					state.energy = 100
					state.checkpoint = i
					Profile.save_campaign(state,true)
					notify("Sanctuary. Your light and health are restored. Checkpoint saved.",3)
		last_safe = current_safe
	if not state.wards[2] and player.focused and player.position.distance_to(IslandData.point(IslandData.WARD_CENTERS[2]))<21:
		for i: int in range(3):
			var seal: Node3D = world.seal_nodes[i]
			if state.seals[i]<1 and player.global_position.distance_to(seal.global_position)<10 and player.facing(seal.global_position+Vector3(0,1.5,0),.3) and _line_clear(player.global_position+Vector3(0,1.5,0),seal.global_position+Vector3(0,1.5,0)+(player.global_position-seal.global_position).normalized()*.8):
				state.seals[i] = minf(1,state.seals[i]+delta/3.4)
				if state.seals[i]>=1:
					state.energy = minf(100,state.energy+15)
					Sound.at("ward",seal.global_position,-8,1.2)
					notify("A seal is awake. Keep moving; the guardian commits to each charge.",3.5)
					if state.seals[0]>=1 and state.seals[1]>=1 and state.seals[2]>=1:
						notify("The crown is open. Three lantern pulses will release the guardian.",5)
	if state.finale:
		state.ritual_time = maxf(0,state.ritual_time-delta)
		if state.ritual_time<=0:
			_die("The last watch ended before the lighthouse could wake.")
			return
	shadow_timer -= delta
	if shadow_timer<=0 and not state.completed:
		shadow_timer = 14 if state.finale else 32
		if shadows.size()<8+(2 if state.finale else 0):
			_spawn_roamer()
	autosave_timer -= delta
	if autosave_timer<=0 and not state.finale:
		autosave_timer = 30
		Profile.save_campaign(state)
	warning_timer = maxf(0,warning_timer-delta)
	if state.energy<12 and not safe and warning_timer<=0 and not state.completed:
		warning_timer = 18
		notify("The lantern is nearly empty. Follow the lighthouse beam or find a restored ward.",5)
		Sound.play("warning",-14)
	if Profile.options["subtitles"] and state.elapsed-last_caption>55 and not state.completed:
		last_caption = state.elapsed
		if not safe and hud.toast_time<=0:
			notify("[Branches creak. A distant bell answers the sea.]",3)
	var region: int = IslandData.region_at(Vector2(player.position.x,player.position.z))
	if region!=last_region:
		last_region = region
		if region==2 and not "crown" in state.tutorial:
			state.tutorial.append("crown")
			notify("The Ashen Crown. Focus on the three standing stones. Dodge the guardian’s red warning.",6)
		elif region==1 and not "cloister" in state.tutorial:
			state.tutorial.append("cloister")
			notify("The Drowned Cloister. Turn the mirrors until each gold pointer meets its blue notch.",6)
		elif region==0 and not "bellwood" in state.tutorial:
			state.tutorial.append("bellwood")
			notify("The Bellwood. The keeper’s journal remembers the order of the bells.",5)

func start_journey(difficulty: int, resume: bool = false) -> void:
	get_tree().paused = false
	ending = false
	dying = false
	state = RunState.from_dict(Profile.campaign) if resume and not Profile.campaign.is_empty() else RunState.new()
	if not resume:
		state.difficulty = clampi(difficulty,0,2)
		Profile.checkpoint_data.clear()
		Profile.save_campaign(state,true)
	world.daylight = 0
	world.sky_material.set_shader_parameter("dawn",0.0)
	world.moon.light_color = Color(.58,.76,.87)
	world.moon.light_energy = .85
	world.environment.fog_density = .008
	world.environment.volumetric_fog_density = .018
	player.state = state
	player.show()
	player.teleport(state.spawn)
	player.yaw = 0
	player.pitch = -.2
	player.hurt_flash = 0.0
	player.invulnerability = 2.0
	player.pulse_cooldown = 0
	player.dodge_cooldown = 0
	player.touch_move = Vector2.ZERO
	player.touch_focus = false
	playing = true
	last_region = -99
	last_safe = -99
	last_caption = state.elapsed
	shadow_timer = 24
	autosave_timer = 30
	_reset_enemies()
	world.update_visuals(state,0)
	resume_play()
	if not resume:
		notify("The lighthouse has gone dark. Find the fallen stars, restore the three wards, and bring the dawn home.  [Tab] opens your survey.",7)
	elif Profile.recovered_backup:
		notify("Your previous checkpoint was recovered from the backup save.",5)
	else:
		notify("The light remembers where you left it.",3)

func _reset_enemies() -> void:
	for enemy: Shadow in shadows:
		remove_child(enemy)
		enemy.queue_free()
	shadows.clear()
	guardian = null
	if state.completed:
		return
	for i: int in range(4):
		var points: Array[Vector2] = [Vector2(-28,-32),Vector2(23,-34),Vector2(-24,30),Vector2(40,21)]
		_spawn_shadow(IslandData.point(points[i]),false)
	guardian = _spawn_shadow(IslandData.point(IslandData.WARD_CENTERS[2]+Vector2(0,2)),true)
	if state.wards[2]:
		guardian.mode = Shadow.Mode.GONE
		guardian.hide()

func _spawn_shadow(at: Vector3, boss: bool) -> Shadow:
	var enemy: Shadow = Shadow.new()
	enemy.game = self
	enemy.target = player
	enemy.state = state
	enemy.guardian = boss
	enemy.serial = shadows.size()
	enemy.position = at+Vector3(0,.07,0)
	add_child(enemy)
	enemy.active = playing
	shadows.append(enemy)
	return enemy

func _spawn_roamer() -> void:
	var navigation_map: RID = world.navigation.get_navigation_map()
	for attempt: int in range(12):
		var angle: float = state.elapsed*1.14+attempt*2.399
		var p: Vector3 = player.global_position+Vector3(sin(angle)*25,0,cos(angle)*25)
		p = NavigationServer3D.map_get_closest_point(navigation_map,p)
		if p.distance_to(player.global_position)<20 or is_safe(p):
			continue
		var visible: bool = not player.camera.is_position_behind(p) and player.camera.is_position_in_frustum(p+Vector3(0,1,0))
		if visible and attempt<10:
			continue
		_spawn_shadow(p,false)
		return

func is_safe(at: Vector3) -> bool:
	var radius: float = 3.4 if state.finale else 8.5
	if Vector2(at.x,at.z).length()<radius:
		return true
	for i: int in range(3):
		if state.wards[i] and Vector2(at.x,at.z).distance_to(IslandData.WARD_CENTERS[i])<5.0:
			return true
	return false

func _line_clear(from: Vector3, to: Vector3) -> bool:
	return get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from,to,1)).is_empty()

func _update_hud() -> void:
	var region: int = IslandData.region_at(Vector2(player.position.x,player.position.z))
	var name_value: String = "The Sleeping Lighthouse" if region<0 else IslandData.WARD_NAMES[region]
	nearest = null
	var best: float = 3.0
	for site: Node3D in world.interactables:
		var distance: float = player.global_position.distance_to(site.global_position)
		if distance<best:
			best = distance
			nearest = site
	var prompt: String = ""
	if nearest:
		var kind: String = nearest.get_meta("kind")
		var index: int = nearest.get_meta("index")
		var use_key: String = "X" if hud.controller else Profile.key_label("interact")
		match kind:
			"page": prompt = "[%s] Read the keeper’s journal"%use_key
			"bell": prompt = "[%s] Ring bell %d"%[use_key,index+1] if not state.wards[0] else "The Bellwood remembers."
			"mirror": prompt = "[%s] Turn mirror  ·  Match gold to blue"%use_key if not state.wards[1] else "The cloister is awake."
			"seal": prompt = "Hold focus on the seal   %d%%"%int(state.seals[index]*100) if state.seals[index]<1 else "The seal is awake."
			"ward": prompt = "Sanctuary · Light and health restored" if state.wards[index] else "This ward is asleep. Restore its surrounding mechanisms."
			"brazier": prompt = "[%s] Kindle the brazier"%use_key if state.finale and not state.braziers[index] else "A brazier for the last watch."
			"lighthouse":
				if state.finale:
					prompt = "[%s] Release the dawn"%use_key if state.braziers[0] and state.braziers[1] and state.braziers[2] else "Kindle all three braziers before returning to the lens."
				elif state.can_begin_finale():
					prompt = "[%s] Begin the last watch"%use_key
				else:
					prompt = "Sanctuary · The lighthouse needs 20 stars and 3 restored wards."
	hud.update_state(state,player,objective(),name_value,prompt)

func objective() -> String:
	if state.completed:
		return "A world worth returning to."
	if state.finale:
		if state.braziers[0] and state.braziers[1] and state.braziers[2]:
			return "Return to the lighthouse and release the dawn."
		return "Kindle three braziers before the last light fades."
	if state.can_begin_finale():
		return "Return to the lighthouse. Begin the last watch."
	if state.carried.size()>=5:
		return "Carry your five stars back to the lighthouse."
	if state.ward_count()<3:
		var region: int = IslandData.region_at(Vector2(player.position.x,player.position.z))
		if region==0 and not state.wards[0]: return "Ring the bells: two, one, then three."
		if region==1 and not state.wards[1]: return "Align the three mirrors: gold pointer to blue notch."
		if region==2 and not state.wards[2]:
			if state.seals[0]>=1 and state.seals[1]>=1 and state.seals[2]>=1:
				return "Pulse the unsealed guardian. %d strikes remain."%state.boss_health
			return "Focus on three seals. Evade the guardian."
		return "Recover fallen stars and awaken the three wards."
	return "Return 20 stars to the lighthouse."

func interact() -> void:
	if not playing or dying or ending or get_tree().paused:
		return
	_update_hud()
	if nearest==null:
		return
	interact_site(nearest.get_meta("kind"),int(nearest.get_meta("index")))

func interact_site(kind: String, index: int) -> void:
	# The interaction dispatcher is also exercised directly by deterministic contract tests.
	match kind:
		"page":
			if index<0 or index>=IslandData.PAGES.size(): return
			if not index in state.pages:
				state.pages.append(index)
				state.score += 150
				Profile.save_campaign(state)
			Sound.play("page",-8)
			page_from_map = false
			pause_play()
			hud.show_page(index)
		"bell": ring_bell(index)
		"mirror": turn_mirror(index)
		"ward":
			if index>=0 and index<3 and state.wards[index]:
				state.health = 3
				state.energy = 100
				state.checkpoint = index
				Profile.save_campaign(state,true)
		"brazier":
			if index>=0 and index<3 and state.finale and not state.braziers[index]:
				state.braziers[index] = true
				state.energy = minf(100,state.energy+28)
				Sound.at("ward",world.brazier_nodes[index].global_position,-4)
				notify("A brazier is kindled. The light gives something back.",3)
		"lighthouse":
			if state.finale and state.braziers[0] and state.braziers[1] and state.braziers[2]:
				finish_journey()
			elif state.can_begin_finale():
				begin_finale()

func ring_bell(index: int) -> void:
	if state.wards[0] or index<0 or index>=3:
		return
	Sound.at("bell"+str(index),world.bell_nodes[index].global_position,-3)
	var bell: Node3D = world.bell_nodes[index].get_node("Visual/BellBody")
	var tween: Tween = create_tween()
	tween.tween_property(bell,"rotation:z",.15,.13)
	tween.tween_property(bell,"rotation:z",-.12,.28)
	tween.tween_property(bell,"rotation:z",.06,.3)
	tween.tween_property(bell,"rotation:z",0,.45)
	if index==IslandData.BELL_ORDER[state.bell_progress]:
		state.bell_progress += 1
		if state.bell_progress==3:
			awaken_ward(0)
		else:
			notify("The forest answers. %d of 3 notes remembered."%state.bell_progress,2.5)
	else:
		state.bell_progress = 0
		notify("The melody slips away. Start again: two, one, three.",3)

func turn_mirror(index: int) -> void:
	if state.wards[1] or index<0 or index>=3:
		return
	state.mirrors[index] = (state.mirrors[index]+1)%4
	Sound.at("turn",world.mirror_nodes[index].global_position,-7)
	if state.mirrors[index]==IslandData.MIRROR_TARGETS[index]:
		Sound.at("pickup",world.mirror_nodes[index].global_position,-11,.7)
		notify("Gold meets blue. This mirror is aligned.",2)
	if state.mirrors[0]==IslandData.MIRROR_TARGETS[0] and state.mirrors[1]==IslandData.MIRROR_TARGETS[1] and state.mirrors[2]==IslandData.MIRROR_TARGETS[2]:
		awaken_ward(1)

func awaken_ward(index: int) -> void:
	if state.wards[index]:
		return
	state.wards[index] = true
	state.score += 1200
	state.energy = 100
	state.health = 3
	state.checkpoint = index
	state.spawn = world.ward_nodes[index].global_position+Vector3(0,0,3.0)
	Profile.save_campaign(state,true)
	state.spawn = player.global_position
	Sound.at("ward",world.ward_nodes[index].global_position,-1)
	notify(IslandData.WARD_NAMES[index]+" is awake. A new sanctuary. Journey saved.",5)
	_add_pulse(world.ward_nodes[index].global_position,10)

func guardian_hit() -> void:
	if state.boss_health<=0:
		awaken_ward(2)
		notify("The guardian lays down its crown. Even the oldest shadow was waiting for morning.",6)
	else:
		notify("The crown fractures. %d pulses remain."%state.boss_health,3)

func pulse() -> void:
	_add_pulse(player.global_position,7.8)
	for enemy: Shadow in shadows:
		if enemy.active and enemy.global_position.distance_to(player.global_position)<7.8 and _line_clear(player.global_position+Vector3(0,1.2,0),enemy.global_position+Vector3(0,1.2,0)):
			enemy.receive_pulse(player.global_position)

func _add_pulse(at: Vector3, radius: float) -> void:
	var material: ShaderMaterial = ShaderMaterial.new()
	material.shader = preload("res://shaders/pulse.gdshader")
	var mesh: MeshInstance3D = Art.put(self,Art.sphere(1,36,20),material,at+Vector3(0,.7,0))
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	pulse_effects.append({"mesh":mesh,"time":0.0,"radius":radius,"material":material})

func _update_effects(delta: float) -> void:
	for i: int in range(pulse_effects.size()-1,-1,-1):
		var effect: Dictionary = pulse_effects[i]
		effect["time"] += delta
		var t: float = effect["time"]/.65
		if t>=1:
			effect["mesh"].queue_free()
			pulse_effects.remove_at(i)
		else:
			effect["mesh"].scale = Vector3.ONE*lerpf(.25,effect["radius"],1-pow(1-t,2))
			effect["material"].set_shader_parameter("strength",(1-t)*.5)

func begin_finale() -> void:
	if not state.can_begin_finale():
		return
	state.health = 3
	state.energy = 100
	state.spawn = IslandData.point(Vector2(0,5))
	Profile.save_campaign(state,true)
	state.finale = true
	state.ritual_time = 90.0 if state.difficulty!=0 else 120.0
	state.braziers = [false,false,false]
	shadow_timer = 2
	Sound.play("bell0",-4,.7)
	notify("THE LAST WATCH. Kindle the three braziers around the lighthouse, then return to the lens. Each flame restores light.",7)

func finish_journey() -> void:
	if not state.finale or not (state.braziers[0] and state.braziers[1] and state.braziers[2]):
		return
	state.finale = false
	state.completed = true
	state.score += 3000+int(state.ritual_time)*10+maxi(0,1000-state.deaths*100)
	state.health = 3
	state.energy = 100
	ending = true
	player.active = false
	for enemy: Shadow in shadows:
		enemy.active = false
		enemy.hide()
	Profile.save_campaign(state,true)
	Sound.play("victory",-1)
	_add_pulse(IslandData.point(Vector2.ZERO),80)
	notify("The stars remember the sky.",6)
	campaign_finished.emit()
	if not Profile.options["reduce_motion"]:
		title_camera.position = Vector3(18,8,22)
		title_camera.look_at(Vector3(0,6,0))
		title_camera.make_current()
	await get_tree().create_timer(7.5).timeout
	if state.completed and playing:
		ending = false
		pause_play()
		hud.show_ending(state)

func player_hit() -> void:
	if state.health<=0:
		_die("The shadows found you before you reached the light.")
	else:
		notify("A shadow struck. Find shelter, or dodge its next warning.",3)

func _die(reason: String) -> void:
	if dying:
		return
	dying = true
	player.active = false
	pause_play()
	hud.show_death(reason)

func retry() -> void:
	var deaths: int = state.deaths+1
	var checkpoint: Dictionary = Profile.checkpoint_data.duplicate(true)
	if checkpoint.is_empty():
		checkpoint = RunState.new().as_dict()
	Profile.campaign = checkpoint
	start_journey(1,true)
	state.deaths = deaths
	state.health = 3
	state.energy = 100
	state.finale = false
	state.ritual_time = 90
	Profile.save_campaign(state)
	notify("You wake where the light last held. The journey is not over.",4)

func pause_play() -> void:
	get_tree().paused = true
	player.active = false
	player.touch_move = Vector2.ZERO
	player.touch_focus = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func resume_play() -> void:
	get_tree().paused = false
	player.active = true
	player.camera.make_current()
	hud.show_game()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Profile.options["touch"] else Input.MOUSE_MODE_CAPTURED

func show_title(save: bool = true) -> void:
	if save and playing and not dying and not state.finale:
		state.spawn = player.global_position
		Profile.save_campaign(state)
	get_tree().paused = false
	playing = false
	dying = false
	ending = false
	player.active = false
	player.hide()
	for enemy: Shadow in shadows:
		enemy.active = false
		enemy.hide()
	title_camera.make_current()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	hud.show_main(not Profile.campaign.is_empty(),bool(Profile.campaign.get("completed",false)))
	back_target = "menu"

func notify(text: String, seconds: float = 3.5) -> void:
	if is_instance_valid(hud):
		hud.notify(text,seconds)

func _on_action(action: String, value: Variant) -> void:
	match action:
		"continue":
			player.show()
			start_journey(1,true)
		"new":
			back_target = "menu"
			if Profile.campaign.is_empty(): hud.show_difficulty()
			else: hud.show_new_confirmation()
		"difficulty": hud.show_difficulty()
		"start":
			player.show()
			start_journey(int(value),false)
		"resume": resume_play()
		"escape":
			if ending: return
			if hud.mode=="game":
				pause_play()
				hud.show_pause()
			elif hud.mode=="pause" or hud.mode=="map": resume_play()
			elif hud.mode not in ["death","ending","menu"]: _go_back()
		"settings","controls","credits":
			back_target = hud.mode
			if playing: pause_play()
			if action=="settings": hud.show_settings()
			elif action=="controls": hud.show_controls()
			else: hud.show_credits()
		"map":
			pause_play()
			hud.show_map(state,player)
		"read":
			page_from_map = true
			hud.show_page(int(value))
		"page_back":
			if page_from_map: hud.show_map(state,player)
			else: resume_play()
		"reset_keys":
			Profile.rebindings.clear()
			Profile.configure_inputs()
			Profile.save_options()
			hud.show_controls()
		"back": _go_back()
		"retry": retry()
		"title": show_title(true)
		"title_no_save": show_title(false)
		"explore":
			ending = false
			resume_play()
		"touch_dodge": player.request_dodge()
		"touch_pulse": player.request_pulse()
		"interact": interact()
		"quit":
			if playing and not dying and not state.finale:
				state.spawn = player.global_position
				Profile.save_campaign(state)
			await Sound.shutdown()
			get_tree().quit()

func _go_back() -> void:
	if hud.mode=="page":
		_on_action("page_back",null)
	elif back_target=="ending":
		hud.show_ending(state)
	elif playing:
		hud.show_pause()
	else:
		show_title(false)

func _notification(what: int) -> void:
	if not loaded:
		return
	if what==NOTIFICATION_APPLICATION_FOCUS_OUT and playing and not get_tree().paused and Profile.options["pause_focus"] and not Profile.test_mode:
		pause_play()
		hud.show_pause()
	if what==NOTIFICATION_WM_CLOSE_REQUEST:
		_on_action("quit",null)

func _export_smoke() -> void:
	# Opt-in verification of the embedded release main scene; never reads/writes player saves.
	start_journey(0)
	for i: int in range(5):
		await get_tree().physics_frame
	var origin: Vector3 = player.global_position
	Input.action_press("move_right")
	for i: int in range(55):
		await get_tree().physics_frame
	Input.action_release("move_right")
	var moved: float = player.global_position.distance_to(origin)
	var ready_state: bool = loaded and world.stars.size()==40 and world.interactables.size()==24 and moved>2.5
	var smoke: Dictionary = {"passed":ready_state,"platform":OS.get_name(),"engine":Engine.get_version_info().string,"distance_m":snappedf(moved,.01),"embedded_main":true}
	print("LAST_LIGHT_RELEASE_SMOKE ",JSON.stringify(smoke))
	await Sound.shutdown()
	get_tree().quit(0 if ready_state else 1)
