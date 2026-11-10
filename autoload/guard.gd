extends Node
## 护眼守卫：累计玩满 20 分钟发出休息信号

signal need_rest

const LIMIT_SEC := 20 * 60

var elapsed := 0.0
var resting := false


func _process(delta: float) -> void:
	if resting:
		return
	elapsed += delta
	if elapsed >= LIMIT_SEC:
		resting = true
		need_rest.emit()


func finish_rest() -> void:
	elapsed = 0.0
	resting = false
