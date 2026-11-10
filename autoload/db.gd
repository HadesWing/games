extends Node
## 存档 + 难度引擎（移植自视觉小侦探）
## 数据模型：sessions 只追加，报告从数据推导；每玩法 Lv.1-10

const SAVE_PATH := "user://save.json"

var data: Dictionary = {"sessions": [], "levels": {}}


func _ready() -> void:
	load_data()


func load_data() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
		var parsed = JSON.parse_string(f.get_as_text())
		if parsed is Dictionary:
			data = parsed
	if not data.has("sessions"):
		data["sessions"] = []
	if not data.has("levels"):
		data["levels"] = {}


func save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))


func lvl(game: String) -> int:
	return clampi(int(data["levels"].get(game, 1)), 1, 10)


func set_lvl(game: String, v: int) -> void:
	data["levels"][game] = clampi(v, 1, 10)
	save()


func add(rec: Dictionary) -> void:
	data["sessions"].append(rec)
	save()


## 最近 n 局记录（升序）
func history(game: String, n: int = 8) -> Array:
	var out: Array = []
	for s in data["sessions"]:
		if str(s.get("g", "")) == game:
			out.append(s)
	if out.size() > n:
		out = out.slice(out.size() - n)
	return out


## 星级：绝对分数线 + 进步奖励（比自己的历史好也算成功）
func stars_of(score: float, hist: Array) -> int:
	var avg := 0.0
	if hist.size() > 0:
		for s in hist:
			avg += float(s.get("score", 0))
		avg /= hist.size()
	if score >= 90.0:
		return 3
	if score >= 70.0:
		return 2
	if score >= 50.0 or (hist.size() >= 2 and score >= avg):
		return 1
	return 0


## 一局结束：写记录 + 自动升降难度，返回星数
func finish(game: String, score: float, extra: Dictionary = {}) -> int:
	var hist := history(game)
	var stars := stars_of(score, hist)
	add({
		"g": game, "lvl": lvl(game), "score": score, "stars": stars,
		"extra": extra, "t": Time.get_datetime_string_from_system(),
	})
	if stars >= 3:
		set_lvl(game, lvl(game) + 1)
	elif stars == 0 and lvl(game) > 1:
		set_lvl(game, lvl(game) - 1)
	return stars
