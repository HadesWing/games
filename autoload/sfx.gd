extends Node
## 运行时合成音效，零素材依赖

func _tone(freq: float, dur: float, volume: float = 0.5) -> void:
	var rate := 22050
	var n := int(rate * dur)
	var data := PackedByteArray()
	data.resize(n * 2)
	for i in n:
		var v := int(sin(TAU * freq * i / rate) * 32000.0 * volume * (1.0 - float(i) / n))
		data.encode_s16(i * 2, v)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.data = data
	var p := AudioStreamPlayer.new()
	add_child(p)
	p.stream = wav
	p.finished.connect(p.queue_free)
	p.play()


func good() -> void:
	_tone(880.0, 0.15)


func bad() -> void:
	_tone(220.0, 0.2, 0.3)


## 拼读三段节奏：声母 → 韵母 → 音节，音高逐级上行
func step(i: int) -> void:
	_tone([523.0, 659.0, 784.0][clampi(i, 0, 2)], 0.14, 0.32)


func win() -> void:
	_seq([660.0, 830.0, 990.0])


func _seq(freqs: Array) -> void:
	for i in freqs.size():
		_tone(freqs[i], 0.12)
		if i < freqs.size() - 1:
			await get_tree().create_timer(0.12).timeout
