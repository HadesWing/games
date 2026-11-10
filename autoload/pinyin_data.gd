extends Node
## 拼音数据表 + 统一发音入口：真人录音 mp3 → 系统 TTS 读呼读音汉字 → 无声
##
## 音频按纯数据文件读取（FileAccess + AudioStreamMP3.data），不依赖 Godot 资源导入系统，
## 因此 headless 测试、刚克隆还没用编辑器导入过的工程都能直接出声。
## 关键点：系统 TTS 不能直接念拼音字母（"b" 会被念成英文字母 B），
## 必须念 data/speech.json 里配好的呼读音汉字（b → "玻"）。

const DATA_FILE := "res://data/pinyin.json"
const SPEECH_FILE := "res://data/speech.json"
const AUDIO_DIR := "res://audio/pinyin/"

var table: Dictionary = {}
var speech: Dictionary = {}
var last_played: String = ""

var _voice: AudioStreamPlayer
var _zh_voice: String = ""


func _ready() -> void:
	table = _read_json(DATA_FILE)
	speech = _read_json(SPEECH_FILE)
	_voice = AudioStreamPlayer.new()
	add_child(_voice)
	_zh_voice = _find_zh_voice()


func _read_json(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("读音数据缺失: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	return parsed if parsed is Dictionary else {}


## ü → v：音频文件名保持全 ASCII（与 tools/fetch_audio.py 的 safe_key 一致）
static func audio_key(letter: String) -> String:
	return letter.replace("ü", "v")


static func audio_path(letter: String) -> String:
	return AUDIO_DIR + audio_key(letter) + ".mp3"


func has_audio(letter: String) -> bool:
	var path := audio_path(letter)
	return FileAccess.file_exists(path) or ResourceLoader.exists(path)


## 编辑器/headless：mp3 是纯数据文件，直接读字节构造流（无需先导入）。
## 导出后的包：原始文件可能已被 Godot 转成导入资源，此时退回 load()。
func _stream_for(letter: String) -> AudioStream:
	var path := audio_path(letter)
	if FileAccess.file_exists(path):
		var bytes := FileAccess.get_file_as_bytes(path)
		if not bytes.is_empty():
			var stream := AudioStreamMP3.new()
			stream.data = bytes
			return stream
	if ResourceLoader.exists(path):
		var res := load(path)
		if res is AudioStream:
			return res
	return null


## 无真人录音时交给系统 TTS 朗读的汉字
func say_text(letter: String) -> String:
	for group in ["syllables", "letters"]:
		var g: Variant = speech.get(group, null)
		if g is Dictionary and g.has(letter):
			var item: Variant = g[letter]
			if item is Dictionary:
				return str(item.get("say", ""))
	return ""


func can_speak(letter: String) -> bool:
	return has_audio(letter) or say_text(letter) != ""


## 返回 true 表示确实发了声；false 时调用方回退大字报模式
func play_syllable(letter: String) -> bool:
	if letter == "" or _voice == null:
		return false
	stop_speech()
	var stream := _stream_for(letter)
	if stream != null:
		_voice.stream = stream
		_voice.play()
		last_played = letter
		return true
	var text := say_text(letter)
	if text != "" and _tts_speak(text):
		last_played = letter
		return true
	return false


## 切换题目 / 离开场景前调用，避免上一段朗读盖住新的一段
func stop_speech() -> void:
	if _voice != null and _voice.playing:
		_voice.stop()
	if DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH):
		DisplayServer.tts_stop()


func is_speaking() -> bool:
	return _voice != null and _voice.playing


func _find_zh_voice() -> String:
	if not DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH):
		return ""
	var voices := DisplayServer.tts_get_voices()
	for v in voices:
		var lang := str(v.get("language", "")).to_lower()
		var nm := str(v.get("name", "")).to_lower()
		if lang.begins_with("zh") or nm.contains("huihui") or nm.contains("chinese"):
			return str(v.get("id", ""))
	return ""


func _tts_speak(text: String) -> bool:
	if _zh_voice == "":
		return false
	if not DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH):
		return false
	DisplayServer.tts_speak(text, _zh_voice)
	return true


## 供回归测试遍历
func all_speech_keys() -> Array:
	var out: Array = []
	for group in ["letters", "syllables"]:
		var g: Variant = speech.get(group, null)
		if g is Dictionary:
			for k in g.keys():
				out.append(str(k))
	return out


# ---------------- 原有数据表接口 ----------------

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
