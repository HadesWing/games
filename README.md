# 🎮 HadesWing 的游戏仓库

一个仓库放多个游戏，**一个游戏一条分支**，`main` 只做游戏入口页。

## 在线玩

**https://hadeswing.github.io/games/**

不用下载。门厅页点卡片即可，手机横屏或电脑打开体验最好。

## 分支一览

| 分支 | 游戏 | 形态 | 线上路径 |
|------|------|------|----------|
| `earth` | 🌍 小小地球（3D 卡通地球仪） | Vite 单文件构建 | `/earth/` |
| `kids-sudoku` | 🧩 小动物数独乐园 | 静态 HTML | `/kids-sudoku/` |
| `visual-detective` | 🔍 视觉小侦探（原型） | 静态 HTML | `/visual-detective/` |
| `pinyin` | 🔤 拼音乐园（75 条真人配音） | 自包含静态 HTML | `/pinyin/` |
| `guess-number` | 🔢 猜数字（区间夹逼） | 自包含静态 HTML | `/guess-number/` |
| `danmaku-guess` | 💬 弹幕猜词 | Node 服务 + 本地模型 | 不部署，需本地运行 |

## 自动发布

`.github/workflows/deploy.yml`（在 `main` 分支）负责把各游戏分支聚合成一个站点：

1. 依次 checkout `main` / `earth` / `kids-sudoku` / `visual-detective` / `pinyin` / `guess-number`；
2. `earth` 跑 `npm ci && npm run build` 出单文件产物，其余直接拷贝 HTML；
   `pinyin` 取 `web/index.html`（数据表与 75 条 mp3 已内嵌，无需拷贝音频目录）；
3. 组装成 `_site/index.html`（门厅）+ `_site/<游戏>/index.html`，上传到 GitHub Pages。

改门厅页推送到 `main` 会自动发布。`guess-number` 分支自带 `Signal games update`
（push 触发），跑完后由 `main` 的 `Deploy games` 通过 `workflow_run` 接手发布 ——
因为 `push` 事件只读取被推送分支上的工作流文件，且 `github-pages` 环境只允许默认分支部署。
`pinyin` 等其它分支暂未接信号，改完去 Actions 页面手动点一次 **Run workflow**，
或照 `guess-number` 的 `.github/workflows/signal.yml` 补一份信号工作流
（文件名不能与 main 的 `deploy.yml` 相同，否则 GitHub 会当成同一个工作流，
`workflow_run` 按名称匹配不到）。

`danmaku-guess` 需要常驻 Node 服务（SSE）和本地模型，无法做成静态页，因此不参与聚合部署，门厅页那张卡片直接指向该分支的源码。

## 分支约定

1. **每个游戏独占一条分支，根目录只放这个游戏自己的文件**，不放其他游戏的代码。
2. **`main` 不放任何游戏代码**，只有门厅 `index.html`、本 README 和发布 workflow。
3. 新游戏开工：`git switch --orphan <分支名>`（全新分支）或从 `main` 切出后清空，再放代码。
4. 静态游戏直接双击 HTML 就能玩；Vite 项目 `npm install && npm run dev` 开发、`npm run build` 出单文件。
5. 新游戏上线：在 `deploy.yml` 里加一段 checkout + 拷贝，并在门厅页加一张卡片。
