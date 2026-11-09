# 🎮 HadesWing 的游戏仓库

一个仓库放多个游戏，**一个游戏一条分支**，`main` 只做游戏入口页。

## 分支一览

| 分支 | 游戏 | 形态 |
|------|------|------|
| `earth` | 🌍 小小地球（3D 卡通地球仪） | Vite 单文件构建 |
| `kids-sudoku` | 🧩 小动物数独乐园 | 静态单文件 HTML |
| `visual-detective` | 🔍 视觉小侦探（原型） | 静态 HTML |

## 分支约定

1. **每个游戏独占一条分支，根目录只放这个游戏自己的文件**，不放其他游戏的代码。
2. **`main` 不放任何游戏代码**，只有 `index.html`（游戏门厅）和本 README。
3. 新游戏开工：`git switch --orphan <分支名>`（全新分支）或从 `main` 切出后清空，再放代码。
4. 静态游戏直接双击 HTML 就能玩；Vite 项目 `npm install && npm run dev` 开发、`npm run build` 出单文件。
