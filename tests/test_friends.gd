extends Control
## B 找朋友 headless 回归：纯逻辑 + 场景实例化 + 完整一局
## 运行：godot --headless --path . res://tests/test_friends.tscn

const FriendsScript = preload("res://games/friends/friends.gd")
const SCENE := "res://games/friends/friends.tscn"

var failed := 0


func _ready() -> void:
	await _run()
	print("=== %s ===" % ("ALL PASS" if failed == 0 else "%d FAILURES" % failed))
	get_tree().quit(1 if failed > 0 else 0)


func _check(name: String, ok: bool, extra: String = "") -> void:
	if ok:
		print("PASS ", name, (" → " + extra) if extra != "" else "")
	else:
		failed += 1
		print("FAIL ", name, (" → " + extra) if extra != "" else "")


func _run() -> void:
	await get_tree().process_frame
	var all: Array = PinyinData.table.get("syllables", [])
	var sim: Dictionary = PinyinData.table.get("similar", {})

	# ===== 数据表 =====
	_check("音节表 28 条", all.size() == 28, str(all.size()))
	var consistent := true
	for e in all:
		var s := str(e.get("s", ""))
		var y := str(e.get("y", ""))
		if str(e.get("syl", "")) != s + y or str(e.get("word", "")) == "" or str(e.get("tone", "")) == "":
			consistent = false
	_check("每条 syl = 声母+韵母 且词/声调齐全", consistent)
	var yun_unique := FriendsScript.all_yun(all)
	_check("韵母池 5 个", yun_unique.size() == 5, str(yun_unique))

	# ===== 等级解锁 =====
	var t1 := FriendsScript.tier_sheng(1)
	var t10 := FriendsScript.tier_sheng(10)
	_check("Lv.1 只解锁第一批", t1.has("b") and t1.has("m") and not t1.has("zh"), str(t1))
	_check("Lv.10 解锁全部三批", t10.has("zh") and t10.has("j") and t10.has("b"), str(t10.size()))
	_check("Lv.1 可用音节非空", FriendsScript.available(1, all).size() > 0,
		str(FriendsScript.available(1, all).size()))
	_check("Lv.10 覆盖全部 28 条", FriendsScript.available(10, all).size() == all.size(),
		str(FriendsScript.available(10, all).size()))

	# ===== 回合生成 =====
	var expected := {1: [1, 2], 3: [2, 3], 5: [3, 4], 7: [4, 4], 10: [4, 4]}
	for lv in expected.keys():
		var r := FriendsScript.make_round(all[0], lv, all, sim)
		var want: Array = expected[lv]
		var sh: Array = r["shengs"]
		var yu: Array = r["yuns"]
		var no_dup := true
		for group in [sh, yu]:
			var seen := {}
			for v in group:
				if seen.has(v):
					no_dup = false
				seen[v] = true
		_check("Lv.%d 卡片数量 %d/%d" % [lv, want[0], want[1]],
			sh.size() == want[0] and yu.size() == want[1], "%d/%d" % [sh.size(), yu.size()])
		_check("Lv.%d 目标必在卡里" % lv, sh.has("b") and yu.has("a"))
		_check("Lv.%d 干扰项无重复" % lv, no_dup)

	# ===== 判定与计分 =====
	_check("正确配对", FriendsScript.is_correct(all[0], "b", "a"))
	_check("错误配对被拒", not FriendsScript.is_correct(all[0], "b", "e")
		and not FriendsScript.is_correct(all[0], "m", "a"))
	_check("满分 100", FriendsScript.score_of(6, 6) == 100.0)
	_check("半对 50", FriendsScript.score_of(3, 6) == 50.0)
	_check("零分与除零保护", FriendsScript.score_of(0, 6) == 0.0
		and FriendsScript.score_of(0, 0) == 0.0)

	# ===== 场景实例化 + 拖拽载荷 + 点选通道 =====
	var packed1: PackedScene = load(SCENE)
	var g: Control = packed1.instantiate()
	add_child(g)
	await get_tree().process_frame
	g.blend_step = 0.01
	g.reward_hold = 0.01
	_check("场景构建出声母/韵母卡", g.sheng_box.get_child_count() > 0 and g.yun_box.get_child_count() > 0,
		"%d/%d" % [g.sheng_box.get_child_count(), g.yun_box.get_child_count()])
	_check("目标音节已显示", g.target_label.text == str(g.current.get("syl", "")), g.target_label.text)

	var yc = g.yun_box.get_child(0)
	var payload: Dictionary = FriendsScript.drag_payload("b")
	_check("拖拽载荷格式正确", str(payload.get("kind", "")) == "sheng"
		and str(payload.get("letter", "")) == "b", str(payload))
	_check("韵母卡接受声母拖拽", yc._can_drop_data(Vector2.ZERO, payload))
	_check("韵母卡拒绝非声母拖拽", not yc._can_drop_data(Vector2.ZERO, {"kind": "yun"}))
	var sc = g.sheng_box.get_child(0)

	var want_s := str(g.current.get("s", ""))
	var want_y := str(g.current.get("y", ""))
	var s_card = null
	var y_card = null
	for c in g.sheng_box.get_children():
		if c.letter == want_s:
			s_card = c
	for c in g.yun_box.get_children():
		if c.letter == want_y:
			y_card = c
	_check("目标两张卡都在界面上", s_card != null and y_card != null)

	var ev := InputEventMouseButton.new()
	ev.pressed = true
	ev.button_index = MOUSE_BUTTON_LEFT
	g._on_sheng_input(ev, s_card)
	_check("点选声母高亮选中", g.selected_sheng == want_s, g.selected_sheng)
	g._on_yun_input(ev, y_card)
	_check("点选韵母触发拼读", g.busy == true and g.first_try == 1)
	_check("拼读三段第一步显示声母", g.blend_label.text == want_s, g.blend_label.text)

	# ===== 错答不惩罚 =====
	var packed2: PackedScene = load(SCENE)
	var g2: Control = packed2.instantiate()
	add_child(g2)
	await get_tree().process_frame
	g2._submit("__wrong__", "__wrong__")
	_check("错答只重试、不扣分不锁死", g2.attempts == 1 and g2.first_try == 0 and not g2.busy)

	# ===== 完整一局：6 题全首次答对 → 100 分 / 3 星 / 自动升级 =====
	var backup := Db.data.duplicate(true)
	Db.data = {"sessions": [], "levels": {}}
	var packed3: PackedScene = load(SCENE)
	var g3: Control = packed3.instantiate()
	add_child(g3)
	await get_tree().process_frame
	g3.blend_step = 0.01
	g3.reward_hold = 0.01
	for i in 6:
		g3._submit(str(g3.current.get("s", "")), str(g3.current.get("y", "")))
		var guard := 0
		while g3.t_index == i and guard < 300:
			await get_tree().process_frame
			guard += 1
		_check("第 %d 题推进" % (i + 1), g3.t_index == i + 1, "t_index=%d" % g3.t_index)
	_check("一局结束出现结算层", g3.result_layer != null)
	var hist := Db.history("friends")
	_check("写入 1 条存档", hist.size() == 1, str(hist.size()))
	if hist.size() > 0:
		_check("满分 100 与 3 星", float(hist[0].get("score", 0)) == 100.0
			and int(hist[0].get("stars", 0)) == 3)
	_check("3 星自动升到 Lv.2", Db.lvl("friends") == 2, str(Db.lvl("friends")))
	Db.data = backup
	Db.save()
	_check("测试后存档已还原", Db.data["sessions"].size() == backup["sessions"].size(),
		"%d/%d" % [Db.data["sessions"].size(), backup["sessions"].size()])
