class_name IslandData
extends RefCounted
## Authored gameplay geometry. Decoration may vary; objectives never do.

const WORLD_SEED: int = 731204
const RADIUS: float = 77.0
const GOAL: int = 20
const CAPACITY: int = 5
const WARD_NAMES: Array[String] = ["The Bellwood", "The Drowned Cloister", "The Ashen Crown"]
const WARD_CENTERS: Array[Vector2] = [Vector2(-43, -27), Vector2(40, -32), Vector2(5, 52)]
const WARD_HEIGHTS: Array[float] = [0.55, 0.35, 3.1]
const BELL_ORDER: Array[int] = [1, 0, 2]
const MIRROR_TARGETS: Array[int] = [1, 3, 2]
const BELL_POSITIONS: Array[Vector2] = [Vector2(-48, -29), Vector2(-42, -33), Vector2(-37, -28)]
const MIRROR_POSITIONS: Array[Vector2] = [Vector2(34, -35), Vector2(40, -39), Vector2(47, -34)]
const SEAL_POSITIONS: Array[Vector2] = [Vector2(-2, 48), Vector2(11, 47), Vector2(5, 59)]
const BRAZIER_POSITIONS: Array[Vector2] = [Vector2(-9, -5), Vector2(9, -5), Vector2(0, 10)]
const PATHS: Array = [
	[Vector2(0, 0), Vector2(-13, -6), Vector2(-24, -14), Vector2(-33, -17), Vector2(-43, -27)],
	[Vector2(0, 0), Vector2(14, -7), Vector2(24, -15), Vector2(31, -24), Vector2(40, -32)],
	[Vector2(0, 0), Vector2(-3, 16), Vector2(4, 27), Vector2(12, 39), Vector2(5, 52)],
	[Vector2(-43, -27), Vector2(-47, -42), Vector2(-24, -49), Vector2(0, -46), Vector2(22, -47), Vector2(40, -32)],
	[Vector2(-43, -27), Vector2(-52, -9), Vector2(-44, 16), Vector2(-22, 35), Vector2(5, 52)],
	[Vector2(40, -32), Vector2(52, -6), Vector2(48, 17), Vector2(31, 38), Vector2(5, 52)]
]
const STAR_POSITIONS: Array[Vector2] = [
	Vector2(-10,-5), Vector2(-18,-8), Vector2(-23,-14), Vector2(-30,-16),
	Vector2(-36,-23), Vector2(-49,-22), Vector2(-53,-31), Vector2(-46,-39),
	Vector2(-35,-38), Vector2(-26,-48), Vector2(-16,-46), Vector2(-44,-11),
	Vector2(11,-6), Vector2(19,-10), Vector2(26,-16), Vector2(29,-24),
	Vector2(36,-27), Vector2(47,-27), Vector2(49,-38), Vector2(36,-44),
	Vector2(25,-46), Vector2(7,-45), Vector2(48,-12), Vector2(53,-1),
	Vector2(-2,12), Vector2(-5,21), Vector2(4,28), Vector2(12,35),
	Vector2(13,42), Vector2(-5,45), Vector2(-7,56), Vector2(15,55),
	Vector2(9,64), Vector2(26,40), Vector2(39,28), Vector2(-22,32),
	Vector2(-35,23), Vector2(-48,8), Vector2(46,15), Vector2(-9,-26)
]
const PAGE_POSITIONS: Array[Vector2] = [Vector2(-6,4), Vector2(-28,-18), Vector2(-46,-34), Vector2(30,-29), Vector2(42,-43), Vector2(-7,33), Vector2(0,60), Vector2(43,14)]
const PAGES: Array[Dictionary] = [
	{"title":"01 / A keeper's promise", "body":"When the sea took the sun, we built a light of our own.\n\nNow the stars are falling, and the lens is cold. Carry twenty of them home. Wake the three sleeping wards. Then return to the lighthouse.\n\nThe lantern is not a weapon. It is a small promise that the dark cannot keep.\n\n— Elian, last keeper of this coast"},
	{"title":"02 / What the shadows remember", "body":"Do not mistake stillness for safety. The small ones circle the lantern. The tall ones wait for its flame to weaken.\n\nFocus the beam to force them back. A pulse buys room, but spends the very light that keeps you alive. Watch their red warning ring. Dodge when it closes.\n\nRest at a waking ward. You do not have to make every journey in one breath."},
	{"title":"03 / The bellwood vow", "body":"The oldest bell is not the first.\n\nTwo lights greet the dusk.\nOne light carries the name.\nThree lights send it home.\n\nRing TWO, then ONE, then THREE. The little marks on each bell are the only names they remember."},
	{"title":"04 / The glass garden", "body":"Each brass mirror has four faces. Turn it until its small gold pointer meets the blue notch on its plinth.\n\nEach restored mirror returns a thread of light. When all three agree, the cloister will remember the sky.\n\nNothing here must be hurried. The water has been waiting longer than you."},
	{"title":"05 / A shore without a horizon", "body":"We called it a lighthouse, though there were no ships left to guide.\n\nMara said that was not the point. A light is also a way of saying: someone is still here.\n\nI kept her cup beside the lens. I do not know why that felt important. It still does."},
	{"title":"06 / Under the ash", "body":"Three seals hold the Crown's old guardian. Feed each seal with the focused lantern. Their broken rings will show you what remains.\n\nWhen all three seals are awake, the guardian's shell will open. Three close pulses can then free it.\n\nDo not stand in the path of its charge. Even a full lantern cannot stop that weight."},
	{"title":"07 / The first keeper", "body":"I thought the thing beneath the Crown was hunting us.\n\nIt was guarding the last three lights. Even after it forgot its hands, its face, and the names of everyone it loved, it remembered that duty.\n\nWhen you release it, be kind. It has stood its watch."},
	{"title":"08 / The return", "body":"The last ritual will dim the ward around the lighthouse. Three braziers must be lit before the dark closes in.\n\nLight them, return to the lens, and send the stars home.\n\nThe center still offers a little shelter. Take it. No one ever asked a keeper to be fearless."}
]

static func path_distance(p: Vector2) -> float:
	var best: float = INF
	for path: Array in PATHS:
		for i: int in range(path.size()-1):
			var a: Vector2 = path[i]
			var b: Vector2 = path[i+1]
			var u: float = clampf((p-a).dot(b-a) / (b-a).length_squared(), 0.0, 1.0)
			best = minf(best, p.distance_to(a+(b-a)*u))
	return best

static func height_at(p: Vector2) -> float:
	var y: float = 0.38 + sin(p.x*0.083)*0.32 + cos(p.y*0.092)*0.27 + sin((p.x+p.y)*0.15)*0.13
	y += 2.5 * exp(-p.distance_squared_to(WARD_CENTERS[2])/650.0)
	y = lerpf(y, 0.45, 1.0-smoothstep(8.0, 15.0, p.length()))
	for i: int in range(3):
		y = lerpf(y, WARD_HEIGHTS[i], 1.0-smoothstep(10.0, 17.0, p.distance_to(WARD_CENTERS[i])))
	y -= smoothstep(69.0, 82.0, p.length())*4.0
	return y

static func point(p: Vector2, lift: float = 0.0) -> Vector3:
	return Vector3(p.x, height_at(p)+lift, p.y)

static func reserved(p: Vector2, margin: float = 0.0) -> bool:
	if p.length() < 12.0+margin or path_distance(p) < 3.3+margin:
		return true
	for center: Vector2 in WARD_CENTERS:
		if p.distance_to(center) < 12.0+margin:
			return true
	for star: Vector2 in STAR_POSITIONS:
		if p.distance_to(star) < 2.3+margin:
			return true
	for page: Vector2 in PAGE_POSITIONS:
		if p.distance_to(page) < 2.6+margin:
			return true
	return false

static func region_at(p: Vector2) -> int:
	var best: float = INF
	var result: int = -1
	if p.length() < 15.0:
		return -1
	for i: int in range(3):
		var d: float = p.distance_to(WARD_CENTERS[i])
		if d < best:
			best = d
			result = i
	return result
