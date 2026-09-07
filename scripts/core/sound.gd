extends Node
## Original synthesis: inharmonic brass, felted tones, filtered wind and granular foley.
## Cached WAV resources are generated in memory; no downloads or external sound banks.
var clips: Dictionary = {}
var music_player: AudioStreamPlayer
var wind_player: AudioStreamPlayer
var tension_player: AudioStreamPlayer
var voice_limit: int = 20
var spatial_voices: Array[AudioStreamPlayer3D] = []
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
var danger: float = 0.0
var dawn: float = 0.0
var ready_audio: bool = false
const SAMPLE_RATE: int = 22050

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	rng.seed = 183041
	# Headless tests verify sound construction separately without spending CPU on ambience.
	_build_short_clips()
	music_player = _player("Music")
	wind_player = _player("Ambience")
	tension_player = _player("Music")
	if DisplayServer.get_name() != "headless":
		music_player.stream = _soundscape(16.0,0)
		wind_player.stream = _soundscape(12.0,1)
		tension_player.stream = _soundscape(8.0,2)
		music_player.volume_db = -17.0
		wind_player.volume_db = -16.0
		tension_player.volume_db = -60.0
		music_player.play()
		wind_player.play()
		tension_player.play()
	ready_audio = true

func _player(bus_name: String) -> AudioStreamPlayer:
	var p: AudioStreamPlayer = AudioStreamPlayer.new()
	p.bus = bus_name
	add_child(p)
	return p

func _build_short_clips() -> void:
	clips["pickup"] = _tone(880.0,.8,0)
	clips["deposit"] = _tone(523.25,1.8,1)
	clips["bell0"] = _tone(392.0,3.3,2)
	clips["bell1"] = _tone(329.63,3.3,2)
	clips["bell2"] = _tone(493.88,3.3,2)
	clips["ward"] = _tone(261.63,3.2,1)
	clips["pulse"] = _tone(72.0,1.0,3)
	clips["dodge"] = _tone(150.0,.36,4)
	clips["step"] = _tone(68.0,.2,5)
	clips["hurt"] = _tone(84.0,.7,6)
	clips["warning"] = _tone(160.0,1.1,7)
	clips["turn"] = _tone(130.0,.5,8)
	clips["ui"] = _tone(660.0,.18,0)
	clips["denied"] = _tone(155.0,.27,0)
	clips["page"] = _tone(210.0,.4,4)
	clips["banish"] = _tone(196.0,1.7,3)
	clips["victory"] = _tone(329.63,5.5,1)

func _wave(samples: PackedFloat32Array, loop: bool = false) -> AudioStreamWAV:
	var data: PackedByteArray = PackedByteArray()
	data.resize(samples.size()*2)
	for i: int in range(samples.size()):
		data.encode_s16(i*2,int(clampf(samples[i],-1.0,1.0)*29000.0))
	var stream: AudioStreamWAV = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = SAMPLE_RATE
	stream.stereo = false
	stream.data = data
	if loop:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_begin = 0
		stream.loop_end = samples.size()
	return stream

func _tone(frequency: float, seconds: float, kind: int) -> AudioStreamWAV:
	var n: int = int(seconds*SAMPLE_RATE)
	var samples: PackedFloat32Array = PackedFloat32Array()
	samples.resize(n)
	var smooth_noise: float = 0.0
	for i: int in range(n):
		var t: float = float(i)/SAMPLE_RATE
		var x: float = t/seconds
		var envelope: float = (1.0-exp(-t*80.0))*exp(-x*5.0)*minf(1.0,(1.0-x)*30.0)
		var angle: float = TAU*frequency*t
		smooth_noise = lerpf(smooth_noise,rng.randf_range(-1.0,1.0),.23)
		var value: float = 0.0
		match kind:
			0:
				value = (sin(angle)+.25*sin(angle*2.004)+.08*sin(angle*3.01))*envelope*.35
			1:
				for part: int in range(4):
					var f: float = [1.0,1.25,1.5,2.0][part]
					var start: float = part*.12
					if t > start:
						value += sin(TAU*frequency*f*(t-start))*exp(-(t-start)*1.25)*minf(1.0,(t-start)*40.0)*.12
				value *= minf(1.0,(1.0-x)*12.0)
			2:
				value = (sin(angle)*exp(-t*1.4)+.42*sin(angle*2.71)*exp(-t*2.5)+.17*sin(angle*4.12)*exp(-t*3.1)+.06*sin(angle*6.7)*exp(-t*5.0))*.37*minf(t*160.0,1.0)*minf((1.0-x)*20.0,1.0)
			3:
				value = (sin(angle*(1.0-x*.72))*.45+smooth_noise*.8)*sin(PI*x)*exp(-x*3.0)
			4:
				value = smooth_noise*sin(PI*x)*.65
			5:
				value = (smooth_noise*.65+sin(angle)*.12)*exp(-t*29.0)*minf(t*500.0,1.0)
			6:
				value = (sin(angle*(1.0-x*.2))*.5+smooth_noise*.45)*envelope
			7:
				value = (smooth_noise*(.45+.3*sin(t*93.0))+sin(angle)*.16)*sin(PI*x)*.65
			8:
				value = (smooth_noise*.4+sin(angle)*.1+sin(angle*1.48)*.08)*sin(PI*x)*.65
		samples[i] = value
	return _wave(samples)

func _soundscape(seconds: float, kind: int) -> AudioStreamWAV:
	var samples: PackedFloat32Array = PackedFloat32Array()
	var count: int = int(seconds*SAMPLE_RATE)
	samples.resize(count)
	var low: float = 0.0
	var high: float = 0.0
	for i: int in range(count):
		var t: float = float(i)/SAMPLE_RATE
		var value: float = 0.0
		if kind == 1:
			var white: float = rng.randf_range(-1.0,1.0)
			low = lerpf(low,white,.013)
			high = lerpf(high,white,.10)
			value = low*2.0+high*.17
			value *= .7+.25*sin(TAU*t/seconds)
		elif kind == 2:
			value = sin(TAU*55.0*t)*.16+sin(TAU*58.25*t)*.11+sin(TAU*110.0*t)*.05
			value *= .6+.2*cos(TAU*t*.5)
		else:
			for j: int in range(4):
				var freq: float = [130.8125,196.0,261.625,329.625][j]
				var motion: float = .5+.3*sin(TAU*t/seconds+float(j))
				value += (sin(TAU*freq*t)+.16*sin(TAU*freq*2.0*t))*motion*.12
		# Short crossfade at both ends removes discontinuities when the original score loops.
		value *= minf(1.0,minf(t,seconds-t)*3.0)
		samples[i] = value
	return _wave(samples,true)

func _process(delta: float) -> void:
	if not ready_audio:
		return
	if is_instance_valid(tension_player):
		tension_player.volume_db = lerpf(tension_player.volume_db,lerpf(-58.0,-15.0,danger)*(1.0-dawn)-55.0*dawn,1.0-exp(-delta*1.6))
	if is_instance_valid(music_player):
		music_player.pitch_scale = lerpf(music_player.pitch_scale,1.0+dawn*.122,1.0-exp(-delta*.4))

func play(key: String, volume: float = 0.0, pitch: float = 1.0) -> void:
	if DisplayServer.get_name() == "headless":
		return
	if not clips.has(key):
		return
	var p: AudioStreamPlayer = _player("Interface" if key in ["ui","denied","page"] else "Effects")
	p.stream = clips[key]
	p.volume_db = volume-7.0
	p.pitch_scale = pitch
	p.finished.connect(p.queue_free)
	p.play()

func at(key: String, location: Vector3, volume: float = 0.0, pitch: float = 1.0) -> void:
	if DisplayServer.get_name() == "headless":
		return
	if not clips.has(key):
		return
	for i: int in range(spatial_voices.size()-1,-1,-1):
		if not is_instance_valid(spatial_voices[i]):
			spatial_voices.remove_at(i)
	if spatial_voices.size() >= voice_limit:
		return
	var p: AudioStreamPlayer3D = AudioStreamPlayer3D.new()
	p.stream = clips[key]
	p.bus = "Effects"
	p.unit_size = 5.0
	p.max_distance = 45.0
	p.volume_db = volume-3.0
	p.pitch_scale = pitch
	add_child(p)
	p.global_position = location
	p.finished.connect(p.queue_free)
	spatial_voices.append(p)
	p.play()

func _stop_all() -> void:
	ready_audio = false
	for child: Node in get_children():
		if child is AudioStreamPlayer or child is AudioStreamPlayer3D:
			child.stop()
			child.stream = null
	spatial_voices.clear()
	clips.clear()

func shutdown() -> void:
	# Release mixer-owned WAV playbacks while the audio server is still processing frames.
	_stop_all()
	await get_tree().process_frame
	await get_tree().process_frame

func _exit_tree() -> void:
	_stop_all()
