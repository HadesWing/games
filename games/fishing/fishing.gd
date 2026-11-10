extends Control
## 拼音钓鱼：听音辨形（无音频时自动回退「看字找鱼」模式）
## 一局 8 个目标；首次点对得满分项；3 星自动升级，0 星降级

const ROUND_TARGETS := 8
const POND := Rect2(50, 150, 1180, 520)

const FISH_COLORS := [
	Color("ff6b81"), Color("70a1ff"), Color("7bed9f"), Color("ffa502"),
	Color("e77f67"), Color("a29bfe"), Color("2ed573"), Color("3742fa"),
]

var fish_count := 3
var speed := 60.0
var pool: Array = []
var targets: Array = []
var t_index := 0
var first_try := 0
var attempts := 0
var fishes: Array = []
var current: String = ""
var busy := false

var prompt: Label
var progress: Label
var result_layer: Control


func _ready() -> void:
	_start()


func _start() -> void:
	var lv := Db.lvl("fishing")
	fish_count = clampi(2 + lv, 3, 8)
	speed = 50.0 + lv * 14.0
	pool = PinyinData.letters_for_level(lv)

	targets = []
	for i in ROUND_TARGETS:
		targets.append(str(pool.pick_random()))
	t_index = 0
	first_try = 0

	_build_background()
	_spawn_fish()
	_next_target()


func _build_background() -> void:
	var bg := ColorRect.new()
	bg.color = Color("1e90d9")
	add_child(bg)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	prompt = Label.new()
	prompt.position = Vector2(0, 30)
	prompt.size = Vector2(1280, 90)
	prompt.add_theme_font_size_override("font_size", 64)
	prompt.add_theme_color_override("font_color", Color.WHITE)
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(prompt)

	progress = Label.new()
	progress.position = Vector2(30, 12)
	progress.size = Vector2(300, 40)
	progress.add_theme_font_size_override("font_size", 28)
	progress.add_theme_color_override("font_color", Color(1, 1, 1, 0.8))
	add_child(progress)

	var home_btn := Button.new()
	home_btn.text = "回主页"
	home_btn.add_theme_font_size_override("font_size", 22)
	home_btn.position = Vector2(1130, 12)
	home_btn.size = Vector2(120, 48)
	home_btn.pressed.connect(func() -> void:
		get_tree().change_scene_to_file("res://scenes/home.tscn"))
	add_child(home_btn)


func _spawn_fish() -> void:
	var choices := pool.duplicate()
	# 保证目标字符都有鱼
	for t in targets:
		if not choices.has(t):
			choices.append(str(t))
	choices.shuffle()

	for i in fish_count:
		var letter := str(choices[i % choices.size()])
		var fish := _make_fish(letter)
		fish.position = Vector2(
			randf_range(POND.position.x, POND.end.x - fish.size.x),
			randf_range(POND.position.y, POND.end.y - fish.size.y))
		var ang := randf_range(0.0, TAU)
		fish.set_meta("vel", Vector2(cos(ang), sin(ang)) * speed * randf_range(0.7, 1.3))
		fish.gui_input.connect(_on_fish_input.bind(fish))
		add_child(fish)
		fishes.append(fish)


func _make_fish(letter: String) -> Panel:
	var p := Panel.new()
	p.size = Vector2(150, 110)
	var style := StyleBoxFlat.new()
	style.bg_color = FISH_COLORS[randi() % FISH_COLORS.size()]
	style.corner_radius_top_left = 55
	style.corner_radius_bottom_left = 55
	style.corner_radius_top_right = 26
	style.corner_radius_bottom_right = 26
	p.add_theme_stylebox_override("panel", style)
	p.mouse_filter = Control.MOUSE_FILTER_STOP

	var tail := Polygon2D.new()
	tail.polygon = PackedVector2Array([
		Vector2(0, 0), Vector2(0, 110), Vector2(-46, 55),
	])
	tail.color = style.bg_color.darkened(0.15)
	tail.position = Vector2(p.size.x - 4, 0)
	p.add_child(tail)

	var lb := Label.new()
	lb.text = letter
	lb.add_theme_font_size_override("font_size", 64)
	lb.add_theme_color_override("font_color", Color.WHITE)
	lb.set_anchors_preset(Control.PRESET_FULL_RECT)
	lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lb.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(lb)
	p.set_meta("letter", letter)
	return p


func _next_target() -> void:
	if t_index >= ROUND_TARGETS:
		_finish()
		return
	current = targets[t_index]
	attempts = 0
	progress.text = "第 %d / %d 个" % [t_index + 1, ROUND_TARGETS]
	var heard := PinyinData.play_syllable(current)
	if heard:
		prompt.text = "听一听，钓哪条鱼？"
	else:
		prompt.text = "钓「%s」" % current


func _on_fish_input(event: InputEvent, fish: Panel) -> void:
	if busy or not (event is InputEventMouseButton):
		return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT:
		return
	if str(fish.get_meta("letter")) == current:
		_catch(fish)
	else:
		_miss(fish)


func _catch(fish: Panel) -> void:
	busy = true
	Sfx.good()
	if attempts == 0:
		first_try += 1
	var tw := create_tween()
	tw.tween_property(fish, "scale", Vector2(1.3, 1.3), 0.18)
	tw.parallel().tween_property(fish, "modulate:a", 0.0, 0.3)
	tw.tween_callback(fish.queue_free)
	tw.tween_callback(_advance)


func _miss(fish: Panel) -> void:
	attempts += 1
	Sfx.bad()
	var origin := fish.position
	var tw := create_tween()
	tw.tween_property(fish, "position:x", origin.x + 26, 0.06)
	tw.tween_property(fish, "position:x", origin.x - 26, 0.06)
	tw.tween_property(fish, "position:x", origin.x, 0.06)


func _advance() -> void:
	t_index += 1
	busy = false
	_next_target()


func _process(delta: float) -> void:
	if result_layer != null:
		return
	for f in fishes:
		if not is_instance_valid(f) or f.is_queued_for_deletion():
			continue
		var vel: Vector2 = f.get_meta("vel")
		f.position += vel * delta
		var flip := false
		if f.position.x < POND.position.x:
			f.position.x = POND.position.x
			vel.x = absf(vel.x)
			flip = true
		elif f.position.x > POND.end.x - f.size.x:
			f.position.x = POND.end.x - f.size.x
			vel.x = -absf(vel.x)
			flip = true
		if f.position.y < POND.position.y:
			f.position.y = POND.position.y
			vel.y = absf(vel.y)
			flip = true
		elif f.position.y > POND.end.y - f.size.y:
			f.position.y = POND.end.y - f.size.y
			vel.y = -absf(vel.y)
			flip = true
		if flip:
			f.set_meta("vel", vel)
			_face_direction(f, vel.x)


func _face_direction(fish: Panel, vx: float) -> void:
	# 头朝移动方向：尾巴在左侧=头朝右
	var tail := fish.get_child(0) as Polygon2D
	if tail == null:
		return
	var moving_right := vx > 0.0
	if moving_right:
		tail.position.x = fish.size.x - 4
		tail.scale = Vector2.ONE
	else:
		tail.position.x = 4.0
		tail.scale = Vector2(-1.0, 1.0)


func _finish() -> void:
	Sfx.win()
	var score := roundf(float(first_try) / ROUND_TARGETS * 100.0)
	var stars := Db.finish("fishing", score, {"mode": "audio" if PinyinData.has_audio("a") else "text"})

	result_layer = Control.new()
	result_layer.z_index = 50
	add_child(result_layer)
	result_layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.6)
	result_layer.add_child(dim)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var vc := CenterContainer.new()
	result_layer.add_child(vc)
	vc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", 24)
	vc.add_child(vb)

	var star_label := Label.new()
	star_label.text = "★".repeat(stars) + "☆".repeat(3 - stars)
	star_label.add_theme_font_size_override("font_size", 96)
	star_label.add_theme_color_override("font_color", Color("f7d794"))
	star_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(star_label)

	var score_label := Label.new()
	score_label.text = "第一次就对：%d / %d    得分 %d" % [first_try, ROUND_TARGETS, int(score)]
	score_label.add_theme_font_size_override("font_size", 34)
	score_label.add_theme_color_override("font_color", Color.WHITE)
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(score_label)

	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_theme_constant_override("separation", 30)
	vb.add_child(hb)

	var again := Button.new()
	again.text = "再玩一次"
	again.add_theme_font_size_override("font_size", 32)
	again.custom_minimum_size = Vector2(220, 70)
	again.pressed.connect(func() -> void:
		get_tree().reload_current_scene())
	hb.add_child(again)

	var back := Button.new()
	back.text = "回主页"
	back.add_theme_font_size_override("font_size", 32)
	back.custom_minimum_size = Vector2(220, 70)
	back.pressed.connect(func() -> void:
		get_tree().change_scene_to_file("res://scenes/home.tscn"))
	hb.add_child(back)
