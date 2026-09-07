class_name IslandMap
extends Control
## A live survey map; coordinates are derived from the actual authored island.
var state: RunState
var keeper_position: Vector3
var keeper_yaw: float = 0.0
var map_font: Font = ThemeDB.fallback_font
func _ready() -> void:
	custom_minimum_size = Vector2(430,430)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
func project(p: Vector2) -> Vector2:
	return size*.5+p*minf(size.x,size.y)/172.0
func _draw() -> void:
	if state == null:
		return
	var scale_value: float = minf(size.x,size.y)/172.0
	draw_circle(size*.5,77*scale_value,Color(.09,.15,.16))
	for radius: float in [25,50,75]:
		draw_arc(size*.5,radius*scale_value,0,TAU,96,Color(.22,.31,.31,.45),1,true)
	for path: Array in IslandData.PATHS:
		var points: PackedVector2Array = PackedVector2Array()
		for p: Vector2 in path:
			points.append(project(p))
		draw_polyline(points,Color(.54,.48,.35),3,true)
	for i: int in range(IslandData.STAR_POSITIONS.size()):
		if not i in state.banked and not i in state.carried:
			var p: Vector2 = project(IslandData.STAR_POSITIONS[i])
			draw_line(p-Vector2(3,0),p+Vector2(3,0),Color(.85,.71,.39),1.5)
			draw_line(p-Vector2(0,3),p+Vector2(0,3),Color(.85,.71,.39),1.5)
	for i: int in range(3):
		var p: Vector2 = project(IslandData.WARD_CENTERS[i])
		draw_circle(p,8,Color(.87,.72,.40) if state.wards[i] else Color(.31,.65,.67))
		draw_circle(p,4,Color(.09,.13,.14))
		var words: String = ["BELLWOOD","CLOISTER","ASHEN CROWN"][i]
		draw_string(map_font,p+Vector2(-map_font.get_string_size(words,HORIZONTAL_ALIGNMENT_LEFT,-1,12).x*.5,23),words,HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color(.82,.84,.77))
	for i: int in range(IslandData.PAGE_POSITIONS.size()):
		var p: Vector2 = project(IslandData.PAGE_POSITIONS[i])
		draw_rect(Rect2(p-Vector2(3,4),Vector2(6,8)),Color(.4,.47,.46) if i in state.pages else Color(.60,.84,.82),false,1.2)
	draw_circle(size*.5,7,Color(.95,.81,.48))
	draw_string(map_font,size*.5+Vector2(-35,-15),"LIGHTHOUSE",HORIZONTAL_ALIGNMENT_LEFT,-1,12,Color(.95,.83,.55))
	var player: Vector2 = project(Vector2(keeper_position.x,keeper_position.z))
	var forward: Vector2 = Vector2(-sin(keeper_yaw),-cos(keeper_yaw))
	var side: Vector2 = Vector2(-forward.y,forward.x)
	draw_colored_polygon(PackedVector2Array([player+forward*9,player-forward*5+side*5,player-forward*5-side*5]),Color(1,.96,.85))
	draw_string(map_font,Vector2(size.x*.5-4,20),"N",HORIZONTAL_ALIGNMENT_LEFT,-1,15,Color(.75,.76,.70))
