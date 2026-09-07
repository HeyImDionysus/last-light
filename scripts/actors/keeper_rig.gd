class_name KeeperRig
extends Node3D
## A jointed, three-dimensional keeper. AnimationTree blends skeletal locomotion,
## lantern focus and authored pulse/dodge reactions; cloth motion is secondary only.
var skeleton: Skeleton3D
var animation_tree: AnimationTree
var animator: AnimationPlayer
var lantern_socket: Node3D
var cloth_material: ShaderMaterial
var bone_ids: Dictionary = {}
var rest_positions: Dictionary = {}

func _ready() -> void:
	Art.initialize()
	skeleton = Skeleton3D.new()
	skeleton.name = "Skeleton3D"
	add_child(skeleton)
	_bone("hips","",Vector3(0,1.0,0))
	_bone("spine","hips",Vector3(0,.18,0))
	_bone("chest","spine",Vector3(0,.21,0))
	_bone("neck","chest",Vector3(0,.16,0))
	_bone("head","neck",Vector3(0,.11,0))
	for suffix: String in ["l","r"]:
		var side: float = 1.0 if suffix == "l" else -1.0
		_bone("thigh_"+suffix,"hips",Vector3(side*.145,-.025,0))
		_bone("shin_"+suffix,"thigh_"+suffix,Vector3(0,-.435,0))
		_bone("foot_"+suffix,"shin_"+suffix,Vector3(0,-.43,0))
		_bone("shoulder_"+suffix,"chest",Vector3(side*.26,.07,0))
		_bone("upper_arm_"+suffix,"shoulder_"+suffix,Vector3(side*.045,0,0))
		_bone("forearm_"+suffix,"upper_arm_"+suffix,Vector3(0,-.31,0))
		_bone("hand_"+suffix,"forearm_"+suffix,Vector3(0,-.28,0))
	skeleton.reset_bone_poses()
	_build_body()
	_build_animations()

func _bone(bone_name: String, parent_name: String, offset: Vector3) -> void:
	var index: int = skeleton.get_bone_count()
	skeleton.add_bone(bone_name)
	bone_ids[bone_name] = index
	rest_positions[bone_name] = offset
	if parent_name != "":
		skeleton.set_bone_parent(index,bone_ids[parent_name])
	skeleton.set_bone_rest(index,Transform3D(Basis.IDENTITY,offset))

func _attachment(bone_name: String) -> BoneAttachment3D:
	var node: BoneAttachment3D = BoneAttachment3D.new()
	node.name = "Attach_"+bone_name
	node.bone_name = bone_name
	skeleton.add_child(node)
	return node

func _build_body() -> void:
	var leather: StandardMaterial3D = Art.material(Color(.19,.12,.08),.03,.86)
	var trousers: StandardMaterial3D = Art.material(Color(.125,.17,.18),0,.95)
	var fabric: StandardMaterial3D = Art.material(Color(.32,.24,.13),0,.95)
	cloth_material = ShaderMaterial.new()
	cloth_material.shader = preload("res://shaders/cloth.gdshader")
	cloth_material.set_shader_parameter("cloth_color",Color(.36,.25,.12))
	var hips: Node3D = _attachment("hips")
	Art.put(hips,Art.lathe([Vector2(.21,-.13),Vector2(.24,.0),Vector2(.24,.15)]),trousers)
	Art.put(hips,Art.lathe([Vector2(.25,.055),Vector2(.25,.13)]),leather)
	Art.put(hips,Art.box(Vector3(.095,.083,.022)),Art.bronze,Vector3(0,.092,-.256))
	var torso: Node3D = _attachment("spine")
	Art.put(torso,Art.lathe([Vector2(.235,-.08),Vector2(.24,.06),Vector2(.29,.23),Vector2(.27,.34)]),fabric,Vector3.ZERO,Vector3(1,1,.70))
	var chest: Node3D = _attachment("chest")
	Art.put(chest,Art.lathe([Vector2(.35,-.56),Vector2(.40,-.48),Vector2(.33,-.10),Vector2(.36,.07),Vector2(.25,.16),Vector2(.14,.19)],32),cloth_material,Vector3.ZERO,Vector3(1,1,.69))
	# Embroidered hem and shoulder clasp are geometry, not painted-on UI.
	Art.put(chest,Art.lathe([Vector2(.35,-.57),Vector2(.37,-.53)],32),Art.bronze,Vector3.ZERO,Vector3(1,1,.69))
	Art.put(chest,Art.sphere(.044,10,6),Art.bronze,Vector3(.14,.1,-.24))
	var strap: MeshInstance3D = Art.put(chest,Art.box(Vector3(.065,.55,.018)),leather,Vector3(-.01,-.16,-.237))
	strap.rotation.z = -.42
	var satchel: MeshInstance3D = Art.put(chest,Art.box(Vector3(.31,.31,.15)),leather,Vector3(-.16,-.39,.27))
	satchel.rotation.z = .1
	Art.put(chest,Art.box(Vector3(.30,.09,.17)),fabric,Vector3(-.16,-.25,.27))
	Art.put(chest,Art.box(Vector3(.055,.06,.018)),Art.bronze,Vector3(-.16,-.3,.36))
	var head: Node3D = _attachment("head")
	Art.put(head,Art.sphere(.225,24,16),Art.material(Color(.14,.20,.20)),Vector3(0,.005,.012),Vector3(.90,1.09,.94))
	Art.put(head,Art.sphere(.181,24,16),Art.dark_metal,Vector3(0,-.008,-.112),Vector3(.89,1.10,.39))
	var rim: MeshInstance3D = Art.put(head,Art.torus(.19,.022,36),leather,Vector3(0,-.004,-.144),Vector3(.88,1,1.14))
	rim.rotation.x = PI/2
	for side: float in [-1.0,1.0]:
		Art.put(head,Art.box(Vector3(.060,.016,.008)),Art.gold,Vector3(side*.078,.022,-.184))
	Art.put(head,Art.cylinder(.037,.018,.115,6),Art.bronze,Vector3(0,-.035,-.18))
	Art.put(head,Art.lathe([Vector2(.145,-.22),Vector2(.172,-.16),Vector2(.148,-.1)],24),Art.material(Color(.34,.115,.09)),Vector3(0,0,.015),Vector3(1,1,.9))
	var scarf: MeshInstance3D = Art.put(chest,Art.box(Vector3(.13,.38,.025)),cloth_material,Vector3(.17,-.13,.28))
	scarf.rotation.z = -.18
	for suffix: String in ["l","r"]:
		var upper_leg: Node3D = _attachment("thigh_"+suffix)
		Art.put(upper_leg,Art.lathe([Vector2(.09,-.44),Vector2(.108,-.32),Vector2(.12,-.05),Vector2(.115,.02)],16),trousers,Vector3.ZERO,Vector3(1,1,.93))
		var shin: Node3D = _attachment("shin_"+suffix)
		Art.put(shin,Art.lathe([Vector2(.09,-.43),Vector2(.085,-.31),Vector2(.099,-.08),Vector2(.095,.02)],16),leather)
		Art.put(shin,Art.sphere(.09,12,8),Art.bronze,Vector3(0,-.02,-.065),Vector3(1,1.25,.35))
		for y: float in [-.13,-.24]:
			Art.put(shin,Art.lathe([Vector2(.100,y-.021),Vector2(.100,y+.021)],16),fabric)
		var foot: Node3D = _attachment("foot_"+suffix)
		Art.put(foot,Art.sphere(.13,16,10),leather,Vector3(0,-.015,-.062),Vector3(.73,.54,1.35))
		Art.put(foot,Art.box(Vector3(.17,.045,.28)),Art.dark_metal,Vector3(0,-.068,-.065))
		var arm: Node3D = _attachment("upper_arm_"+suffix)
		Art.put(arm,Art.lathe([Vector2(.06,-.32),Vector2(.084,-.15),Vector2(.10,.02)],16),fabric)
		Art.put(arm,Art.sphere(.109,16,10),cloth_material,Vector3(0,-.035,0),Vector3(1,1.13,1))
		var forearm: Node3D = _attachment("forearm_"+suffix)
		Art.put(forearm,Art.lathe([Vector2(.058,-.28),Vector2(.071,-.1),Vector2(.06,.02)],16),leather)
		Art.put(forearm,Art.lathe([Vector2(.076,-.2),Vector2(.076,-.17)],16),Art.bronze)
		var hand: Node3D = _attachment("hand_"+suffix)
		Art.put(hand,Art.sphere(.066,16,10),leather,Vector3(0,-.052,0),Vector3(.75,1.22,.68))
		for finger: int in range(4):
			var x: float = (finger-1.5)*.022
			Art.put(hand,Art.tube([Vector3(x,-.07,-.01),Vector3(x,-.115,-.017),Vector3(x,-.121,.012)],[.009,.008,.006],5),leather)
		if suffix == "r":
			_build_lantern(hand)

func _build_lantern(hand: Node3D) -> void:
	lantern_socket = Node3D.new()
	lantern_socket.name = "Lantern"
	lantern_socket.position = Vector3(0,-.30,.01)
	hand.add_child(lantern_socket)
	var handle: MeshInstance3D = Art.put(lantern_socket,Art.torus(.086,.009,24),Art.bronze,Vector3(0,.19,0))
	handle.rotation.x = PI/2
	Art.put(lantern_socket,Art.cylinder(.12,.08,.065,12),Art.bronze,Vector3(0,.09,0))
	Art.put(lantern_socket,Art.cylinder(.12,.12,.035,12),Art.bronze,Vector3(0,-.15,0))
	var glass: StandardMaterial3D = Art.material(Color(.94,.66,.27,.20),.12,.13).duplicate() as StandardMaterial3D
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	Art.put(lantern_socket,Art.cylinder(.095,.095,.2,12),glass,Vector3(0,-.03,0))
	for i: int in range(6):
		var a: float = i*TAU/6.0
		Art.put(lantern_socket,Art.cylinder(.009,.009,.23,6),Art.bronze,Vector3(sin(a)*.095,-.03,cos(a)*.095))
	var flame: MeshInstance3D = Art.put(lantern_socket,Art.sphere(.045,14,8),Art.gold,Vector3(0,-.025,0),Vector3(.7,1.5,.7))
	flame.name = "Flame"

func _rotation_track(animation: Animation, bone_name: String, times: Array[float], values: Array[Vector3]) -> void:
	var track: int = animation.add_track(Animation.TYPE_ROTATION_3D)
	animation.track_set_path(track,NodePath("Skeleton3D:"+bone_name))
	for i: int in range(times.size()):
		animation.rotation_track_insert_key(track,times[i],Quaternion.from_euler(values[i]))

func _position_track(animation: Animation, bone_name: String, times: Array[float], values: Array[Vector3]) -> void:
	var track: int = animation.add_track(Animation.TYPE_POSITION_3D)
	animation.track_set_path(track,NodePath("Skeleton3D:"+bone_name))
	for i: int in range(times.size()):
		animation.position_track_insert_key(track,times[i],values[i])

func _locomotion(speed: int) -> Animation:
	var animation: Animation = Animation.new()
	animation.length = [3.2,1.05,.68][speed]
	animation.loop_mode = Animation.LOOP_LINEAR
	var times: Array[float] = []
	for i: int in range(13):
		times.append(animation.length*float(i)/12.0)
	for bone_name: String in bone_ids:
		var values: Array[Vector3] = []
		for i: int in range(times.size()):
			var phase: float = TAU*float(i)/12.0
			var step: float = sin(phase)
			var amount: float = [.0,.49,.82][speed]
			var pose: Vector3 = Vector3.ZERO
			match bone_name:
				"thigh_l": pose.x = step*amount
				"thigh_r": pose.x = -step*amount
				"shin_l": pose.x = -maxf(0.0,-step)*amount*1.6
				"shin_r": pose.x = -maxf(0.0,step)*amount*1.6
				"foot_l": pose.x = -.13*step*float(speed)
				"foot_r": pose.x = .13*step*float(speed)
				"hips": pose = Vector3(0,step*amount*.13,step*amount*.045)
				"spine": pose = Vector3(-float(speed)*.07,-step*amount*.18,0)
				"chest": pose = Vector3(sin(phase)*.008,0,0)
				"upper_arm_l": pose = Vector3(-step*amount*.7,.0,.12)
				"forearm_l": pose.x = .28+float(speed)*.12
				"upper_arm_r": pose = Vector3(.23+step*amount*.10,0,-.10)
				"forearm_r": pose.x = .63
				"hand_r": pose.x = -.23
				"head": pose.y = sin(phase)*.018
			values.append(pose)
		_rotation_track(animation,bone_name,times,values)
	var hip_values: Array[Vector3] = []
	for t: float in times:
		var bounce: float = (1.0-cos(t/animation.length*TAU*2.0))*.013*float(speed)
		hip_values.append(Vector3(0,1.0+bounce,0))
	_position_track(animation,"hips",times,hip_values)
	return animation

func _build_animations() -> void:
	animator = AnimationPlayer.new()
	animator.name = "AnimationPlayer"
	add_child(animator)
	var library: AnimationLibrary = AnimationLibrary.new()
	library.add_animation("idle",_locomotion(0))
	library.add_animation("walk",_locomotion(1))
	library.add_animation("sprint",_locomotion(2))
	var focus: Animation = _locomotion(0)
	for bone_name: String in ["upper_arm_r","forearm_r","hand_r"]:
		var track: int = focus.find_track(NodePath("Skeleton3D:"+bone_name),Animation.TYPE_ROTATION_3D)
		focus.remove_track(track)
		var value: Vector3 = Vector3(1.13,0,-.14) if bone_name == "upper_arm_r" else Vector3(.38,0,0)
		if bone_name == "hand_r":
			value = Vector3(-.35,0,0)
		_rotation_track(focus,bone_name,[0.0,3.2],[value,value])
	library.add_animation("focus",focus)
	var pulse: Animation = Animation.new()
	pulse.length = .62
	_rotation_track(pulse,"upper_arm_r",[0.0,.16,.27,.62],[Vector3(.3,0,-.12),Vector3(1.6,0,-.18),Vector3(1.35,0,-.15),Vector3(.23,0,-.1)])
	_rotation_track(pulse,"forearm_r",[0.0,.16,.27,.62],[Vector3(.63,0,0),Vector3(1.1,0,0),Vector3(.25,0,0),Vector3(.63,0,0)])
	_rotation_track(pulse,"spine",[0.0,.16,.27,.62],[Vector3.ZERO,Vector3(.12,.13,0),Vector3(-.18,-.12,0),Vector3.ZERO])
	library.add_animation("pulse",pulse)
	var dodge: Animation = Animation.new()
	dodge.length = .56
	_position_track(dodge,"hips",[0.0,.13,.35,.56],[Vector3(0,1,0),Vector3(0,.73,0),Vector3(0,.79,0),Vector3(0,1,0)])
	_rotation_track(dodge,"spine",[0.0,.13,.38,.56],[Vector3.ZERO,Vector3(-.48,0,.13),Vector3(-.33,0,-.1),Vector3.ZERO])
	_rotation_track(dodge,"thigh_l",[0.0,.16,.38,.56],[Vector3.ZERO,Vector3(.8,0,.1),Vector3(-.3,0,.1),Vector3.ZERO])
	_rotation_track(dodge,"shin_l",[0.0,.16,.38,.56],[Vector3.ZERO,Vector3(-1.2,0,0),Vector3(-.8,0,0),Vector3.ZERO])
	_rotation_track(dodge,"thigh_r",[0.0,.16,.38,.56],[Vector3.ZERO,Vector3(-.3,0,-.1),Vector3(.6,0,-.1),Vector3.ZERO])
	_rotation_track(dodge,"shin_r",[0.0,.16,.38,.56],[Vector3.ZERO,Vector3(-.6,0,0),Vector3(-1.0,0,0),Vector3.ZERO])
	library.add_animation("dodge",dodge)
	animator.add_animation_library("",library)
	animation_tree = AnimationTree.new()
	animation_tree.name = "AnimationTree"
	add_child(animation_tree)
	animation_tree.anim_player = NodePath("../AnimationPlayer")
	var blend: AnimationNodeBlendTree = AnimationNodeBlendTree.new()
	var locomotion: AnimationNodeBlendSpace1D = AnimationNodeBlendSpace1D.new()
	locomotion.min_space = 0
	locomotion.max_space = 1
	for i: int in range(3):
		var node: AnimationNodeAnimation = AnimationNodeAnimation.new()
		node.animation = ["idle","walk","sprint"][i]
		locomotion.add_blend_point(node,[0.0,.55,1.0][i],-1,node.animation)
	blend.add_node("locomotion",locomotion)
	var focus_node: AnimationNodeAnimation = AnimationNodeAnimation.new()
	focus_node.animation = "focus"
	blend.add_node("focus_pose",focus_node)
	var focus_blend: AnimationNodeBlend2 = AnimationNodeBlend2.new()
	focus_blend.filter_enabled = true
	for bone_name: String in ["upper_arm_r","forearm_r","hand_r"]:
		focus_blend.set_filter_path(NodePath("Skeleton3D:"+bone_name),true)
	blend.add_node("focus",focus_blend)
	blend.connect_node("focus",0,"locomotion")
	blend.connect_node("focus",1,"focus_pose")
	var previous: String = "focus"
	for action: String in ["pulse","dodge"]:
		var clip: AnimationNodeAnimation = AnimationNodeAnimation.new()
		clip.animation = action
		blend.add_node(action+"_clip",clip)
		var shot: AnimationNodeOneShot = AnimationNodeOneShot.new()
		shot.fadein_time = .045
		shot.fadeout_time = .16
		blend.add_node(action,shot)
		blend.connect_node(action,0,previous)
		blend.connect_node(action,1,action+"_clip")
		previous = action
	blend.connect_node("output",0,previous)
	animation_tree.tree_root = blend
	animation_tree.active = true

func motion(speed: float, focused: bool, delta: float) -> void:
	if animation_tree == null:
		return
	animation_tree.set("parameters/locomotion/blend_position",clampf(speed/6.7,0.0,1.0))
	var current: float = float(animation_tree.get("parameters/focus/blend_amount"))
	animation_tree.set("parameters/focus/blend_amount",move_toward(current,float(focused),delta*6.0))
	cloth_material.set_shader_parameter("motion",speed/6.7)

func action(action_name: String) -> void:
	if animation_tree != null and action_name in ["pulse","dodge"]:
		animation_tree.set("parameters/"+action_name+"/request",AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)
