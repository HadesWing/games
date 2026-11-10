# 拼音小游戏（Godot 4.7）

给 5-6 岁孩子的拼音启蒙小游戏合集。设计清单见 `../拼音小游戏清单-Godot.md`。

## 在线玩（网页版，无需安装 Godot）

**https://hadeswing.github.io/games/pinyin/**

`web/index.html` 是一个约 960KB 的自包含单文件：75 条真人录音以 data URI 内嵌，
零外部依赖、无需联网，双击本地文件也能玩。三个页签：

- 🎣 **拼音钓鱼**：听音辨形，8 题一局，有「再听一次」「看字提示」，点任意鱼读该鱼拼音
- 🤝 **找朋友**：两拼拼读，6 题一局，点声母+韵母（桌面也可拖拽），`b → a → ba` 三段真人音
- 🔊 **全部读音**：75 张卡片点读，附 `b → a → ba` 三段示范

进度 / 星级 / 难度存 `localStorage`（键 `pinyinweb_v1`），出题与计分规则和 Godot 版一致。
网页版源码在 `web/template.html`：**改游戏逻辑改模板，然后重新构建**：

```bash
python tools/build_web.py          # 读 data/*.json + audio/pinyin/*.mp3，生成 web/index.html
python tools/build_web.py --check  # 校验 75 条音频覆盖、无外链、无残留占位符
```

发布由 `main` 分支的 `.github/workflows/deploy.yml` 负责：checkout 本分支，
把 `web/index.html` 拷成站点的 `/pinyin/index.html`。

## 本地运行 Godot 版

1. 打开 Godot（`D:\program\Godot\Godot_v4.7.2-stable_win64.exe`）
2. 项目管理器 → **导入** → 选择本目录的 `project.godot`
3. 点右上角 **▶ 运行**（F5）

字体走 Godot 系统回退，工程不附带第三方字体，详见 `fonts/README.md`。

## 已实现

- **🔊 全量配音**：47 个声母/韵母 + 28 个两拼音节共 75 条真人录音，点哪读哪；
  缺音频时自动用系统中文 TTS 读呼读音汉字兜底，详见下方「发音音频」
- **A 拼音钓鱼**（听音辨形）：一局 8 个目标，首次点对计满分；3 星自动升难度、0 星降级
- **B 找朋友**（两拼拼读）：一局 6 个音节，把声母卡拖到韵母卡（或先点声母再点韵母），
  成功后按 `b → b-a → ba` 三段节奏逐段放大、发音，并弹出汉字词奖励卡
  - 难度按 Lv.1-10 递进：声母卡 1→4 张、韵母卡 2→4 张；Lv.6 起优先用形近字母当干扰
  - 等级每 3 级解锁一批声母；Lv.7 起覆盖 zh/ch/sh 等翘舌音
  - 拼读三段 `b → b-a → ba` 各自播真人录音（约 1 秒一段），配大字放大动画
  - **无声兜底**：目标音节用大字直接显示，三段视觉动画照常完整播放，玩法不受影响
  - 答错不惩罚：卡片缩一下，只重试，不扣分、不锁死
- 主页 / 星级结算 / 家长看板（最近 8 局得分）
- 护眼守卫：累计 20 分钟弹休息倒计时 20 秒
- 存档：`user://save.json`（sessions 只追加，报告由数据推导）

## 架构（壳 / 玩法 / 数据三层）

```
autoload/
  db.gd          存档 + 难度引擎（finish() 自动升降级）
  pinyin_data.gd 数据表加载 + 统一发音（真人 mp3 → 汉字 TTS → 无声）
  sfx.gd         运行时合成音效（对/错/胜利 + 拼读三段 step()），零素材
  guard.gd       护眼计时
scenes/home.*    主页壳（进主页统一停止朗读）
games/fishing/   A 钓鱼玩法
games/friends/   B 找朋友玩法（内部类 ShengCard/YunCard 实现原生拖放）
tests/           Godot headless 测试场景 + 网页版 Node 回归
web/template.html 网页版源码（改游戏逻辑改这里）
web/index.html   构建产物：自包含单文件，线上玩的就是它
data/pinyin.json 字母分阶段表 + 相近字母表 + 28 条两拼音节（含汉字词/带调拼音）
data/speech.json 75 条读音映射（上游音节 ID + 呼读音汉字）
audio/pinyin/    75 条真人录音 mp3 + CREDITS.md 署名
tools/build_web.py   网页版构建 / 校验（把数据表与 mp3 内嵌成单文件）
tools/fetch_audio.py 音频提取与覆盖校验脚本
```

**新增一个玩法** = `games/` 下加目录（tscn+gd）+ 主页加一个按钮 + `Db.finish(game_id, score)`，存档/星级/难度/家长看板全部自动生效。

## 发音音频

`audio/pinyin/*.mp3` 已随工程附带，共 **75 条真人录音**（47 个字母 + 28 个音节），
来自开源项目 [audio-cmn](https://github.com/hugolpz/audio-cmn)（Chen Wang 录制，CC BY-SA），
署名与取用说明见 `audio/pinyin/CREDITS.md`。

**发音优先级**：`audio/pinyin/<拼音>.mp3` 真人录音 → 系统中文 TTS 读 `data/speech.json`
里的呼读音汉字 → 无声（调用方回退大字报模式）。系统 TTS 不能直接念拼音字母，
`b` 会被念成英文字母 B，所以兜底必须念「玻」；声母/韵母/音节的汉字映射全在 `speech.json`。

**交互**：
- A 钓鱼：出题自动读目标音，有「🔊 再听一次」按钮，点任意一条鱼也会读那条鱼的音
- B 找朋友：出题读目标音节，点声母卡 / 韵母卡各自发音，配对成功后按
  `b → b-a → ba` 三段各读一次（间隔留足 1 秒，不叠音），也有「再听一次」
- 切题目 / 回主页 / 重开一局前 `PinyinData.stop_speech()` 掐掉上一段，不拖尾音

**音频文件是纯数据**：用 `FileAccess` 读字节直接构造 `AudioStreamMP3`，不依赖编辑器导入，
headless 和刚克隆的工程都能出声；导出包里若原始 mp3 未打包，会自动退回 `load()` 读导入资源。
导出到其它平台时建议在导出预设的「资源」过滤器里加上 `audio/pinyin/*.mp3`。
编辑器生成的 `*.import` 属于本地产物，已在 `.gitignore` 排除。

**重新生成 / 校验**（正常游玩不需要）：

```bash
python tools/fetch_audio.py --check   # 校验映射表与 75 个音频文件是否齐全
python tools/fetch_audio.py           # 从上游整包重新提取（约 300MB，仅首次需联网）
```

## 回归测试（headless，无需打开编辑器）

```bash
godot --headless --path . res://tests/test_friends.tscn --quit-after 900
godot --headless --path . res://tests/test_speech.tscn --quit-after 600
node tests/test_web_core.js   # 网页版核心逻辑 24 项（纯 Node，零依赖）
node tests/test_web_ui.js    # 网页版 DOM 冒烟 8 项（可选，需 jsdom）
```

`test_friends`：音节表一致性、Lv.1-10 卡片数量梯度、配对判定与计分、拖拽载荷、点选通道、
错答不惩罚、完整一局的 100 分 / 3 星 / 自动升级与存档还原。
`test_speech`：75 条读音映射与音频覆盖、字母/音节全覆盖、`ü → v` 文件名归一化、
实际播放 / 连播防叠音 / 停止朗读、TTS 呼读音汉字兜底。
`test_web_core`：字母池与鱼群梯度、回合卡片覆盖、配对 / 计分 / 星级 / 存档、发音层防叠音。
`test_web_ui`：首次渲染、完整一局钓鱼、结算存档、切换玩法、三段拼读、75 张试听卡。
退出码 0 表示全通过；未装 jsdom 时 DOM 冒烟会自动跳过。

## 玩法清单进度（详见 `../拼音小游戏清单-Godot.md`）

| 玩法 | 状态 |
|---|---|
| A 拼音钓鱼 | ✅ 已实现 |
| B 找朋友 | ✅ 已实现（两拼；三拼 / 复韵母整体卡待补） |
| C 摘果子 | ⬜ 未实现，主页已占位 |
| D 快递员 / E 声调过山车 / F 打地鼠 | ⬜ 未实现 |
| G 小火车 / H 照镜子 / I 摘帽子 / J 猜猜猜 / K 点亮拼音串 | ⬜ 未实现 |

按清单的 MVP 建议，下一个应做 **C 摘果子**（四声测评，产出家长报告数据）；
**E 声调过山车**是差异化最强的一个，排第二批第一个。
网页版目前覆盖 A / B 与全部读音试听；Godot 版新增玩法后，网页版需另行移植。

## 交互底线（沿用视觉小侦探）

- 答错不惩罚（卡片缩一下 / 鱼抖一下），即时音效反馈
- 点击区 ≥ 150×100（卡片 200×100）
- 单局 3 分钟内
