extends Control
class_name FriendsGame
## B 找朋友：两拼拼读（声母 + 韵母 → 音节）
## 交互双通道：点一下声母再点韵母，或直接把声母卡拖到韵母卡上（Godot 原生拖放）。
## 无真人音频时自动回退「看字拼读」大字报模式；b—a—ba 三段拼读节奏全程有视觉反馈。
## 配对判定与回合生成抽成静态纯函数，便于 headless 回归测试。

const ROUND_TARGETS := 6
const CARD_SIZE := Vector2(200, 100)
const SHENG_TIERS := [
	["b", "m", "d", "t", "g", "h", "k"],
	["j", "q", "x", "p", "l", "y", "w", "n"],
	["zh", "ch", "sh", "f"],
]

class ShengCard extends Panel:
	var letter: String = ""

	func _get_drag_data(_at: Vector2) -> Variant:
		var lb := Label.new()
		lb.text = letter
		lb.add_theme_font_size_override("font_size", 56)
		lb.size = Vector2(120, 84)
		set_drag_preview(lb)
		# 与 FriendsGame.drag_payload() 保持同一格式（内部类无法访问外部静态函数）
		return {"kind": "sheng", "letter": letter}


class YunCard extends Panel:
	signal paired(sheng: String, yun: String)
	var letter: String = ""

	func _can_drop_data(_at: Vector2, data: Variant) -> bool:
		return data is Dictionary and str(data.get("kind", "")) == "sheng"

	func _drop_data(_at: Vector2, data: Variant) -> void:
		paired.emit(str(data.get("letter", "")), letter)


var all_entries: Array = []
var targets: Array = []
var t_index := 0
var first_try := 0
var attempts := 0
var busy := false
var selected_sheng := ""
var current: Dictionary = {}
var lv := 1
var blend_step := 0.46
var reward_hold := 0.85

var prompt: Label
var progress: Label
var target_label: Label
var blend_label: Label
var reward_label: Label
var reward_panel: Panel
var sheng_box: VBoxContainer
var yun_box: VBoxContainer
var result_layer: Control


# ---------------- 纯逻辑（可离线验证） ----------------

## 等级每 3 级解锁一批声母：Lv.1-3 / 4-6 / 7-10
static func tier_sheng(level: int) -> Array:
	var out: Array = []
	var tiers := clampi(int(ceili(float(level) / 3.0)), 1, 3)
	for i in tiers:
		out.append_array(SHENG_TIERS[i])
	return out


static func available(level: int, all: Array) -> Array:
	var unlocked := tier_sheng(level)
	var out: Array = []
	for e in all:
		if unlocked.has(str(e.get("s", ""))):
			out.append(e)
	return out


static func all_yun(all: Array) -> Array:
	var out: Array = []
	for e in all:
		var y := str(e.get("y", ""))
		if y != "" and not out.has(y):
			out.append(y)
	return out


## 高等级优先用形近字母当干扰，数量不足再随机补齐
static func distractors(target: String, count: int, pool: Array, sim: Dictionary, hard: bool) -> Array:
	var out: Array = []
	if hard:
		for s in sim.get(target, []):
			var v := str(s)
			if pool.has(v) and v != target and not out.has(v):
				out.append(v)
	var rest: Array = []
	for v in pool:
		if str(v) != target and not out.has(str(v)):
			rest.append(str(v))
	rest.shuffle()
	for v in rest:
		if out.size() >= count:
			break
		out.append(v)
	return out.slice(0, count)


## 生成一回合的卡片：目标声母/韵母必在卡里，干扰项数量随等级上升
static func make_round(entry: Dictionary, level: int, all: Array, sim: Dictionary) -> Dictionary:
	var s := str(entry.get("s", ""))
	var y := str(entry.get("y", ""))
	var n_sheng := clampi(1 + int(floor(float(level - 1) / 2.0)), 1, 4)
	var n_yun := clampi(2 + int(floor(float(level - 1) / 2.0)), 2, 4)
	var hard := level >= 6
	var s_pool: Array = []
	for x in tier_sheng(level):
		if str(x) != s:
			s_pool.append(str(x))
	var shengs: Array = [s] + distractors(s, n_sheng - 1, s_pool, sim, hard)
	var yuns: Array = [y] + distractors(y, n_yun - 1, all_yun(all), sim, hard)
	shengs.shuffle()
	yuns.shuffle()
	return {"shengs": shengs, "yuns": yuns}


static func is_correct(entry: Dictionary, s: String, y: String) -> bool:
	return str(entry.get("s", "")) == s and str(entry.get("y", "")) == y


## 拖拽载荷（纯函数，便于离线验证）
static func drag_payload(letter: String) -> Dictionary:
	return {"kind": "sheng", "letter": letter}


static func score_of(first: int, total: int) -> float:
	if total <= 0:
		return 0.0
	return roundf(float(first) / float(total) * 100.0)


# ---------------- 生命周期 ----------------

func _ready() -> void:
	_start()


func _start() -> void:
	lv = Db.lvl("friends")
	all_entries = PinyinData.table.get("syllables", [])
	if all_entries.is_empty():
		all_entries = [{"s": "b", "y": "a", "syl": "ba", "tone": "bà", "word": "爸爸"}]
	var usable := available(lv, all_entries)
	if usable.is_empty():
		usable = available(10, all_entries)
	targets = []
	for i in ROUND_TARGETS:
		targets.append(usable.pick_random())
	t_index = 0
	first_try = 0
	_build_background()
	_next_round()


func _build_background() -> void:
	var bg := ColorRect.new()
	bg.color = Color("fff3e0")
	add_child(bg)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	progress = Label.new()
	progress.name = "Progress"
	progress.position = Vector2(24, 14)
	progress.size = Vector2(320, 40)
	progress.add_theme_font_size_override("font_size", 26)
	progress.add_theme_color_override("font_color", Color("7a5b3a"))
	add_child(progress)

	var home_btn := Button.new()
	home_btn.text = "回主页"
	home_btn.add_theme_font_size_override("font_size", 22)
	home_btn.position = Vector2(1120, 12)
	home_btn.size = Vector2(130, 48)
	home_btn.pressed.connect(func() -> void:
		get_tree().change_scene_to_file("res://scenes/home.tscn"))
	add_child(home_btn)

	prompt = Label.new()
	prompt.name = "Prompt"
	prompt.position = Vector2(0, 56)
	prompt.size = Vector2(1280, 54)
	prompt.add_theme_font_size_override("font_size", 36)
	prompt.add_theme_color_override("font_color", Color("8a5a2b"))
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(prompt)

	target_label = Label.new()
	target_label.name = "TargetLabel"
	target_label.position = Vector2(390, 112)
	target_label.size = Vector2(500, 112)
	target_label.add_theme_font_size_override("font_size", 78)
	target_label.add_theme_color_override("font_color", Color("e8563f"))
	target_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	target_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(target_label)

	var replay := Button.new()
	replay.text = "再听一次"
	replay.add_theme_font_size_override("font_size", 24)
	replay.position = Vector2(540, 226)
	replay.size = Vector2(200, 46)
	replay.pressed.connect(func() -> void:
		PinyinData.play_syllable(str(current.get("syl", ""))))
	add_child(replay)

	sheng_box = VBoxContainer.new()
	sheng_box.name = "ShengBox"
	sheng_box.position = Vector2(150, 272)
	sheng_box.add_theme_constant_override("separation", 10)
	add_child(sheng_box)

	yun_box = VBoxContainer.new()
	yun_box.name = "YunBox"
	yun_box.position = Vector2(930, 272)
	yun_box.add_theme_constant_override("separation", 10)
	add_child(yun_box)

	var left_tag := Label.new()
	left_tag.text = "声母"
	left_tag.position = Vector2(150, 232)
	left_tag.size = Vector2(200, 38)
	left_tag.add_theme_font_size_override("font_size", 28)
	left_tag.add_theme_color_override("font_color", Color("c96a2a"))
	left_tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(left_tag)

	var right_tag := Label.new()
	right_tag.text = "韵母"
	right_tag.position = Vector2(930, 232)
	right_tag.size = Vector2(200, 38)
	right_tag.add_theme_font_size_override("font_size", 28)
	right_tag.add_theme_color_override("font_color", Color("2a7fa8"))
	right_tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(right_tag)

	blend_label = Label.new()
	blend_label.name = "BlendLabel"
	blend_label.position = Vector2(390, 350)
	blend_label.size = Vector2(500, 150)
	blend_label.add_theme_font_size_override("font_size", 78)
	blend_label.add_theme_color_override("font_color", Color("5b7a99"))
	blend_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	blend_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(blend_label)

	_build_reward()


func _build_reward() -> void:
	reward_panel = Panel.new()
	reward_panel.name = "Reward"
	reward_panel.position = Vector2(390, 300)
	reward_panel.size = Vector2(500, 280)
	reward_panel.visible = false
	var style := StyleBoxFlat.new()
	style.bg_color = Color("fff8dc")
	style.border_color = Color("ffb703")
	style.set_border_width_all(6)
	style.set_corner_radius_all(28)
	reward_panel.add_theme_stylebox_override("panel", style)
	add_child(reward_panel)

	reward_label = Label.new()
	reward_label.name = "RewardLabel"
	reward_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	reward_label.add_theme_font_size_override("font_size", 52)
	reward_label.add_theme_color_override("font_color", Color("b8560f"))
	reward_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	reward_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	reward_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	reward_panel.add_child(reward_label)


# ---------------- 回合 ----------------

func _next_round() -> void:
	if t_index >= ROUND_TARGETS:
		_finish()
		return
	current = targets[t_index]
	attempts = 0
	selected_sheng = ""
	busy = false
	_clear_cards()
	reward_panel.visible = false
	progress.text = "第 %d / %d 个" % [t_index + 1, ROUND_TARGETS]
	var heard := PinyinData.play_syllable(str(current.get("syl", "")))
	prompt.text = "听一听，把声母和韵母拼在一起" if heard else "拼一拼，把两张卡片凑成这个音"
	target_label.text = str(current.get("syl", ""))
	blend_label.text = "?"
	_spawn_cards()


func _clear_cards() -> void:
	# 先从容器移出再延迟释放：否则旧卡会在同一帧里和新卡一起参与排版
	for box in [sheng_box, yun_box]:
		for c in box.get_children():
			box.remove_child(c)
			c.queue_free()


func _spawn_cards() -> void:
	var r := make_round(current, lv, all_entries, PinyinData.table.get("similar", {}))
	for s in r["shengs"]:
		var c := ShengCard.new()
		c.letter = str(s)
		_style_card(c, str(s), Color("ffab6f"))
		c.gui_input.connect(_on_sheng_input.bind(c))
		sheng_box.add_child(c)
	for y in r["yuns"]:
		var c := YunCard.new()
		c.letter = str(y)
		_style_card(c, str(y), Color("82cdf0"))
		c.paired.connect(_on_pair)
		c.gui_input.connect(_on_yun_input.bind(c))
		yun_box.add_child(c)


func _style_card(c: Panel, letter: String, color: Color) -> void:
	c.custom_minimum_size = CARD_SIZE
	c.size = CARD_SIZE
	c.mouse_filter = Control.MOUSE_FILTER_STOP
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(22)
	c.add_theme_stylebox_override("panel", style)
	var lb := Label.new()
	lb.text = letter
	lb.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	lb.add_theme_font_size_override("font_size", 58)
	lb.add_theme_color_override("font_color", Color.WHITE)
	lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lb.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.add_child(lb)
	c.set_meta("letter", letter)


func _on_sheng_input(event: InputEvent, card: ShengCard) -> void:
	if busy or not (event is InputEventMouseButton):
		return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT:
		return
	selected_sheng = card.letter
	_refresh_selection()


func _on_yun_input(event: InputEvent, card: YunCard) -> void:
	if busy or not (event is InputEventMouseButton):
		return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT:
		return
	if selected_sheng == "":
		_nudge(card, "先点左边的声母哦")
		return
	_submit(selected_sheng, card.letter)


func _on_pair(s: String, y: String) -> void:
	_submit(s, y)


func _refresh_selection() -> void:
	for c in sheng_box.get_children():
		var on: bool = c is ShengCard and (c as ShengCard).letter == selected_sheng
		c.modulate = Color("fff2b2") if on else Color.WHITE
		c.scale = Vector2(1.06, 1.06) if on else Vector2.ONE


func _submit(s: String, y: String) -> void:
	if busy:
		return
	if is_correct(current, s, y):
		if attempts == 0:
			first_try += 1
		_play_blend(s, y)
	else:
		attempts += 1
		Sfx.bad()
		_nudge(_find_yun_card(y), "再试一次，听听哪个才对～")


func _find_yun_card(letter: String) -> Control:
	for c in yun_box.get_children():
		if c is YunCard and (c as YunCard).letter == letter:
			return c
	return null


func _nudge(card: Control, msg: String) -> void:
	prompt.text = msg
	if card == null:
		return
	# 卡片在 VBoxContainer 里，position 会被容器重排覆盖；用缩放做轻微抖动
	var tw := create_tween()
	tw.tween_property(card, "scale", Vector2(0.9, 0.9), 0.09)
	tw.tween_property(card, "scale", Vector2.ONE, 0.09)
	tw.tween_callback(_refresh_selection)


func _pulse() -> void:
	var tw := create_tween()
	tw.tween_property(blend_label, "scale", Vector2(1.18, 1.18), 0.12)
	tw.tween_property(blend_label, "scale", Vector2.ONE, 0.12)


## 核心体验：b → b-a → ba 三段节奏，声音不可用时大字报照样完整
func _play_blend(s: String, y: String) -> void:
	busy = true
	selected_sheng = ""
	_refresh_selection()
	var syl := str(current.get("syl", ""))

	PinyinData.play_syllable(s)
	Sfx.step(0)
	blend_label.text = s
	_pulse()
	await get_tree().create_timer(blend_step).timeout
	if not is_inside_tree():
		return

	PinyinData.play_syllable(y)
	Sfx.step(1)
	blend_label.text = "%s — %s" % [s, y]
	_pulse()
	await get_tree().create_timer(blend_step).timeout
	if not is_inside_tree():
		return

	PinyinData.play_syllable(syl)
	Sfx.step(2)
	blend_label.text = syl
	_pulse()
	_show_reward()
	await get_tree().create_timer(reward_hold).timeout
	if not is_inside_tree():
		return

	reward_panel.visible = false
	t_index += 1
	busy = false
	_next_round()


func _show_reward() -> void:
	reward_label.text = "★  %s\n%s" % [str(current.get("tone", "")), str(current.get("word", ""))]
	reward_panel.visible = true
	Sfx.good()


# ---------------- 结算 ----------------

func _finish() -> void:
	Sfx.win()
	var score := score_of(first_try, ROUND_TARGETS)
	var mode := "audio" if PinyinData.has_audio("a") else "text"
	var stars := Db.finish("friends", score, {"mode": mode, "lv": lv})

	result_layer = Control.new()
	result_layer.name = "ResultLayer"
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
