extends Control
## 发音层 headless 回归：映射完整性 / 音频覆盖 / 归一化 / 播放与停止 / TTS 兜底文本
## 运行：godot --headless --path . res://tests/test_speech.tscn --quit-after 600

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
	var speech := PinyinData.speech
	var table := PinyinData.table
	var letters: Dictionary = speech.get("letters", {})
	var syllables: Dictionary = speech.get("syllables", {})

	# ===== 数据表 =====
	_check("speech.json 已加载", not speech.is_empty() and letters.size() == 47 and syllables.size() == 28,
		"%d 字母 / %d 音节" % [letters.size(), syllables.size()])
	_check("pinyin.json 已加载", not table.is_empty())

	var stage_letters: Array = []
	for st in table.get("stages", []):
		stage_letters.append_array(st.get("letters", []))
	var missing_letters: Array = []
	for k in stage_letters:
		if not letters.has(str(k)):
			missing_letters.append(str(k))
	_check("所有阶段字母都有读音", missing_letters.is_empty(), str(stage_letters.size()) + " 个")

	var missing_parts: Array = []
	var missing_syl: Array = []
	for e in table.get("syllables", []):
		var syl := str(e.get("syl", ""))
		if not syllables.has(syl):
			missing_syl.append(syl)
		for part in [str(e.get("s", "")), str(e.get("y", ""))]:
			if not letters.has(part):
				missing_parts.append(part + "@" + syl)
	_check("28 条音节都有读音", missing_syl.is_empty(), str(missing_syl))
	_check("每条音节的声母/韵母都有读音", missing_parts.is_empty(), str(missing_parts))

	# ===== 每个读音都能出声（真人录音 或 TTS 汉字） =====
	var no_audio: Array = []
	var no_say: Array = []
	for k in PinyinData.all_speech_keys():
		if not PinyinData.has_audio(k):
			no_audio.append(k)
		if PinyinData.say_text(k) == "":
			no_say.append(k)
	_check("真人录音覆盖全部读音", no_audio.is_empty(), "缺 %d 个 %s" % [no_audio.size(), str(no_audio.slice(0, 8))])
	# fo/te/ne/ri/er 的第一声音节在普通话里不成词，没有对应汉字可让 TTS 读；
	# 这些条目依赖真人录音，缺录音时走「无声 + 显示大字」兜底，不算缺陷。
	var NO_SAY_OK := ["f", "t", "n", "r", "er"]
	var bad_no_say: Array = []
	for k in no_say:
		if not NO_SAY_OK.has(k):
			bad_no_say.append(k)
	_check("无 TTS 汉字的条目仅限不成词音节", bad_no_say.is_empty(), str(bad_no_say))
	var cant: Array = []
	for k in PinyinData.all_speech_keys():
		if not PinyinData.can_speak(k):
			cant.append(k)
	_check("can_speak 全通过", cant.is_empty(), str(PinyinData.all_speech_keys().size()) + " 个")

	# ===== 文件名归一化（纯函数） =====
	_check("ü → v", PinyinData.audio_key("ü") == "v" and PinyinData.audio_key("üe") == "ve")
	_check("普通字母不变", PinyinData.audio_key("zh") == "zh" and PinyinData.audio_key("ba") == "ba")
	_check("音频路径拼接", PinyinData.audio_path("ü") == "res://audio/pinyin/v.mp3")

	# ===== 实际播放 / 防叠音 / 停止 =====
	var ok_b := PinyinData.play_syllable("b")
	_check("播放声母 b", ok_b and PinyinData.last_played == "b")
	await get_tree().process_frame
	_check("播放状态已进入", PinyinData.is_speaking())

	var ok_a := PinyinData.play_syllable("a")
	_check("连播会切到新音而不叠音", ok_a and PinyinData.last_played == "a")
	var ok_syl := PinyinData.play_syllable("ba")
	_check("播放两拼音节 ba", ok_syl and PinyinData.last_played == "ba")

	PinyinData.stop_speech()
	_check("停止朗读后不再播放", not PinyinData.is_speaking())
	_check("空串不发音", not PinyinData.play_syllable(""))
	_check("未收录的串不误报有声", not PinyinData.can_speak("zzzz"))

	# ===== 中文 TTS 兜底文本样例 =====
	_check("声母 b 读「玻」", PinyinData.say_text("b") == "玻")
	_check("韵母 a 读「啊」", PinyinData.say_text("a") == "啊")
	_check("音节 ba 读「爸」", PinyinData.say_text("ba") == "爸")

	# ===== 声调：呼读音一律第一声 =====
	# 教学标准：声母/韵母的呼读音是该音节的第一声（阴平）。
	# 「鹅/佛/日/熬/儿/昂」都是韵母表里的代表字，声调属于音节，
	# 声母韵母本身不标调；教学时统一读第一声，录音与 TTS 都必须对齐。
	var tone_bad: Array = []
	var speech_map: Dictionary = PinyinData.speech
	for group in ["letters"]:
		var g: Variant = speech_map.get(group, {})
		if g is Dictionary:
			for k in g.keys():
				var item: Variant = g[k]
				if item is Dictionary:
					var cmn := str(item.get("cmn", ""))
					if not cmn.ends_with("1"):
						tone_bad.append("%s=%s" % [k, cmn])
	_check("47 条字母呼读音全为第一声", tone_bad.is_empty(), str(tone_bad))
	_check("单韵母 e 用一声录音", str(speech_map["letters"]["e"]["cmn"]) == "e1")
	_check("声母 f 用一声录音", str(speech_map["letters"]["f"]["cmn"]) == "fo1")
	_check("声母 r 用一声录音", str(speech_map["letters"]["r"]["cmn"]) == "ri1")
	_check("韵母 ao 用一声录音", str(speech_map["letters"]["ao"]["cmn"]) == "ao1")
	_check("韵母 er 用一声录音", str(speech_map["letters"]["er"]["cmn"]) == "er1")
	_check("韵母 ang 用一声录音", str(speech_map["letters"]["ang"]["cmn"]) == "ang1")
