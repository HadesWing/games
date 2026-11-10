extends Node
## 拼音数据表加载 + 发音播放
## 发音优先级：res://audio/pinyin/<字母>.mp3 真人录音 → 系统 TTS → 无声（调用方回退大字报模式）

var table: Dictionary = {}


func _ready() -> void:
	var f := FileAccess.open("res://data/pinyin.json", FileAccess.READ)
	if f:
		var parsed = JSON.parse_string(f.get_as_text())
		if parsed is Dictionary:
			table = parsed


## 该等级可用的字母池：等级每 +2 解锁下一个学习阶段
func letters_for_level(level: int) -> Array:
	var stages: Array = table.get("stages", [])
	if stages.is_empty():
		return ["a", "o", "e"]
	var max_stage := clampi(int(ceili(level / 2.0)), 1, stages.size())
	var pool: Array = []
	for i in range(max_stage):
		pool.append_array(stages[i]["letters"])
	return pool


## 视觉相近字母（用于高级别干扰项）
func similar(letter: String) -> Array:
	var sim: Dictionary = table.get("similar", {})
	return sim.get(letter, [])


func has_audio(letter: String) -> bool:
	return ResourceLoader.exists("res://audio/pinyin/%s.mp3" % letter)


## 返回 true 表示有声音；false 表示需要调用方显示文字提示
func play_syllable(letter: String) -> bool:
	var path := "res://audio/pinyin/%s.mp3" % letter
	if ResourceLoader.exists(path):
		var p := AudioStreamPlayer.new()
		add_child(p)
		p.stream = load(path)
		p.finished.connect(p.queue_free)
		p.play()
		return true
	if _tts_speak(letter):
		return true
	return false


func _tts_speak(text: String) -> bool:
	if not DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH):
		return false
	var voices := DisplayServer.tts_get_voices()
	if voices.is_empty():
		return false
	var voice_id := ""
	for v in voices:
		var name_l: String = str(v.get("name", "")).to_lower()
		var lang_l: String = str(v.get("language", "")).to_lower()
		if lang_l.begins_with("zh") or name_l.contains("huihui") or name_l.contains("chinese"):
			voice_id = str(v.get("id", voice_id))
	if voice_id == "":
		return false
	DisplayServer.tts_speak(text, voice_id)
	return true
