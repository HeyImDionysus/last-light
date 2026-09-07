class_name Keeper
extends CharacterBody3D
## Responsive camera-relative movement with collision-safe dashes and blended skeletal poses.
signal pulse_requested
signal interacted
var game: Node3D
var state: RunState
var rig: KeeperRig
var pivot: Node3D
var spring: SpringArm3D
var camera: Camera3D
var lantern: OmniLight3D
var focus_light: SpotLight3D
var active: bool = false
var yaw: float = 0.0
var pitch: float = -.20
var focused: bool = false
var sprinting: bool = false
var invulnerability: float = 0.0
var dodge_time: float = 0.0
var dodge_cooldown: float = 0.0
var pulse_cooldown: float = 0.0
var dodge_direction: Vector3 = Vector3.FORWARD
var walk_phase: float = 0.0
var step_timer: float = 0.0
var touch_move: Vector2 = Vector2.ZERO
var touch_focus: bool = false
var override_move: Vector2 = Vector2.ZERO
var use_override: bool = false
var external_focus: bool = false
var knockback: Vector3 = Vector3.ZERO
var camera_shake: float = 0.0
var hurt_flash: float = 0.0
var camera_geometry: Array[GeometryInstance3D] = []
var camera_fade: float = 0.0

func _ready() -> void:
	name = "Keeper"
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = .65
	floor_max_angle = deg_to_rad(48)
	max_slides = 6
	var collider: CollisionShape3D = CollisionShape3D.new()
	var capsule: CapsuleShape3D = CapsuleShape3D.new()
	capsule.radius = .31
	capsule.height = 1.75
	collider.shape = capsule
	collider.position.y = .89
	add_child(collider)
	rig = KeeperRig.new()
	rig.name = "KeeperRig"
	add_child(rig)
	for child: Node in rig.find_children("*","GeometryInstance3D",true,false):
		camera_geometry.append(child as GeometryInstance3D)
	pivot = Node3D.new()
	pivot.name = "CameraPivot"
	pivot.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	pivot.top_level = true
	pivot.position = Vector3(0,1.48,0)
	add_child(pivot)
	spring = SpringArm3D.new()
	spring.name = "CameraBoom"
	spring.spring_length = 5.4
	spring.margin = .2
	spring.collision_mask = 1
	spring.add_excluded_object(get_rid())
	var camera_shape: SphereShape3D = SphereShape3D.new()
	camera_shape.radius = .18
	spring.shape = camera_shape
	pivot.add_child(spring)
	camera = Camera3D.new()
	camera.name = "FollowCamera"
	camera.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF
	camera.fov = 64
	camera.near = .09
	camera.far = 240
	spring.add_child(camera)
	lantern = Art.light(self,Vector3(0,1,0),Color(1.0,.70,.36),2.6,7.5,true)
	lantern.omni_attenuation = 1.35
	lantern.light_volumetric_fog_energy = .8
	focus_light = SpotLight3D.new()
	focus_light.light_color = Color(1,.78,.43)
	focus_light.light_energy = 4.5
	focus_light.spot_range = 16
	focus_light.spot_angle = 27
	focus_light.spot_attenuation = 1.2
	focus_light.shadow_enabled = true
	focus_light.light_volumetric_fog_energy = 1.2
	add_child(focus_light)
	pivot.rotation = Vector3(pitch,yaw,0)

func _unhandled_input(event: InputEvent) -> void:
	if not active:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		look(event.relative)
	if event.is_action_pressed("recenter"):
		yaw = rig.rotation.y
		pitch = -.2
	if event.is_action_pressed("dodge"):
		request_dodge()
	if event.is_action_pressed("pulse"):
		request_pulse()
	if event.is_action_pressed("interact"):
		interacted.emit()

func look(relative: Vector2) -> void:
	yaw -= relative.x*float(Profile.options["sensitivity"])
	var invert: float = -1.0 if Profile.options["invert_y"] else 1.0
	pitch = clampf(pitch-relative.y*float(Profile.options["sensitivity"])*invert,-.9,.45)

func _physics_process(delta: float) -> void:
	if state == null:
		return
	if not active:
		velocity = Vector3.ZERO
		return
	invulnerability = maxf(0,invulnerability-delta)
	dodge_cooldown = maxf(0,dodge_cooldown-delta)
	pulse_cooldown = maxf(0,pulse_cooldown-delta)
	if not Input.get_connected_joypads().is_empty():
		var device: int = Input.get_connected_joypads()[0]
		var look_input: Vector2 = Vector2(Input.get_joy_axis(device,JOY_AXIS_RIGHT_X),Input.get_joy_axis(device,JOY_AXIS_RIGHT_Y))
		if look_input.length()>.18:
			look(look_input*delta*750)
	var input_vector: Vector2 = override_move if use_override else Input.get_vector("move_left","move_right","move_forward","move_back")
	if touch_move.length()>.05:
		input_vector = touch_move.limit_length()
	focused = (Input.is_action_pressed("focus") or touch_focus or external_focus) and state.energy>.0 and dodge_time<=0
	sprinting = Input.is_action_pressed("sprint") and not focused and state.stamina>3 and input_vector.length()>.1
	var direction: Vector3 = Basis(Vector3.UP,yaw)*Vector3(input_vector.x,0,input_vector.y)
	var speed: float = 6.7 if sprinting else 4.25
	if focused:
		speed = 2.75
	if dodge_time>0:
		dodge_time -= delta
		velocity.x = dodge_direction.x*11.8
		velocity.z = dodge_direction.z*11.8
	else:
		velocity.x = move_toward(velocity.x,direction.x*speed,delta*27.0)
		velocity.z = move_toward(velocity.z,direction.z*speed,delta*27.0)
		if sprinting:
			state.stamina = maxf(0,state.stamina-delta*19)
		else:
			state.stamina = minf(100,state.stamina+delta*24)
	if not is_on_floor():
		velocity.y -= 22.0*delta
	else:
		velocity.y = -.5
	velocity.x += knockback.x*delta
	velocity.z += knockback.z*delta
	knockback = knockback.move_toward(Vector3.ZERO,delta*70)
	move_and_slide()
	# The physical shore is the primary bound; this is a numerical escape safety net.
	var planar: Vector2 = Vector2(position.x,position.z)
	if planar.length()>77.5 or position.y<-8:
		var legal: Vector2 = planar.limit_length(76)
		position = IslandData.point(legal,.1)
		velocity = Vector3.ZERO
	var planar_speed: float = Vector2(velocity.x,velocity.z).length()
	if focused:
		rig.rotation.y = lerp_angle(rig.rotation.y,yaw,1-exp(-delta*16))
	elif direction.length_squared()>.03:
		var target_yaw: float = atan2(-direction.x,-direction.z)
		rig.rotation.y = lerp_angle(rig.rotation.y,target_yaw,1-exp(-delta*15))
	rig.motion(planar_speed,focused,delta)
	walk_phase += planar_speed*delta
	step_timer -= delta
	if is_on_floor() and planar_speed>1 and step_timer<=0:
		Sound.at("step",global_position,-17.0,1.0+sin(walk_phase)*.08)
		step_timer = .28 if sprinting else .40

func _process(delta: float) -> void:
	if state == null:
		return
	pivot.global_position = get_global_transform_interpolated().origin+Vector3(0,1.48,0)
	pivot.rotation.y = yaw
	pivot.rotation.x = pitch
	var target_length: float = 3.6 if focused else 5.4
	spring.spring_length = lerpf(spring.spring_length,target_length,1-exp(-delta*7))
	# A wall may force the boom into the keeper. Fade rather than obscure the encounter.
	var fade_target: float = clampf((1.9-spring.get_hit_length())/1.1,0,1)
	camera_fade = move_toward(camera_fade,fade_target,delta*6)
	var forward: bool = RenderingServer.get_current_rendering_method()=="forward_plus"
	for geometry: GeometryInstance3D in camera_geometry:
		geometry.transparency = camera_fade if forward else 0.0
		rig.visible = camera_fade<.96 if forward else fade_target<.7
	camera.fov = lerpf(camera.fov,60.0 if focused else (69.0 if sprinting else 64.0),1-exp(-delta*6))
	hurt_flash = move_toward(hurt_flash,0,delta*2.8)
	camera_shake = move_toward(camera_shake,0,delta*2)
	camera.h_offset = sin(Time.get_ticks_msec()*.031)*camera_shake*.055 if not Profile.options["reduce_motion"] else 0
	camera.v_offset = sin(Time.get_ticks_msec()*.043)*camera_shake*.04 if not Profile.options["reduce_motion"] else 0
	if rig.lantern_socket:
		lantern.global_position = rig.lantern_socket.global_position
		focus_light.global_position = lantern.global_position+Vector3(0,.08,0)
		focus_light.rotation = Vector3(pitch*.35,yaw,0)
		var lit: float = clampf(state.energy/10.0,0,1)
		lantern.light_energy = (2.8+sin(state.elapsed*11.0)*.08)*lit
		focus_light.visible = focused and active
		rig.lantern_socket.get_node("Flame").visible = state.energy>0

func request_dodge() -> bool:
	if not active or dodge_cooldown>0 or state.stamina<24:
		return false
	var input_vector: Vector2 = override_move if use_override else Input.get_vector("move_left","move_right","move_forward","move_back")
	if touch_move.length()>.05:
		input_vector = touch_move
	if input_vector.length()<.1:
		input_vector = Vector2(0,-1)
	dodge_direction = (Basis(Vector3.UP,yaw)*Vector3(input_vector.x,0,input_vector.y)).normalized()
	state.stamina -= 24
	dodge_time = .36
	dodge_cooldown = .78
	invulnerability = maxf(invulnerability,.47)
	rig.action("dodge")
	Sound.at("dodge",global_position,-8)
	return true

func request_pulse() -> bool:
	if not active or pulse_cooldown>0 or state.energy<18 or dodge_time>0:
		return false
	state.energy -= 18
	state.pulses += 1
	pulse_cooldown = 2.3
	rig.action("pulse")
	camera_shake = .8
	Sound.at("pulse",global_position,-4)
	pulse_requested.emit()
	return true

func facing(point: Vector3, half_angle: float = .60) -> bool:
	var direction: Vector3 = point-(global_position+Vector3(0,1.2,0))
	direction.y = 0
	if direction.length_squared()<.1:
		return true
	var forward: Vector3 = Basis(Vector3.UP,yaw)*Vector3.FORWARD
	return forward.dot(direction.normalized())>cos(half_angle)

func receive_hit(from: Vector3) -> bool:
	if invulnerability>0 or not active:
		return false
	invulnerability = 1.75 if state.difficulty!=2 else 1.25
	hurt_flash = 1.0
	state.health -= 1
	state.energy = maxf(0,state.energy-10)
	knockback = (global_position-from).normalized()*42
	camera_shake = 1
	Sound.at("hurt",global_position,-2)
	return true

func teleport(at: Vector3) -> void:
	global_position = at+Vector3(0,.07,0)
	velocity = Vector3.ZERO
	knockback = Vector3.ZERO
	dodge_time = 0
	reset_physics_interpolation()
