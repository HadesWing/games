# 拼音配音来源与署名

本目录下的 `*.mp3` 为**开源真人录音**，不是本项目原创，也不是本机 TTS 合成产物。

| 项目 | 内容 |
|---|---|
| 上游项目 | [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn) |
| 取用子集 | `64k/syllabs/` 中的汉语带调音节（上游共 1707 条，本项目取 75 条） |
| 录制者 | Chen Wang（经 SWAC Recorder / Shtooka 采集） |
| 项目整理 | Hugo Lopez（PLIDAM, INALCO，压缩与重命名）、Nicolas Vion（录音工具支持） |
| 许可 | **CC BY-SA**（见上游 README 的 `License` 与 `Credits` 章节，作者见表） |

## 本项目的处理

- 按 `data/speech.json` 的 `cmn` 字段取上游 `cmn-<音节>.mp3`，重命名为游戏内部的拼音 key，**音频内容未做任何修改**。
- 声母/韵母的呼读音按拼音教学约定映射到对应音节（例如 `b` → `bo1`「玻」、`a` → `a1`「啊」）；
  两拼音节按 `pinyin.json` 的带调例字映射（例如 `ba` → `ba4`「爸」）。
- 文件名 `ü` 写作 `v`（`v.mp3`、`ve.mp3`、`vn.mp3`），避免非 ASCII 路径。
- 重新生成 / 校验：`python tools/fetch_audio.py --check`、`python tools/fetch_audio.py`。

## 署名与再分发

保留本文件与上游链接即可满足署名要求；若修改音频或将其作为衍生作品再分发，需同样遵循 CC BY-SA。
游戏代码、数据表与脚本不因本目录音频而改变许可。
