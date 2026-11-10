extends Control
## 主页：游戏入口 + 等级显示 + 护眼休息页

const FISHING_SCENE := "res://games/fishing/fishing.tscn"
const FRIENDS_SCENE := "res://games/friends/friends.tscn"

var rest_overlay: Control


func _ready() -> void:
	# 回到主页统一掐掉上一段朗读，避免切场景后还拖着尾音
	PinyinData.stop_speech()
	Guard.need_rest.connect(_on_need_rest)
	_build()


func _build() -> void:
	for c in get_children():
		c.queue_free()

	var bg := ColorRect.new()
	bg.color = Color("2c3e50")
	add_child(bg)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var cc := CenterContainer.new()
	add_child(cc)
	cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var center := VBoxContainer.new()
	center.add_theme_constant_override("separation", 28)
	center.alignment = BoxContainer.ALIGNMENT_CENTER
	cc.add_child(center)

	var title := Label.new()
	title.text = "拼音小游戏"
	title.add_theme_font_size_override("font_size", 72)
	title.add_theme_color_override("font_color", Color("f7d794"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(title)

	var sub := Label.new()
	sub.text = "和字母宝宝一起玩"
	sub.add_theme_font_size_override("font_size", 28)
	sub.add_theme_color_override("font_color", Color("a4b0be"))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	center.add_child(sub)

	center.add_child(_spacer(20))
	center.add_child(_game_button("拼音钓鱼", "fishing", FISHING_SCENE, true))
	center.add_child(_game_button("找朋友（两拼拼读）", "friends", FRIENDS_SCENE, true))
	center.add_child(_game_button("摘果子（四声测评）", "fruit", "", false))

	center.add_child(_spacer(30))

	var report_btn := Button.new()
	report_btn.text = "家长看板"
	report_btn.add_theme_font_size_override("font_size", 24)
	report_btn.custom_minimum_size = Vector2(220, 56)
	report_btn.pressed.connect(_show_report)
	var wrap := CenterContainer.new()
	wrap.add_child(report_btn)
	center.add_child(wrap)


func _spacer(h: int) -> Control:
	var s := Control.new()
	s.custom_minimum_size = Vector2(0, h)
	return s


func _game_button(text: String, id: String, scene: String, enabled: bool) -> Button:
	var lv := Db.lvl(id)
	var b := Button.new()
	if enabled:
		b.text = "%s    Lv.%d" % [text, lv]
	else:
		b.text = "%s    （即将解锁）" % text
	b.add_theme_font_size_override("font_size", 36)
	b.custom_minimum_size = Vector2(560, 88)
	b.disabled = not enabled
	if enabled:
		b.pressed.connect(func() -> void:
			get_tree().change_scene_to_file(scene))
	return b


func _show_report() -> void:
	var dlg := AcceptDialog.new()
	dlg.title = "家长看板"
	dlg.size = Vector2(560, 460)
	var lines := ["最近 8 局表现：", ""]
	for g in ["fishing", "friends", "fruit"]:
		var hist := Db.history(g)
		if hist.is_empty():
			continue
		var scores := []
		for s in hist:
			scores.append(int(s.get("score", 0)))
		var avg := 0.0
		for v in scores:
			avg += v
		avg /= scores.size()
		lines.append("%s：Lv.%d，%d 局，平均分 %d" % [g, Db.lvl(g), hist.size(), int(avg)])
		lines.append("  得分序列：%s" % str(scores))
	if lines.size() == 2:
		lines.append("还没有记录，先玩一局吧")
	var label := Label.new()
	label.text = "\n".join(lines)
	label.add_theme_font_size_override("font_size", 22)
	dlg.add_child(label)
	add_child(dlg)
	dlg.popup_centered()


func _on_need_rest() -> void:
	rest_overlay = ColorRect.new()
	rest_overlay.color = Color(0.05, 0.08, 0.12, 0.96)
	rest_overlay.z_index = 100
	add_child(rest_overlay)
	rest_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var rc := CenterContainer.new()
	rest_overlay.add_child(rc)
	rc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", 16)
	rc.add_child(vb)

	var t1 := Label.new()
	t1.text = "小眼睛，休息一下"
	t1.add_theme_font_size_override("font_size", 56)
	t1.add_theme_color_override("font_color", Color.WHITE)
	t1.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(t1)

	var countdown := Label.new()
	countdown.text = "20"
	countdown.add_theme_font_size_override("font_size", 96)
	countdown.add_theme_color_override("font_color", Color("f7d794"))
	countdown.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(countdown)

	var left := 20
	var timer := Timer.new()
	timer.wait_time = 1.0
	rest_overlay.add_child(timer)
	timer.timeout.connect(func() -> void:
		left -= 1
		countdown.text = str(left)
		if left <= 0:
			Guard.finish_rest()
			rest_overlay.queue_free())
	timer.start()
