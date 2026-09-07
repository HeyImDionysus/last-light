class_name WorldBuilder
extends Node3D
## Authored island terrain and landmarks, reproducibly dressed with shared meshes.
## The same ground surface drives rendering, collision and navigation.
var environment: Environment
var sky_material: ShaderMaterial
var moon: DirectionalLight3D
var lighthouse: Node3D
var lens: Node3D
var navigation: NavigationRegion3D
var interactables: Array[Node3D] = []
var stars: Array[Node3D] = []
var ward_nodes: Array[Node3D] = []
var bell_nodes: Array[Node3D] = []
var mirror_nodes: Array[Node3D] = []
var seal_nodes: Array[Node3D] = []
var brazier_nodes: Array[Node3D] = []
var page_nodes: Array[Node3D] = []
var blockers: Array[Vector3] = [] # x/z position in x/y; inflated horizontal radius in z.
var vegetation: Array[MultiMeshInstance3D] = []
var fog_particles: Array[GPUParticles3D] = []
var mirror_beams: Array[MeshInstance3D] = []
var daylight: float = 0.0
var random: RandomNumberGenerator = RandomNumberGenerator.new()

func build() -> void:
	Art.initialize()
	random.seed = IslandData.WORLD_SEED
	_build_environment()
	_build_ground()
	_build_landmarks()
	await get_tree().process_frame
	_build_forest()
	await get_tree().process_frame
	_build_collectibles()
	_build_navigation()
	apply_quality()

func _build_environment() -> void:
	var world_environment: WorldEnvironment = WorldEnvironment.new()
	environment = Environment.new()
	world_environment.environment = environment
	add_child(world_environment)
	sky_material = ShaderMaterial.new()
	sky_material.shader = preload("res://shaders/sky.gdshader")
	var sky: Sky = Sky.new()
	sky.sky_material = sky_material
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(.34,.48,.55)
	environment.ambient_light_energy = .7
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.tonemap_exposure = 1.12
	environment.fog_enabled = true
	environment.fog_light_color = Color(.12,.23,.26)
	environment.fog_light_energy = .7
	environment.fog_density = .008
	environment.fog_sky_affect = .4
	environment.fog_height = 0.0
	environment.fog_height_density = .09
	environment.glow_enabled = true
	environment.glow_intensity = .58
	environment.glow_bloom = .07
	environment.glow_hdr_threshold = 1.5
	moon = DirectionalLight3D.new()
	moon.name = "Moonlight"
	moon.light_color = Color(.58,.76,.87)
	moon.light_energy = .85
	moon.rotation_degrees = Vector3(-41,-28,0)
	moon.shadow_enabled = true
	moon.directional_shadow_max_distance = 90.0
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	moon.shadow_normal_bias = 1.4
	add_child(moon)

func _build_ground() -> void:
	var vertices: PackedVector3Array = PackedVector3Array()
	var normals: PackedVector3Array = PackedVector3Array()
	var colors: PackedColorArray = PackedColorArray()
	var uv: PackedVector2Array = PackedVector2Array()
	var indices: PackedInt32Array = PackedInt32Array()
	const CELLS: int = 112
	const STEP: float = 1.5
	for z: int in range(CELLS+1):
		for x: int in range(CELLS+1):
			var p: Vector2 = Vector2(x*STEP-84.0,z*STEP-84.0)
			vertices.append(IslandData.point(p))
			var dx: float = IslandData.height_at(p+Vector2(.25,0))-IslandData.height_at(p-Vector2(.25,0))
			var dz: float = IslandData.height_at(p+Vector2(0,.25))-IslandData.height_at(p-Vector2(0,.25))
			normals.append(Vector3(-dx,.5,-dz).normalized())
			var path: float = 1.0-smoothstep(1.5,3.4,IslandData.path_distance(p))
			path = maxf(path,1.0-smoothstep(5.0,9.0,p.length()))
			for ward: Vector2 in IslandData.WARD_CENTERS:
				path = maxf(path,(1.0-smoothstep(6.0,10.0,p.distance_to(ward)))*.8)
			var ash: float = 1.0-smoothstep(15.0,29.0,p.distance_to(IslandData.WARD_CENTERS[2]))
			colors.append(Color(path,ash,0,1))
			uv.append(p*.1)
	for z: int in range(CELLS):
		for x: int in range(CELLS):
			var a: int = z*(CELLS+1)+x
			var b: int = a+CELLS+1
			indices.append_array(PackedInt32Array([a,a+1,b,a+1,b+1,b]))
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_TEX_UV] = uv
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh: ArrayMesh = ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = preload("res://shaders/ground.gdshader")
	Art.put(self,mesh,mat).name = "IslandTerrain"
	var body: StaticBody3D = StaticBody3D.new()
	body.name = "TerrainCollision"
	var shape: CollisionShape3D = CollisionShape3D.new()
	var concave: ConcavePolygonShape3D = mesh.create_trimesh_shape()
	concave.backface_collision = true
	shape.shape = concave
	body.add_child(shape)
	add_child(body)
	var water: ShaderMaterial = ShaderMaterial.new()
	water.shader = preload("res://shaders/water.gdshader")
	water.set_shader_parameter("ocean",true)
	var plane: PlaneMesh = PlaneMesh.new()
	plane.size = Vector2(650,650)
	plane.subdivide_width = 100
	plane.subdivide_depth = 100
	Art.put(self,plane,water,Vector3(0,-1.6,0)).name = "Sea"
	# Low cliffs close the horizon. These sit beyond the traversable shoreline.
	for i: int in range(54):
		var a: float = float(i)*TAU/54.0
		var p: Vector2 = Vector2(cos(a),sin(a))*random.randf_range(80,87)
		var extent: Vector3 = Vector3(random.randf_range(3.5,7),random.randf_range(3.5,9),random.randf_range(3.2,6))
		Art.put(self,Art.rock_mesh(i%5),Art.stone,Vector3(p.x,-3.5,p.y),extent)
	# Physical perimeter is continuous and cannot be crossed by a dash.
	for i: int in range(96):
		var a: float = i*TAU/96.0
		var wall: StaticBody3D = StaticBody3D.new()
		wall.position = Vector3(cos(a)*78.3,2.5,sin(a)*78.3)
		wall.rotation.y = -a
		var boundary_shape: CollisionShape3D = CollisionShape3D.new()
		var box: BoxShape3D = BoxShape3D.new()
		box.size = Vector3(2,16,5.6)
		boundary_shape.shape = box
		wall.add_child(boundary_shape)
		add_child(wall)

func collision_cylinder(at: Vector3, radius: float, height: float, nav: bool = true) -> void:
	var body: StaticBody3D = StaticBody3D.new()
	body.position = at+Vector3(0,height*.5,0)
	var shape: CollisionShape3D = CollisionShape3D.new()
	var cylinder: CylinderShape3D = CylinderShape3D.new()
	cylinder.radius = radius
	cylinder.height = height
	shape.shape = cylinder
	body.add_child(shape)
	add_child(body)
	if nav:
		blockers.append(Vector3(at.x,at.z,radius+.65))

func _site(kind: String, index: int, p: Vector2) -> Node3D:
	var root: Node3D = Node3D.new()
	root.name = kind.capitalize()+str(index)
	root.position = IslandData.point(p)
	root.set_meta("kind",kind)
	root.set_meta("index",index)
	add_child(root)
	interactables.append(root)
	return root

func _build_landmarks() -> void:
	lighthouse = Art.lighthouse(self)
	lens = lighthouse.get_node("Lens")
	collision_cylinder(lighthouse.position,2.0,11)
	var hub: Node3D = _site("lighthouse",0,Vector2(0,4.0))
	Art.put(hub,Art.cylinder(.8,.8,.16,32),Art.stone,Vector3(0,.06,0))
	Art.put(hub,Art.torus(.57,.028),Art.gold,Vector3(0,.16,0))
	Art.light(self,IslandData.point(Vector2(0,2),3.0),Color(1,.66,.31),3.0,12,true)
	for i: int in range(30):
		var a: float = i*TAU/30.0
		var p: Vector2 = Vector2(sin(a),cos(a))*8.8
		var piece: MeshInstance3D = Art.put(self,Art.box(Vector3(1.3,.12,.36)),Art.stone,IslandData.point(p,.03))
		piece.rotation.y = a
		if i%5 == 0:
			Art.put(self,Art.sphere(.08,10,6),Art.gold,IslandData.point(p,.15))
	for i: int in range(3):
		var ward: Node3D = _site("ward",i,IslandData.WARD_CENTERS[i])
		Art.ward(ward).name = "Visual"
		ward_nodes.append(ward)
		var pool: Node3D = Node3D.new()
		ward.add_child(pool)
		Art.put(pool,Art.torus(4.2,.10,80),Art.stone,Vector3(0,.05,0))
		for j: int in range(12):
			var a: float = j*TAU/12.0
			Art.put(pool,Art.box(Vector3(.13,.05,.42)),Art.bronze,Vector3(sin(a)*4.2,.13,cos(a)*4.2)).rotation.y = a
		collision_cylinder(ward.position,.48,1.5)
		var lamp: OmniLight3D = Art.light(ward,Vector3(0,2,0),Color(.22,.64,.7),.6,7)
		lamp.name = "WardLight"
	for i: int in range(3):
		var bell: Node3D = _site("bell",i,IslandData.BELL_POSITIONS[i])
		Art.bell(bell,i).name = "Visual"
		bell_nodes.append(bell)
		for side: float in [-1.0,1.0]:
			collision_cylinder(bell.position+Vector3(side*.95,0,0),.16,3.1)
		var mirror: Node3D = _site("mirror",i,IslandData.MIRROR_POSITIONS[i])
		Art.mirror(mirror,i).name = "Visual"
		mirror_nodes.append(mirror)
		var beam: MeshInstance3D = Art.line(self,mirror.position+Vector3(0,1.4,0),IslandData.point(IslandData.WARD_CENTERS[1],1.95),.012,Art.cyan)
		beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		beam.hide()
		mirror_beams.append(beam)
		collision_cylinder(mirror.position,.42,2.1)
		var seal: Node3D = _site("seal",i,IslandData.SEAL_POSITIONS[i])
		Art.seal(seal).name = "Visual"
		seal_nodes.append(seal)
		collision_cylinder(seal.position,.40,2.5)
		var brazier: Node3D = _site("brazier",i,IslandData.BRAZIER_POSITIONS[i])
		Art.put(brazier,Art.lathe([Vector2(.4,0),Vector2(.24,.15),Vector2(.15,.8),Vector2(.43,1.03),Vector2(.36,1.12)]),Art.bronze)
		var flame: MeshInstance3D = Art.put(brazier,Art.sphere(.18),Art.gold,Vector3(0,1.2,0),Vector3(1,1.6,1))
		flame.name = "Flame"
		flame.hide()
		Art.light(brazier,Vector3(0,1.35,0),Color(1,.58,.2),0,5.5).name = "FireLight"
		var fire: GPUParticles3D = Art.particles(brazier,Vector3(0,1.2,0),Color(1,.65,.23),18,.16)
		fire.name = "Fire"
		fire.emitting = false
		fire.lifetime = .85
		fire.process_material.initial_velocity_min = .5
		fire.process_material.initial_velocity_max = 1.2
		brazier_nodes.append(brazier)
		collision_cylinder(brazier.position,.3,1.1)
	# Bellwood: a ring of wooden memorials under old living trees.
	for i: int in range(9):
		var a: float = PI*.15+i*PI*.12
		var p: Vector2 = IslandData.WARD_CENTERS[0]+Vector2(cos(a),sin(a))*10.5
		var marker: Node3D = Node3D.new()
		marker.position = IslandData.point(p)
		add_child(marker)
		Art.put(marker,Art.box(Vector3(.40,1.7,.19)),Art.wood,Vector3(0,.82,0)).rotation.z = random.randf_range(-.12,.12)
		Art.put(marker,Art.torus(.19,.032,24),Art.bronze,Vector3(0,1.18,-.12)).rotation.x = PI/2
	# Cloister: a broken arcade, reflective courtyard pools and hanging chains.
	for i: int in range(6):
		var p: Vector2 = Vector2(28+i*4.5,-44)
		_arch(IslandData.point(p),0,i==0 or i==5)
	for i: int in range(3):
		var p: Vector2 = Vector2(28,-37+i*5)
		_arch(IslandData.point(p),PI/2,i==2)
	var pool_material: ShaderMaterial = ShaderMaterial.new()
	pool_material.shader = preload("res://shaders/water.gdshader")
	pool_material.set_shader_parameter("ocean",false)
	for p: Vector2 in [Vector2(35,-27),Vector2(45,-27)]:
		var plane: PlaneMesh = PlaneMesh.new()
		plane.size = Vector2(6,3)
		plane.subdivide_width = 8
		plane.subdivide_depth = 4
		Art.put(self,plane,pool_material,IslandData.point(p,.025))
		for side: float in [-1.0,1.0]:
			Art.put(self,Art.box(Vector3(6.3,.17,.2)),Art.stone,IslandData.point(p+Vector2(0,side*1.6),.08))
	# Crown: basalt ribs and a fallen ceremonial gate frame an open boss arena.
	for i: int in range(14):
		var a: float = i*TAU/14.0
		if absf(sin(a))<.22:
			continue
		var p: Vector2 = IslandData.WARD_CENTERS[2]+Vector2(cos(a),sin(a))*11.3
		var h: float = random.randf_range(3,6)
		var stone: MeshInstance3D = Art.put(self,Art.rock_mesh(i%4),Art.stone,IslandData.point(p,h*.3),Vector3(.7,h,.65))
		stone.rotation.z = -.15*cos(a)
		collision_cylinder(IslandData.point(p),.7,h)
	_arch(IslandData.point(Vector2(7,40)),0,true)
	for p: Vector2 in [Vector2(-24,-14),Vector2(24,-15),Vector2(4,27)]:
		var post: Node3D = Node3D.new()
		post.position = IslandData.point(p+Vector2(2.5,0))
		add_child(post)
		Art.put(post,Art.cylinder(.065,.05,1.7),Art.wood,Vector3(0,.85,0))
		Art.put(post,Art.box(Vector3(.85,.18,.09)),Art.wood,Vector3(0,1.35,0)).rotation.z = -.08
		Art.put(post,Art.sphere(.09),Art.gold,Vector3(0,1.8,0))
		Art.light(post,Vector3(0,1.8,0),Color(.9,.65,.32),.8,4)

func _multi(mesh: Mesh, transforms: Array[Transform3D], label: String, material: Material = null) -> MultiMeshInstance3D:
	var node: MultiMeshInstance3D = MultiMeshInstance3D.new()
	node.name = label
	var multi: MultiMesh = MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.mesh = mesh
	multi.instance_count = transforms.size()
	for i: int in range(transforms.size()):
		multi.set_instance_transform(i,transforms[i])
	node.multimesh = multi
	node.material_override = material
	add_child(node)
	return node

func _build_forest() -> void:
	var tree_transforms: Array = [[],[],[],[],[],[]]
	var trunks: Array[Vector2] = []
	for attempt: int in range(2000):
		if trunks.size()>=260:
			break
		var p: Vector2 = Vector2(random.randf_range(-74,74),random.randf_range(-74,74))
		if p.length()>73 or IslandData.reserved(p,1.0) or p.distance_to(Vector2(7,16))<12:
			continue
		var close: bool = false
		for old: Vector2 in trunks:
			if old.distance_squared_to(p)<16:
				close = true
				break
		if close:
			continue
		trunks.append(p)
		var dead: bool = p.distance_to(IslandData.WARD_CENTERS[2])<24
		var group: int = random.randi_range(3,5) if dead else random.randi_range(0,2)
		var size_value: float = random.randf_range(.72,1.24)
		var basis: Basis = Basis(Vector3.UP,random.randf()*TAU).scaled(Vector3.ONE*size_value)
		tree_transforms[group].append(Transform3D(basis,IslandData.point(p)))
		collision_cylinder(IslandData.point(p),.50*size_value,5.0*size_value)
	for i: int in range(6):
		var values: Array[Transform3D] = []
		values.assign(tree_transforms[i])
		_multi(Art.tree_mesh(621+i,i>=3),values,"Trees"+str(i))
	var grass: Array[Transform3D] = []
	var ferns: Array[Transform3D] = []
	var stones: Array[Transform3D] = []
	for i: int in range(10500):
		var p: Vector2 = Vector2(random.randf_range(-73,73),random.randf_range(-73,73))
		if p.length()>73 or p.length()<9:
			continue
		var on_path: bool = IslandData.path_distance(p)<2.1
		if on_path and i%12!=0:
			continue
		var size_value: float = random.randf_range(.6,1.35)
		var transform: Transform3D = Transform3D(Basis(Vector3.UP,random.randf()*TAU).scaled(Vector3.ONE*size_value),IslandData.point(p,.01))
		if i%17==0:
			transform.basis = transform.basis.scaled(Vector3.ONE*.27)
			stones.append(transform)
		elif i%8==0 and not on_path:
			ferns.append(transform)
		else:
			grass.append(transform)
	vegetation.append(_multi(Art.grass_mesh(),grass,"Grass"))
	vegetation.append(_multi(Art.fern_mesh(),ferns,"Ferns"))
	_multi(Art.rock_mesh(51),stones,"GroundPebbles",Art.stone)
	for p: Vector2 in [Vector2(-18,-8),Vector2(19,-11),Vector2(4,21),Vector2(-43,-22),Vector2(39,-29),Vector2(2,51)]:
		var particles: GPUParticles3D = Art.particles(self,IslandData.point(p,1.4),Color(.62,.8,.66),32,6)
		fog_particles.append(particles)

func _build_navigation() -> void:
	navigation = NavigationRegion3D.new()
	navigation.name = "IslandNavigation"
	var nav: NavigationMesh = NavigationMesh.new()
	nav.agent_radius = .5
	nav.agent_height = 2.4
	nav.cell_size = .25
	const CELLS: int = 150
	var vertices: PackedVector3Array = PackedVector3Array()
	for z: int in range(CELLS+1):
		for x: int in range(CELLS+1):
			vertices.append(IslandData.point(Vector2(x-75,z-75),.025))
	nav.vertices = vertices
	for z: int in range(CELLS):
		for x: int in range(CELLS):
			var center: Vector2 = Vector2(x-74.5,z-74.5)
			if center.length()>74.0:
				continue
			var blocked: bool = false
			for obstacle: Vector3 in blockers:
				if center.distance_squared_to(Vector2(obstacle.x,obstacle.y))<pow(obstacle.z+.7,2):
					blocked = true
					break
			if blocked:
				continue
			var a: int = z*(CELLS+1)+x
			var b: int = a+CELLS+1
			nav.add_polygon(PackedInt32Array([a,b,b+1,a+1]))
	navigation.navigation_mesh = nav
	add_child(navigation)

func _build_collectibles() -> void:
	for i: int in range(IslandData.STAR_POSITIONS.size()):
		var root: Node3D = Node3D.new()
		root.name = "Star"+str(i)
		root.position = IslandData.point(IslandData.STAR_POSITIONS[i],.9)
		root.set_meta("index",i)
		add_child(root)
		var shard: PrismMesh = PrismMesh.new()
		shard.size = Vector3(.19,.48,.19)
		Art.put(root,shard,Art.gold).name = "Shard"
		var halo: MeshInstance3D = Art.put(root,Art.torus(.24,.009,24),Art.gold)
		halo.rotation.x = PI/3
		Art.light(root,Vector3.ZERO,Color(1,.68,.32),.65,2.8)
		stars.append(root)
	for i: int in range(IslandData.PAGE_POSITIONS.size()):
		var root: Node3D = _site("page",i,IslandData.PAGE_POSITIONS[i])
		Art.book(root)
		Art.light(root,Vector3(0,1.3,0),Color(.4,.78,.83),.6,3.5)
		page_nodes.append(root)
		collision_cylinder(root.position,.33,1.1)

func apply_quality() -> void:
	var quality: int = int(Profile.options["quality"])
	var forward: bool = RenderingServer.get_current_rendering_method()=="forward_plus"
	environment.volumetric_fog_enabled = forward and quality>=1
	environment.volumetric_fog_density = .018
	environment.volumetric_fog_albedo = Color(.48,.62,.64)
	environment.volumetric_fog_emission = Color(.03,.065,.072)
	environment.volumetric_fog_length = 74
	environment.ssao_enabled = forward and quality>=1
	environment.ssao_intensity = 1.2
	environment.ssao_radius = 1.0
	environment.ssil_enabled = forward and quality==2
	environment.sdfgi_enabled = forward and quality==2
	environment.sdfgi_min_cell_size = .4
	environment.sdfgi_cascades = 4
	moon.shadow_enabled = quality>=1
	get_viewport().scaling_3d_scale = float(Profile.options["render_scale"])
	get_viewport().msaa_3d = Viewport.MSAA_DISABLED if quality==0 else Viewport.MSAA_2X
	for node: MultiMeshInstance3D in vegetation:
		node.multimesh.visible_instance_count = int(node.multimesh.instance_count*[.4,.8,1.0][quality])
	for particles: GPUParticles3D in fog_particles:
		particles.emitting = quality>0
	environment.tonemap_exposure = float(Profile.options["brightness"])*1.12

func update_visuals(state: RunState, delta: float) -> void:
	if lens:
		lens.rotation.y += delta*(.22 if not state.completed else .7)
	for i: int in range(stars.size()):
		stars[i].visible = not (i in state.banked or i in state.carried)
		if stars[i].visible:
			stars[i].position.y = IslandData.height_at(IslandData.STAR_POSITIONS[i])+.91+sin(state.elapsed*2.2+i)*.13
			stars[i].rotation.y += delta*.63
	for i: int in range(3):
		var ward: Node3D = ward_nodes[i]
		var core: Node3D = ward.get_node("Visual/Core")
		core.rotation.y += delta*.32
		core.scale = Vector3.ONE*(1.0 if state.wards[i] else .6)
		core.material_override = Art.gold if state.wards[i] else Art.cyan
		ward.get_node("WardLight").light_color = Color(1,.74,.40) if state.wards[i] else Color(.22,.64,.7)
		mirror_beams[i].visible = state.mirrors[i]==IslandData.MIRROR_TARGETS[i]
		ward.get_node("WardLight").light_energy = 2.1 if state.wards[i] else .4
		var face: Node3D = mirror_nodes[i].get_node("Visual/MirrorFace")
		face.rotation.y = lerp_angle(face.rotation.y,state.mirrors[i]*PI/2,1.0-exp(-delta*9.0))
		for segment: int in range(12):
			var piece: MeshInstance3D = seal_nodes[i].get_node("Visual/Segment"+str(segment))
			piece.material_override = Art.gold if state.seals[i]>float(segment)/12.0 else Art.dark_metal
		brazier_nodes[i].get_node("Flame").visible = state.braziers[i]
		brazier_nodes[i].get_node("Fire").emitting = state.braziers[i]
		brazier_nodes[i].get_node("FireLight").light_energy = (2.0+sin(state.elapsed*12+i)*.15) if state.braziers[i] else 0.0
	if state.completed:
		daylight = minf(1.0,daylight+delta*.09)
		sky_material.set_shader_parameter("dawn",daylight)
		moon.light_color = Color(.58,.76,.87).lerp(Color(1,.78,.49),daylight)
		moon.light_energy = lerpf(.85,1.8,daylight)
		environment.fog_density = lerpf(.008,.003,daylight)
		environment.volumetric_fog_density = lerpf(.018,.007,daylight)

func route(from: Vector3, to: Vector3) -> PackedVector3Array:
	var query: NavigationPathQueryParameters3D = NavigationPathQueryParameters3D.new()
	query.map = navigation.get_navigation_map()
	query.start_position = from
	query.target_position = to
	query.path_search_max_polygons = 32768
	var result: NavigationPathQueryResult3D = NavigationPathQueryResult3D.new()
	NavigationServer3D.query_path(query,result)
	return result.path

func _arch(at: Vector3, yaw: float, broken: bool) -> void:
	Art.arch(self,at,yaw,broken)
	for side: float in [-1.0,1.0]:
		var p: Vector3 = at+Basis(Vector3.UP,yaw)*Vector3(side*1.6,0,0)
		blockers.append(Vector3(p.x,p.z,1.05))
