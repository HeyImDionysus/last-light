class_name Shadow
extends CharacterBody3D
## Navigation-backed pursuit with a readable wind-up, committed strike and recovery.
enum Mode { WANDER, STALK, WINDUP, STRIKE, RECOVER, REPELLED, GONE }
var game: Node3D
var target: Keeper
var state: RunState
var rig: ShadowRig
var agent: NavigationAgent3D
var telegraph: MeshInstance3D
var home: Vector3
var mode: Mode = Mode.WANDER
var timer: float = 0.0
var path_timer: float = 0.0
var strike_direction: Vector3 = Vector3.FORWARD
var guardian: bool = false
var active: bool = false
var stagger: float = 0.0
var wake_delay: float = 4.0
var banished: float = 0.0
var serial: int = 0

func _ready() -> void:
	collision_layer = 4
	collision_mask = 1
	floor_snap_length = .7
	var shape: CollisionShape3D = CollisionShape3D.new()
	var capsule: CapsuleShape3D = CapsuleShape3D.new()
	capsule.height = 3.3 if guardian else 2.0
	capsule.radius = .58 if guardian else .3
	shape.shape = capsule
	shape.position.y = capsule.height*.5
	add_child(shape)
	rig = ShadowRig.new()
	rig.guardian = guardian
	add_child(rig)
	agent = NavigationAgent3D.new()
	agent.path_desired_distance = .55
	agent.target_desired_distance = 1.1
	agent.radius = capsule.radius
	agent.height = capsule.height
	agent.path_max_distance = 4
	agent.path_search_max_polygons = 32768
	add_child(agent)
	telegraph = Art.put(self,Art.torus(1.0 if not guardian else 1.7,.045,48),Art.material(Color(.73,.27,.16),0,.5,Color(1,.27,.10)*1.8),Vector3(0,.07,0))
	telegraph.visible = false
	home = position

func _physics_process(delta: float) -> void:
	if not active or target == null or state == null or mode == Mode.GONE:
		return
	if guardian and state.wards[2]:
		mode = Mode.GONE
		hide()
		return
	wake_delay = maxf(0,wake_delay-delta)
	var distance: float = global_position.distance_to(target.global_position)
	if distance>65 and not guardian:
		visible = false
		return
	visible = true
	timer -= delta
	path_timer -= delta
	stagger = move_toward(stagger,0,delta)
	if not is_on_floor():
		velocity.y -= delta*22
	else:
		velocity.y = -.5
	var attack: float = 0.0
	var move: Vector3 = Vector3.ZERO
	var illuminated: bool = target.focused and target.facing(global_position) and distance<13 and _line_of_sight()
	var protected: bool = game.is_safe(target.global_position)
	if mode not in [Mode.REPELLED,Mode.STRIKE] and not guardian and ((state.energy>0 and distance<3.6) or illuminated or protected and distance<10):
		mode = Mode.REPELLED
		timer = .38
		strike_direction = (global_position-target.global_position).normalized()
		strike_direction.y = 0
		telegraph.hide()
	match mode:
		Mode.WANDER,Mode.STALK:
			var aware: bool = wake_delay<=0 and distance<(22 if guardian else 25) and not protected
			if guardian and target.global_position.distance_to(home)>17:
				aware = false
			var goal: Vector3 = target.global_position if aware else home+Vector3(sin(state.elapsed*.17+serial)*2,0,cos(state.elapsed*.17+serial)*2)
			if path_timer<=0:
				agent.target_position = goal
				path_timer = .3+float(serial%3)*.05
			mode = Mode.STALK if aware else Mode.WANDER
			if not agent.is_navigation_finished():
				move = agent.get_next_path_position()-global_position
				move.y = 0
				move = move.normalized()*(2.9 if guardian else 2.45)*(1.15 if state.difficulty==2 else 1.0)
				if not aware:
					move *= .35
			if aware and distance<(5.0 if guardian else 2.4) and _line_of_sight():
				mode = Mode.WINDUP
				timer = 1.12 if guardian else .85
				if state.difficulty==0:
					timer *= 1.2
				strike_direction = (target.global_position-global_position).normalized()
				strike_direction.y = 0
				telegraph.show()
				Sound.at("warning",global_position,-12, .65 if guardian else 1.0)
		Mode.WINDUP:
			attack = 1.0
			telegraph.scale = Vector3.ONE*(.7+.35*sin(state.elapsed*14))
			if timer<=0:
				mode = Mode.STRIKE
				timer = .55 if guardian else .32
		Mode.STRIKE:
			attack = .7
			move = strike_direction*(10.0 if guardian else 7.0)
			if distance<(1.7 if guardian else 1.0) and not protected:
				if guardian or state.energy<=0:
					if target.receive_hit(global_position):
						game.player_hit()
			if timer<=0:
				mode = Mode.RECOVER
				timer = 2.2 if guardian else 1.5
				telegraph.hide()
		Mode.RECOVER:
			attack = .3
			if timer<=0:
				mode = Mode.STALK
		Mode.REPELLED:
			move = strike_direction*5.5
			stagger = .8
			if timer<=0:
				mode = Mode.RECOVER
				timer = .8
	velocity.x = move_toward(velocity.x,move.x,delta*22)
	velocity.z = move_toward(velocity.z,move.z,delta*22)
	move_and_slide()
	if mode==Mode.WINDUP or move.length_squared()>.08:
		var look_direction: Vector3 = strike_direction if mode==Mode.WINDUP else move
		rig.rotation.y = lerp_angle(rig.rotation.y,atan2(-look_direction.x,-look_direction.z),1-exp(-delta*9))
	rig.animate(delta,Vector2(velocity.x,velocity.z).length(),attack,stagger)
	# Never let a navigation recovery force a creature through the sanctuary.
	if not guardian and game.is_safe(global_position):
		var away: Vector3 = (global_position-target.global_position).normalized()
		velocity.x = away.x*4
		velocity.z = away.z*4

func _line_of_sight() -> bool:
	var query: PhysicsRayQueryParameters3D = PhysicsRayQueryParameters3D.create(global_position+Vector3(0,1.4,0),target.global_position+Vector3(0,1.2,0),1)
	return get_world_3d().direct_space_state.intersect_ray(query).is_empty()

func receive_pulse(origin: Vector3) -> void:
	if mode==Mode.GONE or not visible:
		return
	if guardian:
		if state.seals[0]>=1 and state.seals[1]>=1 and state.seals[2]>=1:
			state.boss_health -= 1
			game.guardian_hit()
			if state.boss_health<=0:
				mode = Mode.GONE
				hide()
				return
		else:
			game.notify("Its crown is sealed. Focus your lantern on all three standing stones.",3.0)
	mode = Mode.REPELLED
	timer = 1.2 if not guardian else .65
	strike_direction = (global_position-origin).normalized()
	strike_direction.y = 0
	telegraph.hide()
	Sound.at("banish",global_position,-12,.75 if guardian else 1)
