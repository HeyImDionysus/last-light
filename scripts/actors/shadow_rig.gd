class_name ShadowRig
extends Node3D
## A branch-limbed creature built around joint pivots, with secondary tendril motion.
var material: ShaderMaterial
var body: Node3D
var head: Node3D
var limbs: Array[Node3D] = []
var lower_limbs: Array[Node3D] = []
var guardian: bool = false
var phase: float = 0.0

func _ready() -> void:
	Art.initialize()
	material = ShaderMaterial.new()
	material.shader = preload("res://shaders/shadow.gdshader")
	body = Node3D.new()
	body.position.y = 1.15
	add_child(body)
	Art.put(body,Art.lathe([Vector2(.25,-.25),Vector2(.25,0),Vector2(.40,.40),Vector2(.43,.58),Vector2(.22,.72)],20),material,Vector3.ZERO,Vector3(1,1,.62))
	for i: int in range(5):
		var y: float = .12+i*.10
		var rib: MeshInstance3D = Art.put(body,Art.torus(.30+i*.018,.028,20),Art.dark_metal,Vector3(0,y,0),Vector3(1,.75,.70))
		rib.rotation.z = sin(i)*.05
	head = Node3D.new()
	head.position = Vector3(0,.83,-.05)
	body.add_child(head)
	Art.put(head,Art.rock_mesh(92),material,Vector3.ZERO,Vector3(.20,.30,.18))
	for side: float in [-1.0,1.0]:
		Art.put(head,Art.sphere(.027,8,4),Art.gold,Vector3(side*.075,.035,-.17))
		Art.put(head,Art.tube([Vector3(side*.13,.19,0),Vector3(side*.28,.51,.0),Vector3(side*.31,.88,.08),Vector3(side*.58,1.13,.1)],[.07,.057,.039,.006],7),material)
		Art.put(head,Art.tube([Vector3(side*.29,.67,.05),Vector3(side*.56,.86,-.04),Vector3(side*.62,1.07,-.02)],[.047,.029,.005],6),material)
		var arm: Node3D = Node3D.new()
		arm.position = Vector3(side*.43,.54,0)
		body.add_child(arm)
		limbs.append(arm)
		Art.put(arm,Art.tube([Vector3.ZERO,Vector3(side*.08,-.32,0),Vector3(side*.14,-.57,.06)],[.095,.065,.048],8),material)
		var forearm: Node3D = Node3D.new()
		forearm.position = Vector3(side*.14,-.57,.06)
		arm.add_child(forearm)
		lower_limbs.append(forearm)
		Art.put(forearm,Art.tube([Vector3.ZERO,Vector3(side*.05,-.31,-.05),Vector3(.0,-.67,-.14)],[.049,.068,.028],7),material)
		for finger: int in range(3):
			Art.put(forearm,Art.tube([Vector3((finger-1)*.045,-.62,-.14),Vector3((finger-1)*.07,-.87,-.22),Vector3((finger-1)*.08,-.94,-.33)],[.025,.016,.002],5),material)
		var leg: Node3D = Node3D.new()
		leg.position = Vector3(side*.17,-.18,0)
		body.add_child(leg)
		limbs.append(leg)
		Art.put(leg,Art.tube([Vector3.ZERO,Vector3(side*.1,-.39,.08),Vector3(side*.08,-.62,.15)],[.10,.07,.044],7),material)
		var shin: Node3D = Node3D.new()
		shin.position = Vector3(side*.08,-.62,.15)
		leg.add_child(shin)
		lower_limbs.append(shin)
		Art.put(shin,Art.tube([Vector3.ZERO,Vector3(-side*.02,-.26,-.08),Vector3(-side*.02,-.34,-.35)],[.045,.035,.008],6),material)
	if guardian:
		scale = Vector3.ONE*1.75
		for i: int in range(6):
			var a: float = i*TAU/6
			Art.put(body,Art.tube([Vector3(sin(a)*.25,.55,cos(a)*.18),Vector3(sin(a)*.63,.93,cos(a)*.38),Vector3(sin(a)*.77,1.15,cos(a)*.5)],[.075,.052,.005],7),material)

func animate(delta: float, speed: float, attack: float, stagger: float) -> void:
	phase += delta*(2.1+speed*1.6)
	body.position.y = 1.15+sin(phase*2)*.035
	body.rotation = Vector3(-.12-attack*.18,0,sin(phase)*.028+stagger*.14)
	head.rotation = Vector3(sin(phase*.37)*.09-attack*.25,sin(phase*.41)*.10,0)
	for i: int in range(limbs.size()):
		var side: float = 1.0 if i<2 else -1.0
		var amount: float = clampf(speed/3.0,.1,1)
		limbs[i].rotation.x = sin(phase+float(i%2)*PI)*side*.51*amount
		if i%2==0:
			limbs[i].rotation.x -= attack*1.4
			limbs[i].rotation.z = -side*(.11+attack*.28)
			lower_limbs[i].rotation.x = .15+attack*.35
		else:
			lower_limbs[i].rotation.x = -maxf(0,-sin(phase)*side)*.8*amount
	material.set_shader_parameter("agitation",attack+stagger)
