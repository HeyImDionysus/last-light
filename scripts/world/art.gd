class_name Art
extends RefCounted
## Original, shared 3D mesh library. No downloaded models, billboard characters or proxy sprites.
static var materials: Dictionary = {}
static var mesh_cache: Dictionary = {}
static var stone: StandardMaterial3D
static var bronze: StandardMaterial3D
static var dark_metal: StandardMaterial3D
static var wood: StandardMaterial3D
static var gold: StandardMaterial3D
static var cyan: StandardMaterial3D

static func initialize() -> void:
	if stone != null:
		return
	stone = material(Color(.34,.38,.36),.04,.91)
	bronze = material(Color(.34,.23,.12),.73,.38)
	dark_metal = material(Color(.07,.095,.10),.76,.45)
	wood = material(Color(.18,.13,.10),.0,.96)
	gold = material(Color(.95,.65,.23),.2,.28,Color(1.0,.61,.19)*2.4)
	cyan = material(Color(.28,.61,.63),.1,.4,Color(.17,.61,.69)*1.8)

static func material(color: Color, metallic: float = 0.0, roughness: float = .8, emission: Color = Color.BLACK) -> StandardMaterial3D:
	var key: String = str(color)+str(metallic)+str(roughness)+str(emission)
	if materials.has(key):
		return materials[key]
	var m: StandardMaterial3D = StandardMaterial3D.new()
	m.albedo_color = color
	m.metallic = metallic
	m.roughness = roughness
	m.vertex_color_use_as_albedo = true
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	if emission != Color.BLACK:
		m.emission_enabled = true
		m.emission = emission
	materials[key] = m
	return m

static func put(parent: Node3D, mesh: Mesh, mat: Material = null, at: Vector3 = Vector3.ZERO, scale_value: Vector3 = Vector3.ONE) -> MeshInstance3D:
	var instance: MeshInstance3D = MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = mat
	instance.position = at
	instance.scale = scale_value
	parent.add_child(instance)
	return instance

static func box(size: Vector3) -> BoxMesh:
	var mesh: BoxMesh = BoxMesh.new()
	mesh.size = size
	return mesh

static func sphere(radius: float = 1.0, segments: int = 20, rings: int = 12) -> SphereMesh:
	var mesh: SphereMesh = SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius*2.0
	mesh.radial_segments = segments
	mesh.rings = rings
	return mesh

static func cylinder(bottom: float, top: float, height: float, sides: int = 20) -> CylinderMesh:
	var mesh: CylinderMesh = CylinderMesh.new()
	mesh.bottom_radius = bottom
	mesh.top_radius = top
	mesh.height = height
	mesh.radial_segments = sides
	return mesh

static func torus(radius: float, thickness: float, segments: int = 40) -> TorusMesh:
	var mesh: TorusMesh = TorusMesh.new()
	mesh.inner_radius = maxf(.001,radius-thickness)
	mesh.outer_radius = radius+thickness
	mesh.rings = segments
	mesh.ring_segments = 8
	return mesh

static func lathe(profile: Array[Vector2], sides: int = 24) -> ArrayMesh:
	var vertices: PackedVector3Array = PackedVector3Array()
	var normals: PackedVector3Array = PackedVector3Array()
	var uvs: PackedVector2Array = PackedVector2Array()
	var indices: PackedInt32Array = PackedInt32Array()
	for j: int in range(profile.size()):
		var before: Vector2 = profile[maxi(0,j-1)]
		var after: Vector2 = profile[mini(profile.size()-1,j+1)]
		var tangent: Vector2 = (after-before).normalized()
		for i: int in range(sides+1):
			var angle: float = TAU*float(i)/sides
			vertices.append(Vector3(cos(angle)*profile[j].x,profile[j].y,sin(angle)*profile[j].x))
			normals.append(Vector3(cos(angle)*tangent.y,-tangent.x,sin(angle)*tangent.y).normalized())
			uvs.append(Vector2(float(i)/sides,float(j)/(profile.size()-1)))
	for j: int in range(profile.size()-1):
		for i: int in range(sides):
			var a: int = j*(sides+1)+i
			var b: int = (j+1)*(sides+1)+i
			indices.append_array(PackedInt32Array([a,a+1,b,a+1,b+1,b]))
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh: ArrayMesh = ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	return mesh

static func _v(st: SurfaceTool, p: Vector3, n: Vector3, c: Color = Color.WHITE, uv: Vector2 = Vector2.ZERO) -> void:
	st.set_normal(n)
	st.set_color(c)
	st.set_uv(uv)
	st.add_vertex(p)

static func _tube(st: SurfaceTool, points: Array[Vector3], radii: Array[float], sides: int, color: Color) -> void:
	var rings: Array = []
	var norms: Array = []
	for j: int in range(points.size()):
		var tangent: Vector3 = (points[mini(j+1,points.size()-1)]-points[maxi(0,j-1)]).normalized()
		var axis: Vector3 = tangent.cross(Vector3.FORWARD)
		if axis.length_squared() < .01:
			axis = tangent.cross(Vector3.RIGHT)
		axis = axis.normalized()
		var second: Vector3 = tangent.cross(axis).normalized()
		var ring: Array[Vector3] = []
		var normals: Array[Vector3] = []
		for i: int in range(sides):
			var theta: float = TAU*float(i)/sides
			var radial: Vector3 = axis*cos(theta)+second*sin(theta)
			var groove: float = 1.0+.075*sin(theta*5.0+float(j)*.3)
			ring.append(points[j]+radial*radii[j]*groove)
			normals.append(radial)
		rings.append(ring)
		norms.append(normals)
	for j: int in range(points.size()-1):
		for i: int in range(sides):
			var k: int = (i+1)%sides
			for pair: Vector2i in [Vector2i(j,i),Vector2i(j+1,i),Vector2i(j,k),Vector2i(j,k),Vector2i(j+1,i),Vector2i(j+1,k)]:
				var c: Color = color.lightened(float(pair.y%3)*.035)
				_v(st,rings[pair.x][pair.y],norms[pair.x][pair.y],c,Vector2(float(pair.y)/sides,float(pair.x)/points.size()))

static func tube(points: Array[Vector3], radii: Array[float], sides: int = 10) -> ArrayMesh:
	var st: SurfaceTool = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_tube(st,points,radii,sides,Color.WHITE)
	return st.commit()

static func _organic(st: SurfaceTool, center: Vector3, extent: Vector3, seed_value: float, color: Color, rings_count: int = 7, sides: int = 11) -> void:
	var points: Array = []
	var normals: Array = []
	for y: int in range(rings_count+1):
		var latitude: float = PI*float(y)/rings_count
		var row: Array[Vector3] = []
		var row_n: Array[Vector3] = []
		for x: int in range(sides+1):
			var longitude: float = TAU*float(x)/sides
			var direction: Vector3 = Vector3(sin(latitude)*cos(longitude),cos(latitude),sin(latitude)*sin(longitude))
			var rough: float = 1.0+.13*sin(direction.x*8.0+seed_value)*cos(direction.y*7.0+direction.z*4.0)+.06*sin(longitude*5.0+seed_value)*sin(latitude)
			row.append(center+direction*extent*rough)
			row_n.append((direction/extent).normalized())
		points.append(row)
		normals.append(row_n)
	for y: int in range(rings_count):
		for x: int in range(sides):
			for index: Vector2i in [Vector2i(y,x),Vector2i(y,x+1),Vector2i(y+1,x),Vector2i(y,x+1),Vector2i(y+1,x+1),Vector2i(y+1,x)]:
				var shade: float = clampf(float(rings_count-index.x)/rings_count,.0,1.0)
				_v(st,points[index.x][index.y],normals[index.x][index.y],color.darkened(.19*(1.0-shade)),Vector2(float(index.y)/sides,float(index.x)/rings_count))

static func rock_mesh(seed_value: int) -> ArrayMesh:
	var key: String = "rock"+str(seed_value)
	if mesh_cache.has(key):
		return mesh_cache[key]
	var st: SurfaceTool = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_organic(st,Vector3.ZERO,Vector3(1,.75,.85),float(seed_value),Color.WHITE,6,9)
	var mesh: ArrayMesh = st.commit()
	mesh_cache[key] = mesh
	return mesh

static func tree_mesh(seed_value: int, dead: bool = false) -> ArrayMesh:
	var key: String = "tree"+str(seed_value)+str(dead)
	if mesh_cache.has(key):
		return mesh_cache[key]
	var random: RandomNumberGenerator = RandomNumberGenerator.new()
	random.seed = seed_value
	var height: float = random.randf_range(9.0,13.5)
	var bend: Vector3 = Vector3(random.randf_range(-1.2,1.2),0,random.randf_range(-1.2,1.2))
	var trunk: Array[Vector3] = []
	var radii: Array[float] = []
	for i: int in range(7):
		var f: float = float(i)/6.0
		trunk.append(Vector3(0,height*f,0)+bend*f*f+Vector3(sin(f*4.0)*.19,0,cos(f*5.0)*.17))
		radii.append(lerpf(.58,.04,pow(f,.65)))
	var bark: SurfaceTool = SurfaceTool.new()
	bark.begin(Mesh.PRIMITIVE_TRIANGLES)
	_tube(bark,trunk,radii,10,Color(.76,.77,.69))
	var leaves: SurfaceTool = SurfaceTool.new()
	leaves.begin(Mesh.PRIMITIVE_TRIANGLES)
	for branch: int in range(10):
		var t: float = random.randf_range(.38,.88)
		var angle: float = float(branch)*2.39996+random.randf_range(-.15,.15)
		var direction: Vector3 = Vector3(cos(angle),.28,sin(angle))
		var length: float = random.randf_range(2.4,4.4)*(1.1-t*.35)
		var start: Vector3 = Vector3(0,height*t,0)+bend*t*t
		var mid: Vector3 = start+direction*length*.5+Vector3(0,.65,0)
		var end: Vector3 = start+direction*length+Vector3(0,1.2,0)
		_tube(bark,[start,mid,end,end+Vector3(.2,.55,.1)],[.21*(1.0-t*.5),.135,.055,.012],7,Color(.74,.75,.67))
		for twig: int in range(2):
			var azimuth: float = angle+random.randf_range(-.8,.8)
			var tip: Vector3 = end+Vector3(cos(azimuth),.6,sin(azimuth))*random.randf_range(.9,1.5)
			_tube(bark,[mid,end,tip],[.075,.05,.009],5,Color(.77,.77,.7))
			if not dead:
				_organic(leaves,tip+Vector3(0,.38,0),Vector3(random.randf_range(1.25,1.9),random.randf_range(.65,1.15),random.randf_range(1.3,1.8)),seed_value+branch+twig,Color(.78,.86,.74).lightened(random.randf()*.2),6,10)
	if not dead:
		_organic(leaves,trunk[6],Vector3(1.7,.9,1.6),seed_value+22,Color(.9,.94,.78),7,11)
	var mesh: ArrayMesh = bark.commit()
	mesh.surface_set_material(0,material(Color(.21,.22,.19),0,.94))
	if not dead:
		leaves.commit(mesh)
		var leaf_material: ShaderMaterial = ShaderMaterial.new()
		leaf_material.shader = preload("res://shaders/foliage.gdshader")
		leaf_material.set_shader_parameter("tint",Color(.23,.35,.28))
		leaf_material.set_shader_parameter("wind_strength",.09)
		mesh.surface_set_material(1,leaf_material)
	mesh_cache[key] = mesh
	return mesh

static func grass_mesh() -> ArrayMesh:
	if mesh_cache.has("grass"):
		return mesh_cache["grass"]
	var st: SurfaceTool = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for blade: int in range(5):
		var angle: float = blade*2.4
		var right: Vector3 = Vector3(cos(angle),0,sin(angle))
		var bend: Vector3 = Vector3(-sin(angle),0,cos(angle))
		var base: Vector3 = right*.12
		var h: float = .45+float(blade%3)*.14
		for segment: int in range(4):
			var a: float = float(segment)/4.0
			var b: float = float(segment+1)/4.0
			var pa: Vector3 = base+Vector3(0,a*h,0)+bend*a*a*.18
			var pb: Vector3 = base+Vector3(0,b*h,0)+bend*b*b*.18
			var wa: float = (1.0-a)*.045
			var wb: float = (1.0-b)*.045
			var ca: Color = Color(.47,.59,.45).lerp(Color(.85,.9,.65),a)
			var cb: Color = Color(.47,.59,.45).lerp(Color(.85,.9,.65),b)
			_v(st,pa-right*wa,Vector3.UP,ca,Vector2(0,a))
			_v(st,pb-right*wb,Vector3.UP,cb,Vector2(0,b))
			_v(st,pa+right*wa,Vector3.UP,ca,Vector2(1,a))
			_v(st,pa+right*wa,Vector3.UP,ca,Vector2(1,a))
			_v(st,pb-right*wb,Vector3.UP,cb,Vector2(0,b))
			_v(st,pb+right*wb,Vector3.UP,cb,Vector2(1,b))
	var mesh: ArrayMesh = st.commit()
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = preload("res://shaders/foliage.gdshader")
	mat.set_shader_parameter("grass",true)
	mat.set_shader_parameter("wind_strength",.095)
	mat.set_shader_parameter("tint",Color(.38,.46,.29))
	mesh.surface_set_material(0,mat)
	mesh_cache["grass"] = mesh
	return mesh

static func fern_mesh() -> ArrayMesh:
	if mesh_cache.has("fern"):
		return mesh_cache["fern"]
	var st: SurfaceTool = SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for frond: int in range(7):
		var angle: float = frond*2.39996
		var forward: Vector3 = Vector3(cos(angle),0,sin(angle))
		var right: Vector3 = Vector3(-sin(angle),0,cos(angle))
		for leaf: int in range(1,9):
			var t: float = float(leaf)/10.0
			var root: Vector3 = forward*t*.88+Vector3(0,sin(t*2.4)*.65,0)
			var length: float = sin(t*PI)*.24
			for sign_value: float in [-1.0,1.0]:
				var tip: Vector3 = root+right*sign_value*length-forward*.09+Vector3(0,.015,0)
				_v(st,root,Vector3.UP,Color(.63,.77,.53))
				_v(st,tip,Vector3.UP,Color(.82,.89,.69))
				_v(st,root+forward*.095,Vector3.UP,Color(.66,.79,.56))
	var mesh: ArrayMesh = st.commit()
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = preload("res://shaders/foliage.gdshader")
	mat.set_shader_parameter("tint",Color(.25,.42,.32))
	mat.set_shader_parameter("wind_strength",.075)
	mat.set_shader_parameter("grass",true)
	mesh.surface_set_material(0,mat)
	mesh_cache["fern"] = mesh
	return mesh

static func light(parent: Node3D, at: Vector3, color: Color, energy: float, reach: float, shadows: bool = false) -> OmniLight3D:
	var lamp: OmniLight3D = OmniLight3D.new()
	lamp.position = at
	lamp.light_color = color
	lamp.light_energy = energy
	lamp.omni_range = reach
	lamp.omni_attenuation = 1.6
	lamp.shadow_enabled = shadows
	lamp.light_volumetric_fog_energy = .45
	parent.add_child(lamp)
	return lamp

static func line(parent: Node3D, start: Vector3, end: Vector3, thickness: float, mat: Material) -> MeshInstance3D:
	var length: float = start.distance_to(end)
	var instance: MeshInstance3D = put(parent,cylinder(thickness,thickness,maxf(.001,length),8),mat,(start+end)*.5)
	var direction: Vector3 = (end-start).normalized()
	if direction.length_squared() > .1:
		instance.quaternion = Quaternion(Vector3.UP,direction)
	return instance

static func particles(parent: Node3D, at: Vector3, color: Color, amount: int = 24, radius: float = .6) -> GPUParticles3D:
	var p: GPUParticles3D = GPUParticles3D.new()
	p.position = at
	p.amount = amount
	p.lifetime = 3.4
	p.preprocess = 1.0
	p.visibility_aabb = AABB(Vector3(-radius-3,-2,-radius-3),Vector3(radius*2+6,8,radius*2+6))
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var process: ParticleProcessMaterial = ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	process.emission_sphere_radius = radius
	process.direction = Vector3.UP
	process.spread = 45
	process.initial_velocity_min = .12
	process.initial_velocity_max = .38
	process.gravity = Vector3(0,.02,0)
	process.scale_min = .012
	process.scale_max = .035
	var gradient: Gradient = Gradient.new()
	gradient.set_color(0,Color(color.r,color.g,color.b,0.0))
	gradient.set_color(1,Color(color.r,color.g,color.b,0.0))
	gradient.add_point(.2,color)
	gradient.add_point(.7,color)
	var texture: GradientTexture1D = GradientTexture1D.new()
	texture.gradient = gradient
	process.color_ramp = texture
	p.process_material = process
	var mesh: SphereMesh = sphere(1,6,3)
	var mat: StandardMaterial3D = material(Color.WHITE,0,.5,color*2.5).duplicate() as StandardMaterial3D
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.material = mat
	p.draw_pass_1 = mesh
	parent.add_child(p)
	return p

static func lighthouse(parent: Node3D) -> Node3D:
	initialize()
	var root: Node3D = Node3D.new()
	root.name = "Lighthouse"
	parent.add_child(root)
	root.position = IslandData.point(Vector2.ZERO)
	put(root,cylinder(3.0,2.7,.25,48),stone,Vector3(0,-.125,0))
	put(root,lathe([Vector2(2.35,0),Vector2(2.30,.32),Vector2(2.02,.7),Vector2(1.87,1.1),Vector2(1.46,8.1),Vector2(1.87,8.35),Vector2(1.92,8.55)],48),material(Color(.53,.53,.45),.0,.9))
	for y: float in [.65,1.15,3.2,5.55,7.8,8.45]:
		var r: float = lerpf(1.92,1.5,clampf(y/8.1,0,1))
		put(root,cylinder(r+.11,r+.09,.13,48),stone,Vector3(0,y,0))
	for i: int in range(9):
		var y: float = 1.5+i*.72
		var r: float = lerpf(1.87,1.46,y/8.1)+.013
		var a: float = float(i%3)*TAU/3.0+.14
		var window: MeshInstance3D = put(root,box(Vector3(.33,.68,.08)),dark_metal,Vector3(sin(a)*r,y,cos(a)*r))
		window.rotation.y = a
		var slit: MeshInstance3D = put(root,box(Vector3(.18,.5,.025)),material(Color(.27,.25,.14),0,.5,Color(.26,.19,.07)),Vector3(sin(a)*(r+.048),y,cos(a)*(r+.048)))
		slit.rotation.y = a
	put(root,box(Vector3(.85,1.75,.18)),wood,Vector3(0,.92,1.91))
	for x: float in [-.55,.55]:
		put(root,box(Vector3(.17,1.9,.35)),stone,Vector3(x,.96,1.96))
	put(root,box(Vector3(1.22,.24,.38)),stone,Vector3(0,1.96,1.96))
	put(root,sphere(.05,8,5),bronze,Vector3(.26,.91,2.04))
	put(root,cylinder(2.16,2.16,.17,48),dark_metal,Vector3(0,8.68,0))
	for i: int in range(28):
		var a: float = TAU*float(i)/28.0
		put(root,cylinder(.028,.028,.9,6),dark_metal,Vector3(sin(a)*2.06,9.13,cos(a)*2.06))
	put(root,torus(2.07,.042,48),bronze,Vector3(0,9.56,0))
	put(root,torus(2.07,.025,48),dark_metal,Vector3(0,8.91,0))
	var glass: StandardMaterial3D = material(Color(.38,.57,.60,.17),.25,.15).duplicate() as StandardMaterial3D
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	put(root,cylinder(1.24,1.24,1.8,32),glass,Vector3(0,9.7,0))
	for i: int in range(8):
		var a: float = i*TAU/8.0
		put(root,cylinder(.036,.036,1.9,8),bronze,Vector3(sin(a)*1.27,9.7,cos(a)*1.27))
	for y: float in [8.75,10.62]:
		put(root,cylinder(1.4,1.4,.13,32),dark_metal,Vector3(0,y,0))
	put(root,lathe([Vector2(1.8,10.68),Vector2(1.65,10.81),Vector2(.65,11.55),Vector2(.09,11.86),Vector2(.07,12.4)],32),material(Color(.15,.28,.27),.68,.41))
	put(root,sphere(.14,12,6),bronze,Vector3(0,12.45,0))
	var lens: Node3D = Node3D.new()
	lens.name = "Lens"
	root.add_child(lens)
	lens.position.y = 9.7
	put(lens,sphere(.4),gold,Vector3.ZERO,Vector3(1,1.45,1))
	for j: int in range(9):
		put(lens,torus(.56,.033,32),gold,Vector3(0,(j-4)*.11,0))
	light(root,Vector3(0,9.7,0),Color(1,.72,.36),3.0,14.0)
	for i: int in range(2):
		var beam: SpotLight3D = SpotLight3D.new()
		beam.name = "BeaconBeam"+str(i)
		beam.rotation.y = i*PI
		beam.light_color = Color(1.0,.80,.48)
		beam.light_energy = 8.0
		beam.spot_range = 115.0
		beam.spot_angle = 8.0
		beam.spot_attenuation = 1.3
		beam.shadow_enabled = true
		beam.light_volumetric_fog_energy = 3.5
		lens.add_child(beam)
		var cone: MeshInstance3D = put(lens,lathe([Vector2(.05,0),Vector2(5.8,54)],32),null)
		cone.rotation = Vector3(-PI/2,i*PI,0)
		var beam_mat: ShaderMaterial = ShaderMaterial.new()
		beam_mat.shader = preload("res://shaders/beam.gdshader")
		beam_mat.set_shader_parameter("intensity",.035)
		cone.material_override = beam_mat
		cone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return root

static func arch(parent: Node3D, at: Vector3, yaw: float = 0.0, broken: bool = false) -> Node3D:
	var root: Node3D = Node3D.new()
	parent.add_child(root)
	root.position = at
	root.rotation.y = yaw
	for x: float in [-1.6,1.6]:
		put(root,box(Vector3(.77,.2,1.0)),stone,Vector3(x,.1,0))
		for j: int in range(4):
			put(root,box(Vector3(.55,.5,.74)),stone,Vector3(x,.45+j*.5,0))
	for i: int in range(11 if not broken else 7):
		var a: float = PI*float(i)/10.0
		var block: MeshInstance3D = put(root,box(Vector3(.48,.67,.76)),stone,Vector3(cos(a)*1.6,2.1+sin(a)*1.6,0))
		block.rotation.z = a-PI/2
	# Structural collision serves both the keeper and the spring-arm camera.
	var body: StaticBody3D = StaticBody3D.new()
	root.add_child(body)
	for side: float in [-1.0,1.0]:
		var shape: CollisionShape3D = CollisionShape3D.new()
		var box_shape: BoxShape3D = BoxShape3D.new()
		box_shape.size = Vector3(.77,2.42,1.0)
		shape.shape = box_shape
		shape.position = Vector3(side*1.6,1.2,0)
		body.add_child(shape)
	for i: int in range(11 if not broken else 7):
		var a: float = PI*float(i)/10.0
		var shape: CollisionShape3D = CollisionShape3D.new()
		var box_shape: BoxShape3D = BoxShape3D.new()
		box_shape.size = Vector3(.48,.67,.76)
		shape.shape = box_shape
		shape.position = Vector3(cos(a)*1.6,2.1+sin(a)*1.6,0)
		shape.rotation.z = a-PI/2
		body.add_child(shape)
	return root

static func ward(parent: Node3D) -> Node3D:
	var root: Node3D = Node3D.new()
	parent.add_child(root)
	put(root,cylinder(1.1,1.0,.2,12),stone,Vector3(0,-.10,0))
	put(root,cylinder(.65,.50,.75,8),stone,Vector3(0,.55,0))
	put(root,torus(.66,.042,32),bronze,Vector3(0,.89,0))
	var ring: MeshInstance3D = put(root,torus(.86,.055,48),bronze,Vector3(0,1.95,0))
	ring.rotation.x = PI/2
	var core: MeshInstance3D = put(root,sphere(.29,12,8),cyan,Vector3(0,1.95,0),Vector3(.75,1.5,.75))
	core.name = "Core"
	for i: int in range(8):
		var a: float = i*TAU/8
		var gem: MeshInstance3D = put(root,box(Vector3(.075,.075,.10)),bronze,Vector3(cos(a)*.86,1.95+sin(a)*.86,0))
		gem.rotation.z = a
	return root

static func bell(parent: Node3D, index: int) -> Node3D:
	var root: Node3D = Node3D.new()
	parent.add_child(root)
	for x: float in [-.92,.92]:
		put(root,box(Vector3(.2,3.0,.22)),wood,Vector3(x,1.5,0))
		put(root,box(Vector3(.4,.25,.45)),stone,Vector3(x,.13,0))
	put(root,box(Vector3(2.3,.24,.28)),wood,Vector3(0,3.02,0))
	var pivot: Node3D = Node3D.new()
	pivot.name = "BellBody"
	pivot.position.y = 2.8
	root.add_child(pivot)
	put(pivot,cylinder(.022,.022,.4,8),dark_metal,Vector3(0,-.2,0))
	put(pivot,lathe([Vector2(.68,-1.30),Vector2(.7,-1.22),Vector2(.51,-1.16),Vector2(.36,-.91),Vector2(.27,-.53),Vector2(.13,-.39),Vector2(.025,-.37)],28),bronze)
	put(pivot,torus(.65,.026,32),gold,Vector3(0,-1.25,0))
	put(pivot,sphere(.095,10,6),dark_metal,Vector3(0,-1.30,0))
	for i: int in range(index+1):
		put(root,sphere(.065,10,6),gold,Vector3((i-float(index)*.5)*.2,3.23,.0))
	return root

static func mirror(parent: Node3D, index: int) -> Node3D:
	var root: Node3D = Node3D.new()
	parent.add_child(root)
	put(root,cylinder(.88,.78,.2,8),stone,Vector3(0,-.10,0))
	put(root,cylinder(.30,.19,.9,12),bronze,Vector3(0,.65,0))
	put(root,torus(.84,.025,32),bronze,Vector3(0,.23,0))
	var notch_angle: float = IslandData.MIRROR_TARGETS[index]*PI/2
	put(root,sphere(.09,12,6),cyan,Vector3(sin(notch_angle)*.83,.27,cos(notch_angle)*.83))
	var pivot: Node3D = Node3D.new()
	pivot.name = "MirrorFace"
	pivot.position.y = 1.4
	root.add_child(pivot)
	var ring: MeshInstance3D = put(pivot,torus(.65,.065,40),bronze)
	ring.rotation.x = PI/2
	var glass: MeshInstance3D = put(pivot,cylinder(.58,.58,.07,40),material(Color(.30,.43,.47),.93,.1))
	glass.rotation.x = PI/2
	put(pivot,sphere(.06,10,6),gold,Vector3(0,-1.11,.83))
	line(pivot,Vector3(0,-.64,0),Vector3(0,-1.11,.83),.035,bronze)
	return root

static func seal(parent: Node3D) -> Node3D:
	var root: Node3D = Node3D.new()
	parent.add_child(root)
	put(root,rock_mesh(17),stone,Vector3(0,.65,0),Vector3(.75,1.1,.5))
	var ring: MeshInstance3D = put(root,torus(.76,.06,40),dark_metal,Vector3(0,1.5,.43))
	ring.rotation.x = PI/2
	for i: int in range(12):
		var a: float = i*TAU/12.0
		var segment: MeshInstance3D = put(root,box(Vector3(.10,.19,.07)),bronze,Vector3(sin(a)*.75,1.5+cos(a)*.75,.45))
		segment.rotation.z = -a
		segment.name = "Segment"+str(i)
	put(root,sphere(.12,10,6),cyan,Vector3(0,1.5,.48))
	return root

static func book(parent: Node3D) -> Node3D:
	var root: Node3D = Node3D.new()
	parent.add_child(root)
	put(root,cylinder(.19,.12,.85,8),wood,Vector3(0,.42,0))
	put(root,box(Vector3(.64,.08,.42)),wood,Vector3(0,.9,0))
	for side: float in [-1.0,1.0]:
		var page: MeshInstance3D = put(root,box(Vector3(.28,.025,.34)),material(Color(.80,.74,.55)),Vector3(side*.145,.96,0))
		page.rotation.z = side*.13
		for line_index: int in range(5):
			put(root,box(Vector3(.19,.003,.007)),wood,Vector3(side*.145,.982+.012*abs(side),-.115+line_index*.046))
	put(root,box(Vector3(.027,.01,.4)),material(Color(.50,.17,.12)),Vector3(.07,.999,.04))
	return root
