extends Node
## Atomic, versioned local saves with a last-known-good backup. No network or account.
signal settings_changed
signal storage_error(message: String)

const SAVE_PATH: String = "user://campaign.json"
const BACKUP_PATH: String = "user://campaign.backup.json"
const OPTIONS_PATH: String = "user://settings.cfg"
var options: Dictionary = {"master":0.8,"music":0.72,"ambience":0.8,"effects":0.85,"quality":1,"brightness":1.0,"sensitivity":0.0025,"invert_y":false,"reduce_motion":false,"high_contrast":false,"subtitles":true,"fullscreen":false,"vsync":true,"render_scale":1.0,"touch":false,"pause_focus":true}
var campaign: Dictionary = {}
var checkpoint_data: Dictionary = {}
var best_score: int = 0
var rebindings: Dictionary = {}
var test_mode: bool = false
var recovered_backup: bool = false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	test_mode = "--test" in OS.get_cmdline_user_args() or "--capture" in OS.get_cmdline_user_args() or "--smoke-test" in OS.get_cmdline_user_args()
	load_options()
	configure_inputs()
	if not test_mode:
		load_campaign()
	apply_options()

func configure_inputs() -> void:
	var defaults: Dictionary = {"move_forward":[KEY_W,KEY_UP],"move_back":[KEY_S,KEY_DOWN],"move_left":[KEY_A,KEY_LEFT],"move_right":[KEY_D,KEY_RIGHT],"sprint":[KEY_SHIFT],"dodge":[KEY_SPACE],"interact":[KEY_E],"map":[KEY_TAB],"pause":[KEY_ESCAPE],"recenter":[KEY_Q]}
	for action: String in defaults:
		if not InputMap.has_action(action):
			InputMap.add_action(action,0.18)
		InputMap.action_erase_events(action)
		for key: int in defaults[action]:
			var event: InputEventKey = InputEventKey.new()
			event.physical_keycode = key as Key
			InputMap.action_add_event(action,event)
	for action: String in ["focus","pulse"]:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		InputMap.action_erase_events(action)
		var click: InputEventMouseButton = InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_RIGHT if action == "focus" else MOUSE_BUTTON_LEFT
		InputMap.action_add_event(action,click)
	var joy: Dictionary = {"dodge":JOY_BUTTON_A,"interact":JOY_BUTTON_X,"map":JOY_BUTTON_Y,"pause":JOY_BUTTON_START,"sprint":JOY_BUTTON_LEFT_SHOULDER,"pulse":JOY_BUTTON_RIGHT_SHOULDER,"recenter":JOY_BUTTON_RIGHT_STICK}
	for action: String in joy:
		var button: InputEventJoypadButton = InputEventJoypadButton.new()
		button.button_index = joy[action]
		InputMap.action_add_event(action,button)
	var axes: Dictionary = {"move_left":[JOY_AXIS_LEFT_X,-1.0],"move_right":[JOY_AXIS_LEFT_X,1.0],"move_forward":[JOY_AXIS_LEFT_Y,-1.0],"move_back":[JOY_AXIS_LEFT_Y,1.0],"focus":[JOY_AXIS_TRIGGER_RIGHT,1.0]}
	for action: String in axes:
		var axis: InputEventJoypadMotion = InputEventJoypadMotion.new()
		axis.axis = axes[action][0]
		axis.axis_value = axes[action][1]
		InputMap.action_add_event(action,axis)
	for action: String in rebindings:
		if InputMap.has_action(action) and (rebindings[action] is int or rebindings[action] is float):
			bind_key(action,int(rebindings[action]),false)

func bind_key(action: String, physical: int, save: bool = true) -> void:
	for event: InputEvent in InputMap.action_get_events(action):
		if event is InputEventKey:
			InputMap.action_erase_event(action,event)
	var key: InputEventKey = InputEventKey.new()
	key.physical_keycode = physical as Key
	InputMap.action_add_event(action,key)
	rebindings[action] = physical
	if save:
		save_options()

func key_label(action: String) -> String:
	for event: InputEvent in InputMap.action_get_events(action):
		if event is InputEventKey:
			return OS.get_keycode_string(event.physical_keycode)
	return action.capitalize()

func load_options() -> void:
	if test_mode:
		return
	var cfg: ConfigFile = ConfigFile.new()
	if cfg.load(OPTIONS_PATH) != OK:
		return
	for key: String in options:
		var value: Variant = cfg.get_value("options",key,options[key])
		if typeof(value) == typeof(options[key]) or (value is int and options[key] is float):
			options[key] = value
	var saved_keys: Variant = cfg.get_value("controls","keys",{})
	rebindings = saved_keys if saved_keys is Dictionary else {}
	best_score = maxi(0,int(cfg.get_value("profile","best",0)))

func save_options() -> void:
	if test_mode:
		return
	var cfg: ConfigFile = ConfigFile.new()
	for key: String in options:
		cfg.set_value("options",key,options[key])
	cfg.set_value("controls","keys",rebindings)
	cfg.set_value("profile","best",best_score)
	if cfg.save(OPTIONS_PATH) != OK:
		storage_error.emit("Settings could not be saved. The game remains playable.")

func set_option(key: String, value: Variant) -> void:
	if not options.has(key):
		return
	options[key] = value
	apply_options()
	save_options()
	settings_changed.emit()

func apply_options() -> void:
	options["quality"] = clampi(int(options["quality"]),0,2)
	options["brightness"] = clampf(float(options["brightness"]),0.7,1.6)
	options["sensitivity"] = clampf(float(options["sensitivity"]),0.0005,0.008)
	options["render_scale"] = clampf(float(options["render_scale"]),0.6,1.0)
	for key: String in ["master","music","ambience","effects"]:
		options[key] = clampf(float(options[key]),0.0,1.0)
		var bus_name: String = key.capitalize()
		var index: int = AudioServer.get_bus_index(bus_name)
		if index >= 0:
			AudioServer.set_bus_volume_db(index,linear_to_db(maxf(0.0001,float(options[key]))))
			AudioServer.set_bus_mute(index,float(options[key]) < 0.001)
	if DisplayServer.get_name() != "headless" and not test_mode:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if options["fullscreen"] else DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if options["vsync"] else DisplayServer.VSYNC_DISABLED)

func load_campaign() -> bool:
	recovered_backup = false
	for path: String in [SAVE_PATH,BACKUP_PATH]:
		if not FileAccess.file_exists(path):
			continue
		var file: FileAccess = FileAccess.open(path,FileAccess.READ)
		if file == null or file.get_length() > 1048576:
			continue
		var raw: Variant = _parse_json(file.get_as_text())
		if raw is Dictionary and raw.get("version") == RunState.VERSION and raw.get("campaign") is Dictionary:
			campaign = RunState.from_dict(raw["campaign"]).as_dict()
			var cp: Variant = raw.get("checkpoint",raw["campaign"])
			checkpoint_data = RunState.from_dict(cp if cp is Dictionary else raw["campaign"]).as_dict()
			recovered_backup = path == BACKUP_PATH
			return true
	return false

func save_campaign(state: RunState, make_checkpoint: bool = false) -> bool:
	campaign = state.as_dict()
	if make_checkpoint or checkpoint_data.is_empty():
		checkpoint_data = campaign.duplicate(true)
	if state.completed:
		best_score = maxi(best_score,state.score)
		save_options()
	if test_mode:
		return true
	var payload: String = JSON.stringify({"version":RunState.VERSION,"campaign":campaign,"checkpoint":checkpoint_data})
	var temporary: String = SAVE_PATH+".tmp"
	var file: FileAccess = FileAccess.open(temporary,FileAccess.WRITE)
	if file == null:
		storage_error.emit("Progress could not be written. Check available disk space.")
		return false
	file.store_string(payload)
	file.flush()
	file.close()
	if FileAccess.file_exists(SAVE_PATH):
		var previous: Variant = _parse_json(FileAccess.get_file_as_string(SAVE_PATH))
		if previous is Dictionary and previous.get("version") == RunState.VERSION:
			DirAccess.copy_absolute(SAVE_PATH,BACKUP_PATH)
	var error: Error = DirAccess.rename_absolute(temporary,SAVE_PATH)
	if error != OK:
		storage_error.emit("Progress could not be committed. The previous save is intact.")
		return false
	return true

func _parse_json(text: String) -> Variant:
	var parser: JSON = JSON.new()
	return parser.data if parser.parse(text)==OK else null
