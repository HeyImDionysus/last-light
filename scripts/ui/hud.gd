class_name GameHUD
extends CanvasLayer
signal action_requested(action: String, value: Variant)
const INK: Color = Color(.034,.060,.064)
const PANEL: Color = Color(.056,.084,.088,.97)
const PAPER: Color = Color(.90,.88,.80)
const GOLD: Color = Color(.83,.66,.36)
const MUTED: Color = Color(.57,.65,.64)
var root: Control
var game_hud: Control
var menu: Control
var modal: Control
var veil: ColorRect
var title_font: SystemFont
var body_font: SystemFont
var bank_label: Label
var carry_label: Label
var health_label: Label
var ward_label: Label
var goal_label: Label
var region_label: Label
var energy_bar: ProgressBar
var stamina_bar: ProgressBar
var energy_label: Label
var pulse_label: Label
var hint_label: Label
var toast_label: Label
var toast_time: float = 0
var toast_queue: Array[Dictionary] = []
var status_label: Label
var fade_material: ShaderMaterial
var vignette: ColorRect
var mode: String = "loading"
var awaiting_key: String = ""
var return_mode: String = "menu"
var key_button: Button
var live: bool = false
var interaction_text: String = ""
var controller: bool = false
var touch_root: Control
var touch_keeper: Keeper
var move_touch: int = -1
var look_touch: int = -1
var move_origin: Vector2
var joystick: Control
var map_widget: IslandMap
var setting_scroll: ScrollContainer

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 10
	title_font = SystemFont.new()
	title_font.font_names = PackedStringArray(["Georgia","DejaVu Serif","Liberation Serif"])
	body_font = SystemFont.new()
	body_font.font_names = PackedStringArray(["Segoe UI","DejaVu Sans","Liberation Sans"])
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	root.theme = _theme()
	vignette = ColorRect.new()
	vignette.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fade_material = ShaderMaterial.new()
	fade_material.shader = preload("res://shaders/vignette.gdshader")
	vignette.material = fade_material
	root.add_child(vignette)
	_build_hud()
	menu = Control.new()
	menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(menu)
	modal = Control.new()
	modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(modal)
	modal.hide()
	_build_touch()
	show_loading()

func _theme() -> Theme:
	var theme: Theme = Theme.new()
	theme.default_font = body_font
	theme.default_font_size = 16
	theme.set_color("font_color","Label",PAPER)
	theme.set_color("font_color","Button",PAPER)
	theme.set_color("font_hover_color","Button",Color(1,.90,.67))
	theme.set_color("font_focus_color","Button",Color(1,.90,.67))
	theme.set_color("font_disabled_color","Button",Color(.33,.40,.40))
	theme.set_stylebox("normal","Button",_box(Color(.09,.13,.135,.85),Color(.23,.29,.28),1,5))
	theme.set_stylebox("hover","Button",_box(Color(.14,.19,.19),GOLD,1,5))
	theme.set_stylebox("pressed","Button",_box(Color(.19,.22,.20),GOLD,1,5))
	theme.set_stylebox("focus","Button",_box(Color(0,0,0,0),GOLD,2,5))
	theme.set_stylebox("disabled","Button",_box(Color(.07,.10,.10,.6),Color(.12,.16,.16),1,5))
	theme.set_constant("outline_size","Label",2)
	theme.set_color("font_outline_color","Label",Color(.02,.04,.04,.6))
	var meter_background: StyleBoxFlat = _box(Color(.1,.14,.14,.85),Color(.2,.27,.25),1,3)
	var meter_fill: StyleBoxFlat = _box(GOLD,GOLD,0,3)
	for style: StyleBoxFlat in [meter_background,meter_fill]:
		style.content_margin_top = 0
		style.content_margin_bottom = 0
	theme.set_stylebox("background","ProgressBar",meter_background)
	theme.set_stylebox("fill","ProgressBar",meter_fill)
	return theme

func _box(color: Color, border: Color = Color.TRANSPARENT, width: int = 0, radius: int = 0) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 17
	style.content_margin_right = 17
	style.content_margin_top = 9
	style.content_margin_bottom = 9
	return style

func _label(text: String, size_value: int = 16, color: Color = PAPER, serif: bool = false) -> Label:
	var label: Label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size",size_value)
	label.add_theme_color_override("font_color",color)
	if serif:
		label.add_theme_font_override("font",title_font)
	return label

func _paragraph(text: String, size_value: int = 17, color: Color = PAPER) -> Label:
	var label: Label = _label(text,size_value,color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return label

func _button(text: String, action: String, value: Variant = null) -> Button:
	var button: Button = Button.new()
	button.text = text
	button.custom_minimum_size.y = 42
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.pressed.connect(func() -> void:
		Sound.play("ui",-10)
		action_requested.emit(action,value))
	button.mouse_entered.connect(func() -> void: button.grab_focus())
	return button

func _clear(node: Node) -> void:
	for child: Node in node.get_children():
		node.remove_child(child)
		child.queue_free()

func _margin(parent: Control, amount: int = 32) -> MarginContainer:
	var container: MarginContainer = MarginContainer.new()
	container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left","right","top","bottom"]:
		container.add_theme_constant_override("margin_"+side,amount)
	parent.add_child(container)
	return container

func _build_hud() -> void:
	game_hud = Control.new()
	game_hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	game_hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(game_hud)
	var top: HBoxContainer = HBoxContainer.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 32
	top.offset_right = -32
	top.offset_top = 25
	game_hud.add_child(top)
	var left: VBoxContainer = VBoxContainer.new()
	left.add_theme_constant_override("separation",4)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(left)
	region_label = _label("THE LAST LIGHT",13,GOLD)
	left.add_child(region_label)
	goal_label = _label("Bring the fallen stars home.",20,PAPER,true)
	left.add_child(goal_label)
	status_label = _label("",14,MUTED)
	left.add_child(status_label)
	var right: VBoxContainer = VBoxContainer.new()
	right.alignment = BoxContainer.ALIGNMENT_END
	top.add_child(right)
	bank_label = _label("00 / 20   STARS RETURNED",17,GOLD)
	bank_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	right.add_child(bank_label)
	ward_label = _label("0 / 3   WARDS RESTORED",13,PAPER)
	ward_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	right.add_child(ward_label)
	var bottom: HBoxContainer = HBoxContainer.new()
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_left = 32
	bottom.offset_right = -32
	bottom.offset_top = -128
	bottom.offset_bottom = -25
	game_hud.add_child(bottom)
	var meters: VBoxContainer = VBoxContainer.new()
	meters.custom_minimum_size.x = 252
	meters.add_theme_constant_override("separation",6)
	bottom.add_child(meters)
	health_label = _label("●   ●   ●",20,GOLD)
	meters.add_child(health_label)
	energy_label = _label("LANTERN   100",13,PAPER)
	meters.add_child(energy_label)
	energy_bar = ProgressBar.new()
	energy_bar.show_percentage = false
	energy_bar.custom_minimum_size.y = 11
	meters.add_child(energy_bar)
	stamina_bar = ProgressBar.new()
	stamina_bar.show_percentage = false
	stamina_bar.custom_minimum_size.y = 4
	var stamina_fill: StyleBoxFlat = _box(Color(.44,.68,.64),Color.TRANSPARENT,0,2)
	stamina_fill.content_margin_top = 0
	stamina_fill.content_margin_bottom = 0
	stamina_bar.add_theme_stylebox_override("fill",stamina_fill)
	meters.add_child(stamina_bar)
	var gap: Control = Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.add_child(gap)
	var items: VBoxContainer = VBoxContainer.new()
	items.alignment = BoxContainer.ALIGNMENT_END
	bottom.add_child(items)
	carry_label = _label("◇  ◇  ◇  ◇  ◇",22,GOLD)
	carry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	items.add_child(carry_label)
	pulse_label = _label("PULSE READY",13,PAPER)
	pulse_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	items.add_child(pulse_label)
	hint_label = _label("",13,MUTED)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	items.add_child(hint_label)
	toast_label = _paragraph("",18,PAPER)
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	toast_label.offset_left = -335
	toast_label.offset_right = 335
	toast_label.offset_top = 110
	toast_label.offset_bottom = 180
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.add_theme_color_override("font_shadow_color",Color.BLACK)
	toast_label.add_theme_constant_override("shadow_offset_x",1)
	toast_label.add_theme_constant_override("shadow_offset_y",2)
	game_hud.add_child(toast_label)
	var prompt: Label = _label("",18,GOLD)
	prompt.name = "Prompt"
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	prompt.offset_left = -360
	prompt.offset_right = 360
	prompt.offset_top = -97
	prompt.offset_bottom = -58
	game_hud.add_child(prompt)
	var reticle: Label = _label("·",30,Color(1,.92,.68,.8))
	reticle.name = "Reticle"
	reticle.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	reticle.offset_left = -8
	reticle.offset_top = -18
	reticle.offset_right = 8
	reticle.offset_bottom = 18
	reticle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	game_hud.add_child(reticle)
	game_hud.hide()

func show_loading() -> void:
	mode = "loading"
	_clear(menu)
	menu.show()
	var shade: ColorRect = ColorRect.new()
	shade.color = INK
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.add_child(shade)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.add_child(center)
	var text: VBoxContainer = VBoxContainer.new()
	center.add_child(text)
	text.add_child(_label("LAST LIGHT",54,PAPER,true))
	var label: Label = _label("GATHERING THE NIGHT",12,GOLD)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	text.add_child(label)

func show_main(has_save: bool, completed: bool = false) -> void:
	mode = "menu"
	live = false
	game_hud.hide()
	touch_root.hide()
	modal.hide()
	menu.show()
	_clear(menu)
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(.018,.035,.039,.58)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.add_child(shade)
	var margin: MarginContainer = _margin(menu,54)
	var row: HBoxContainer = HBoxContainer.new()
	margin.add_child(row)
	var left: VBoxContainer = VBoxContainer.new()
	left.custom_minimum_size.x = 355
	left.add_theme_constant_override("separation",11)
	row.add_child(left)
	left.add_child(_label("A  L A N T E R N  T A L E",12,GOLD))
	left.add_child(_label("LAST\nLIGHT",78,PAPER,true))
	left.add_child(_paragraph("The sea has swallowed the dawn.\nCarry the stars home.",16,MUTED))
	var spacer: Control = Control.new()
	spacer.custom_minimum_size.y = 14
	left.add_child(spacer)
	var first: Button
	if has_save:
		first = _button("Return to the dawn" if completed else "Continue the journey","continue")
		left.add_child(first)
	var new_button: Button = _button("Begin a new journey","new")
	left.add_child(new_button)
	if first==null:
		first = new_button
	var settings_row: HBoxContainer = HBoxContainer.new()
	left.add_child(settings_row)
	for pair: Array in [["Settings","settings"],["Controls","controls"]]:
		var button: Button = _button(pair[0],pair[1])
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		settings_row.add_child(button)
	var second_row: HBoxContainer = HBoxContainer.new()
	left.add_child(second_row)
	for pair: Array in [["Credits","credits"],["Quit","quit"]]:
		var button: Button = _button(pair[0],pair[1])
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		second_row.add_child(button)
	var grow: Control = Control.new()
	grow.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(grow)
	left.add_child(_label("AN OFFLINE ADVENTURE  /  GODOT EDITION 2.0",10,MUTED))
	first.grab_focus()

func show_game() -> void:
	mode = "game"
	live = true
	menu.hide()
	modal.hide()
	game_hud.show()
	touch_root.visible = bool(Profile.options["touch"])

func _dialog(title: String, subtitle: String, width: float = 650) -> VBoxContainer:
	_clear(modal)
	modal.show()
	touch_root.hide()
	var shade: ColorRect = ColorRect.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(.015,.03,.035,.82)
	modal.add_child(shade)
	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	modal.add_child(center)
	var panel: PanelContainer = PanelContainer.new()
	panel.custom_minimum_size.x = width
	panel.add_theme_stylebox_override("panel",_box(PANEL,Color(.3,.35,.31),1,8))
	center.add_child(panel)
	var margin: MarginContainer = MarginContainer.new()
	for side: String in ["left","right","top","bottom"]:
		margin.add_theme_constant_override("margin_"+side,18)
	panel.add_child(margin)
	var column: VBoxContainer = VBoxContainer.new()
	column.add_theme_constant_override("separation",14)
	margin.add_child(column)
	column.add_child(_label(title,34,PAPER,true))
	if not subtitle.is_empty():
		column.add_child(_paragraph(subtitle,16,MUTED))
	return column

func show_pause() -> void:
	mode = "pause"
	var column: VBoxContainer = _dialog("A moment of shelter","Your journey is paused. Progress is saved at the lighthouse and awakened wards.",600)
	var first: Button = _button("Return to the forest","resume")
	column.add_child(first)
	for pair: Array in [["Map & journal","map"],["Settings","settings"],["Controls","controls"],["Save and return to title","title"]]:
		column.add_child(_button(pair[0],pair[1]))
	first.grab_focus()

func show_new_confirmation() -> void:
	mode = "confirm"
	var column: VBoxContainer = _dialog("Begin again?","This replaces the current journey. Your settings and best score are kept.",560)
	column.add_child(_button("Choose a new journey","difficulty"))
	var back: Button = _button("Keep my current journey","back")
	column.add_child(back)
	back.grab_focus()

func show_difficulty() -> void:
	mode = "difficulty"
	var column: VBoxContainer = _dialog("How dark is the night?","All three journeys contain the same island, encounters and ending.",660)
	column.add_child(_button("Story  —  generous lantern, slower threats","start",0))
	var standard: Button = _button("Standard  —  the intended balance","start",1)
	column.add_child(standard)
	column.add_child(_button("Eclipse  —  faster shadows, precious light","start",2))
	column.add_child(_button("Back","back"))
	standard.grab_focus()

func show_settings() -> void:
	mode = "settings"
	var column: VBoxContainer = _dialog("Settings","Changes apply immediately and are stored on this device.",720)
	setting_scroll = ScrollContainer.new()
	setting_scroll.custom_minimum_size = Vector2(640,358)
	setting_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(setting_scroll)
	var settings: VBoxContainer = VBoxContainer.new()
	settings.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	settings.add_theme_constant_override("separation",13)
	setting_scroll.add_child(settings)
	for entry: Array in [["Master volume","master",0.0,1.0,.01],["Music","music",0.0,1.0,.01],["Ambience","ambience",0.0,1.0,.01],["Effects","effects",0.0,1.0,.01],["Brightness","brightness",.7,1.6,.05],["Look sensitivity","sensitivity",.0005,.008,.0001],["3D resolution scale","render_scale",.6,1.0,.05]]:
		var row: HBoxContainer = HBoxContainer.new()
		settings.add_child(row)
		var label: Label = _label(entry[0],15)
		label.custom_minimum_size.x = 222
		row.add_child(label)
		var slider: HSlider = HSlider.new()
		slider.min_value = entry[2]
		slider.max_value = entry[3]
		slider.step = entry[4]
		slider.value = Profile.options[entry[1]]
		slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(slider)
		var value_label: Label = _label("",13,GOLD)
		value_label.custom_minimum_size.x = 53
		row.add_child(value_label)
		var key: String = entry[1]
		value_label.text = "%.4f"%slider.value if key=="sensitivity" else "%d%%"%int(slider.value*100)
		slider.value_changed.connect(func(value: float) -> void:
			Profile.set_option(key,value)
			value_label.text = "%.4f"%value if key=="sensitivity" else "%d%%"%int(value*100))
	var quality_row: HBoxContainer = HBoxContainer.new()
	settings.add_child(quality_row)
	var quality_label: Label = _label("Rendering quality",15)
	quality_label.custom_minimum_size.x = 222
	quality_row.add_child(quality_label)
	var quality: OptionButton = OptionButton.new()
	quality.add_item("Low · reduced foliage / shadows")
	quality.add_item("High · fog / shadows / ambient occlusion")
	quality.add_item("Ultra · indirect lighting / SDFGI")
	quality.select(Profile.options["quality"])
	quality.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	quality_row.add_child(quality)
	quality.item_selected.connect(func(index: int) -> void: Profile.set_option("quality",index))
	for entry: Array in [["Fullscreen","fullscreen"],["Vertical sync","vsync"],["Invert vertical look","invert_y"],["Reduced camera motion","reduce_motion"],["High-contrast HUD","high_contrast"],["Ambient captions","subtitles"],["Pause when focus is lost","pause_focus"],["Touch controls","touch"]]:
		var check: CheckButton = CheckButton.new()
		check.text = entry[0]
		check.button_pressed = Profile.options[entry[1]]
		var key: String = entry[1]
		check.toggled.connect(func(value: bool) -> void: Profile.set_option(key,value))
		settings.add_child(check)
	settings.add_child(_paragraph("Ultra uses the Forward+ renderer. Compatibility launch mode omits volumetric fog and indirect lighting. Lower quality or 3D resolution scale when frame rate is uneven.",13,MUTED))
	var back: Button = _button("Done","back")
	column.add_child(back)
	back.grab_focus()

func show_controls() -> void:
	mode = "controls"
	var column: VBoxContainer = _dialog("Controls","Select a key to rebind it. Mouse and controller bindings remain available.",720)
	var grid: GridContainer = GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation",12)
	grid.add_theme_constant_override("v_separation",7)
	column.add_child(grid)
	for entry: Array in [["Forward","move_forward"],["Back","move_back"],["Left","move_left"],["Right","move_right"],["Sprint","sprint"],["Dodge","dodge"],["Interact","interact"],["Map / journal","map"],["Pause","pause"],["Recenter","recenter"]]:
		var label: Label = _label(entry[0],15)
		label.custom_minimum_size.x = 126
		grid.add_child(label)
		var key: String = entry[1]
		var button: Button = Button.new()
		button.text = Profile.key_label(key)
		button.custom_minimum_size = Vector2(150,38)
		grid.add_child(button)
		button.pressed.connect(func() -> void:
			awaiting_key = key
			key_button = button
			button.text = "Press a key…")
	column.add_child(_button("Restore default bindings","reset_keys"))
	column.add_child(_paragraph("MOUSE   Move to look · Right button to focus · Left button to pulse\nCONTROLLER   Left stick to move · Right stick to look · LB to sprint\nA to dodge · X to interact · RB to pulse · RT to focus · Y for map · Start to pause",14,MUTED))
	column.add_child(_paragraph("Focus directs the lantern; pulse drives shadows back at a cost of 18 light. Dodge costs 24 stamina. Returning to a restored ward recharges the lantern; only the lighthouse banks stars.",14,PAPER))
	var back: Button = _button("Done","back")
	column.add_child(back)
	back.grab_focus()

func show_map(state: RunState, player: Keeper) -> void:
	mode = "map"
	var column: VBoxContainer = _dialog("The keeper’s survey","Crosses mark uncollected stars. Blue markers are sleeping wards; gold markers are safe havens.",1060)
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation",30)
	column.add_child(row)
	map_widget = IslandMap.new()
	map_widget.state = state
	map_widget.keeper_position = player.global_position
	map_widget.keeper_yaw = player.yaw
	map_widget.custom_minimum_size = Vector2(450,405)
	row.add_child(map_widget)
	var journal: VBoxContainer = VBoxContainer.new()
	journal.custom_minimum_size.x = 470
	journal.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	journal.add_theme_constant_override("separation",7)
	row.add_child(journal)
	journal.add_child(_label("RECOVERED JOURNAL   %d / 8"%state.pages.size(),13,GOLD))
	for i: int in range(8):
		var text: String = IslandData.PAGES[i]["title"] if i in state.pages else "An undiscovered page"
		var button: Button = _button("%02d   %s"%[i+1,text],"read",i)
		button.custom_minimum_size.y = 34
		button.disabled = not i in state.pages
		journal.add_child(button)
	journal.add_child(_paragraph("Bellwood: remember the bell order.\nCloister: match gold pointers to blue notches.\nCrown: charge three seals, then pulse the guardian.",13,MUTED))
	var back: Button = _button("Return to the forest","resume")
	column.add_child(back)
	back.grab_focus()

func show_page(index: int) -> void:
	mode = "page"
	var page: Dictionary = IslandData.PAGES[index]
	var column: VBoxContainer = _dialog(page["title"],"FROM THE KEEPER’S JOURNAL  ·  PAGE %02d"%(index+1),720)
	column.add_child(_paragraph(page["body"],19,PAPER))
	var back: Button = _button("Close journal","page_back")
	column.add_child(back)
	back.grab_focus()

func show_death(reason: String) -> void:
	mode = "death"
	var column: VBoxContainer = _dialog("The light remembers",reason+"\nReturn to your last sanctuary checkpoint. There is no permanent loss of the journey.",680)
	var retry: Button = _button("Wake at the last sanctuary","retry")
	column.add_child(retry)
	column.add_child(_button("Return to title","title_no_save"))
	retry.grab_focus()

func show_ending(state: RunState) -> void:
	mode = "ending"
	var column: VBoxContainer = _dialog("And the morning came.","You did not defeat the night. You carried something small through it, again and again, until the world remembered how to shine.",760)
	column.add_child(_label("THE LIGHTHOUSE IS AWAKE",13,GOLD))
	var time_text: String = "%02d:%02d"%[int(state.elapsed/60),int(state.elapsed)%60]
	column.add_child(_paragraph("Stars returned   %d\nWards restored   3 / 3\nPages remembered   %d / 8\nJourney time   %s\nTimes the light found you   %d\nFinal score   %s"%[state.banked.size(),state.pages.size(),time_text,state.deaths,str(state.score)],18,PAPER))
	var first: Button = _button("Walk in the dawn","explore")
	column.add_child(first)
	column.add_child(_button("Credits","credits"))
	column.add_child(_button("Return to title","title"))
	first.grab_focus()

func show_credits() -> void:
	mode = "credits"
	var column: VBoxContainer = _dialog("Last Light","A lantern tale for HeyImDionysus · Native Godot edition 2.0",740)
	column.add_child(_paragraph("An original island, keeper, creatures, architecture, soundscape and score, built for this game.\n\nBuilt with Godot 4.7.2. Godot Engine is distributed under the MIT license. The engine license and third-party notices accompany the playable builds.\n\nNo accounts. No analytics. No advertisements. No runtime downloads. Your journey stays on your device.\n\nThank you for carrying the light.",18,PAPER))
	var back: Button = _button("Back","back")
	column.add_child(back)
	back.grab_focus()

func notify(text: String, seconds: float = 3.5) -> void:
	toast_label.text = text
	toast_time = seconds

func update_state(state: RunState, player: Keeper, objective: String, region: String, prompt: String) -> void:
	bank_label.text = "%02d / 20   STARS RETURNED"%state.banked.size()
	ward_label.text = "%d / 3   WARDS RESTORED"%state.ward_count()
	goal_label.text = objective
	region_label.text = region.to_upper()
	energy_label.text = "LANTERN   %d"%ceili(state.energy)
	energy_bar.value = state.energy
	stamina_bar.value = state.stamina
	health_label.text = ""
	for i: int in range(3):
		health_label.text += "●   " if i<state.health else "○   "
	carry_label.text = ""
	for i: int in range(5):
		carry_label.text += "◆  " if i<state.carried.size() else "◇  "
	if state.carried.size()>=5:
		carry_label.text += "FULL"
	pulse_label.text = "PULSE   %.1fs"%player.pulse_cooldown if player.pulse_cooldown>.01 else ("PULSE READY" if state.energy>=18 else "PULSE · NEED 18 LIGHT")
	hint_label.text = "RB Pulse   RT Focus   Y Map" if controller else "LMB Pulse   RMB Focus   %s Map"%Profile.key_label("map")
	game_hud.get_node("Prompt").text = prompt
	game_hud.get_node("Reticle").visible = player.focused
	status_label.text = ""
	if state.finale:
		status_label.text = "THE LAST WATCH   %02d:%02d   ·   BRAZIERS %d / 3"%[int(state.ritual_time/60),int(state.ritual_time)%60,int(state.braziers[0])+int(state.braziers[1])+int(state.braziers[2])]
	elif state.energy<18 and not state.completed:
		status_label.text = "Light is fading. A restored sanctuary will recharge your lantern."
	elif state.carried.size()>=5:
		status_label.text = "Your satchel is full. Return to the lighthouse to bank these stars."
	elif state.completed:
		status_label.text = "The dawn is yours. Explore, recover the remaining pages, or begin again."
	fade_material.set_shader_parameter("hurt",player.hurt_flash)
	fade_material.set_shader_parameter("darkness",.1 if Profile.options["high_contrast"] else .25)
	if Profile.options["high_contrast"]:
		goal_label.add_theme_constant_override("outline_size",6)
	else:
		goal_label.add_theme_constant_override("outline_size",2)

func _process(delta: float) -> void:
	if toast_time>0 and live and mode=="game":
		toast_time -= delta
		toast_label.modulate.a = clampf(toast_time,0,1)
	elif toast_time<=0:
		toast_label.modulate.a = 0

func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton or event is InputEventJoypadMotion:
		controller = true
	elif event is InputEventKey or event is InputEventMouseMotion:
		controller = false
	if awaiting_key!="" and event is InputEventKey and event.pressed and not event.echo:
		for other: String in ["move_forward","move_back","move_left","move_right","sprint","dodge","interact","map","pause","recenter"]:
			if other==awaiting_key: continue
			for binding: InputEvent in InputMap.action_get_events(other):
				if binding is InputEventKey and binding.physical_keycode==event.physical_keycode:
					key_button.text = "Key in use…"
					get_viewport().set_input_as_handled()
					return
		Profile.bind_key(awaiting_key,event.physical_keycode)
		key_button.text = Profile.key_label(awaiting_key)
		awaiting_key = ""
		get_viewport().set_input_as_handled()
		return
	if mode=="loading":
		return
	if event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		action_requested.emit("escape",null)
	elif event.is_action_pressed("map") and live and mode in ["game","map"]:
		get_viewport().set_input_as_handled()
		action_requested.emit("resume" if mode=="map" else "map",null)

func _build_touch() -> void:
	touch_root = Control.new()
	touch_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	touch_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(touch_root)
	var left: Label = _label("MOVE",12,MUTED)
	left.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	left.position = Vector2(115,-190)
	touch_root.add_child(left)
	var row: HBoxContainer = HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	row.position = Vector2(-415,-210)
	touch_root.add_child(row)
	for entry: Array in [["Dodge","touch_dodge"],["Pulse","touch_pulse"],["Use","interact"],["Map","map"]]:
		var button: Button = _button(entry[0],entry[1])
		button.custom_minimum_size = Vector2(88,62)
		row.add_child(button)
	var focus: Button = Button.new()
	focus.text = "Hold focus"
	focus.custom_minimum_size = Vector2(156,58)
	focus.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	focus.position = Vector2(-213,-284)
	focus.button_down.connect(func() -> void:
		if touch_keeper: touch_keeper.touch_focus=true)
	focus.button_up.connect(func() -> void:
		if touch_keeper: touch_keeper.touch_focus=false)
	touch_root.add_child(focus)
	touch_root.hide()

func _unhandled_input(event: InputEvent) -> void:
	if not touch_root.visible or touch_keeper==null or mode!="game":
		return
	if event is InputEventScreenTouch:
		if event.pressed:
			if event.position.x<root.size.x*.4:
				move_touch = event.index
				move_origin = event.position
			else:
				look_touch = event.index
		else:
			if event.index==move_touch:
				move_touch = -1
				touch_keeper.touch_move = Vector2.ZERO
			if event.index==look_touch:
				look_touch = -1
	elif event is InputEventScreenDrag:
		if event.index==move_touch:
			touch_keeper.touch_move = ((event.position-move_origin)/85.0).limit_length()
		elif event.index==look_touch:
			touch_keeper.look(event.relative*1.5)
