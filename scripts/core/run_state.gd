class_name RunState
extends RefCounted
## Serializable campaign state. Visual state and simulation references never enter a save.

const VERSION: int = 2
var banked: Array[int] = []
var carried: Array[int] = []
var wards: Array[bool] = [false,false,false]
var pages: Array[int] = []
var mirrors: Array[int] = [0,0,0]
var seals: Array[float] = [0.0,0.0,0.0]
var bell_progress: int = 0
var boss_health: int = 3
var health: int = 3
var energy: float = 100.0
var stamina: float = 100.0
var elapsed: float = 0.0
var deaths: int = 0
var pulses: int = 0
var score: int = 0
var difficulty: int = 1
var spawn: Vector3 = IslandData.point(Vector2(0,6))
var checkpoint: int = -1
var completed: bool = false
var finale: bool = false
var braziers: Array[bool] = [false,false,false]
var ritual_time: float = 90.0
var tutorial: Array[String] = []

func collect(id: int) -> bool:
	if id < 0 or id >= IslandData.STAR_POSITIONS.size() or carried.size() >= IslandData.CAPACITY or id in banked or id in carried:
		return false
	carried.append(id)
	return true

func deposit() -> int:
	var count: int = carried.size()
	if count == 0:
		return 0
	for id: int in carried:
		if not id in banked:
			banked.append(id)
	score += count*100 + count*count*15 + int(energy)
	carried.clear()
	energy = 100.0
	health = 3
	return count

func can_begin_finale() -> bool:
	return banked.size() >= IslandData.GOAL and wards[0] and wards[1] and wards[2] and not completed and not finale

func ward_count() -> int:
	return int(wards[0])+int(wards[1])+int(wards[2])

func lantern_step(delta: float, safe: bool, focused: bool, sprinting: bool) -> void:
	if safe:
		energy = minf(100.0,energy+delta*32.0)
	else:
		var rate: float = (0.85+0.14*carried.size()+float(focused)*2.1+float(sprinting)*0.35)
		if difficulty == 0:
			rate *= 0.48
		elif difficulty == 2:
			rate *= 1.2
		energy = maxf(0.0,energy-delta*rate)

func as_dict() -> Dictionary:
	return {"version":VERSION,"banked":banked.duplicate(),"carried":carried.duplicate(),"wards":wards.duplicate(),"pages":pages.duplicate(),"mirrors":mirrors.duplicate(),"seals":seals.duplicate(),"bell_progress":bell_progress,"boss_health":boss_health,"health":health,"energy":energy,"stamina":stamina,"elapsed":elapsed,"deaths":deaths,"pulses":pulses,"score":score,"difficulty":difficulty,"spawn":[spawn.x,spawn.y,spawn.z],"checkpoint":checkpoint,"completed":completed,"finale":finale,"braziers":braziers.duplicate(),"ritual_time":ritual_time,"tutorial":tutorial.duplicate()}

static func from_dict(raw: Dictionary) -> RunState:
	var s: RunState = RunState.new()
	if not _numeric(raw.get("version")) or int(raw.get("version",0)) != VERSION:
		return s
	for name: String in ["banked","carried","pages"]:
		var out: Array[int] = []
		var maximum: int = 8 if name == "pages" else IslandData.STAR_POSITIONS.size()
		var candidate: Variant = raw.get(name,[])
		if candidate is Array:
			for item: Variant in candidate:
				if _numeric(item) and int(item) >= 0 and int(item) < maximum and not int(item) in out:
					out.append(int(item))
		s.set(name,out)
	for id: int in s.banked:
		s.carried.erase(id)
	if s.carried.size() > IslandData.CAPACITY:
		s.carried.resize(IslandData.CAPACITY)
	for i: int in range(3):
		if raw.get("wards") is Array and raw["wards"].size() > i:
			s.wards[i] = raw["wards"][i] == true
		if raw.get("mirrors") is Array and raw["mirrors"].size() > i and _numeric(raw["mirrors"][i]):
			s.mirrors[i] = clampi(int(raw["mirrors"][i]),0,3)
		if raw.get("seals") is Array and raw["seals"].size() > i and _numeric(raw["seals"][i]):
			s.seals[i] = clampf(float(raw["seals"][i]),0.0,1.0)
		if raw.get("braziers") is Array and raw["braziers"].size() > i:
			s.braziers[i] = raw["braziers"][i] == true
	for key: String in ["boss_health","health","checkpoint","bell_progress","difficulty","deaths","pulses","score"]:
		if _numeric(raw.get(key)):
			s.set(key,int(raw[key]))
	s.boss_health = clampi(s.boss_health,0,3)
	s.health = clampi(s.health,1,3)
	s.checkpoint = clampi(s.checkpoint,-1,2)
	s.bell_progress = clampi(s.bell_progress,0,3)
	if s.bell_progress==3 and not s.wards[0]:
		s.bell_progress = 0
	if s.wards[2]:
		s.boss_health = 0
		s.seals = [1.0,1.0,1.0]
	else:
		s.boss_health = maxi(1,s.boss_health)
	s.difficulty = clampi(s.difficulty,0,2)
	s.deaths = maxi(0,s.deaths)
	s.pulses = maxi(0,s.pulses)
	s.score = maxi(0,s.score)
	for key: String in ["energy","stamina","elapsed","ritual_time"]:
		if _numeric(raw.get(key)):
			s.set(key,maxf(0.0,float(raw[key])))
	s.energy = clampf(s.energy,0,100)
	s.stamina = clampf(s.stamina,0,100)
	s.ritual_time = clampf(s.ritual_time,1,120)
	var pos: Variant = raw.get("spawn",[])
	if pos is Array and pos.size() == 3 and _numeric(pos[0]) and _numeric(pos[1]) and _numeric(pos[2]):
		var p: Vector2 = Vector2(float(pos[0]),float(pos[2]))
		if p.length() < IslandData.RADIUS-1.0:
			s.spawn = IslandData.point(p,0.1)
	s.completed = raw.get("completed",false) == true and s.ward_count() == 3 and s.banked.size() >= IslandData.GOAL
	s.finale = raw.get("finale",false) == true and s.can_begin_finale()
	var tutorials: Variant = raw.get("tutorial",[])
	if tutorials is Array:
		for t: Variant in tutorials:
			if t is String and t.length() < 64 and not t in s.tutorial:
				s.tutorial.append(t)
	return s

static func _numeric(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value))
