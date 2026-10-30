# 🌍 小小地球 · 儿童地理启蒙地球仪

一个给孩子玩的 3D 卡通地球仪：拖一拖、转一转、点一点，在玩具里认识我们的星球。

**技术栈**：Vite + 原生 ES Modules + Three.js，无框架、零运行时依赖（仅 three）。
**构建产物**：`dist/index.html` 单文件（资源全部内联），双击即可离线打开。

## 快速开始

```bash
npm install
npm run dev      # 开发（http://127.0.0.1:5173）
npm run build    # 产出 dist/index.html 单文件
```

## 功能

| 功能 | 说明 |
|------|------|
| 🌏 卡通地球 | NASA 卫星影像 → 绘本化（色阶量化 + 糖果蓝海洋 + 白海岸描边） |
| 🖐️ 拖动/缩放 | 惯性阻尼，灵敏度已调低，适合小朋友 |
| ☀️ 昼夜 | 时间滑块让太阳绕地球转，看白天黑夜 |
| 🍂 季节 | 月份滑块 + 春夏秋冬快捷按钮；南北半球雪线此消彼长（雪只落陆地） |
| 🌬️ 大气环流 | 三圈环流彗星状流线，**南北半球风向镜像**（东北/东南信风、西南/西北西风），南半球西风带最强（咆哮西风带），ITCZ 随季节移动 |
| 🌧️ 天气互动 | 点哪里下哪里：热带温带下雨、寒带下雪（Roadmap #1 ✅） |
| 🗺️ 经纬网 | 30° 网格 + 赤道/回归线/极圈高亮 |
| 🌊 洋流 | 13 条主要洋流（暖流红、寒流蓝），光点沿线流动 |
| 🏔️ 气候带 | 五带划分（热带/温带/寒带） |
| 📍 24 个地标 | 中国 12 处地貌 + 世界 12 处名胜；放大出现会动的贴纸小场景 |
| 📖 知识卡 | 点球面按纬度出小知识；点地标出详情 + **百度百科**链接 |
| 🚤 驾船 | 第三人称跟随镜头（屏幕上方=船头），WASD/方向键，真实海岸线碰撞，尾迹泡泡 |

## 工程结构

```
earth/
├── index.html              # 页面骨架（纯标记，无脚本）
├── vite.config.js          # 构建：单文件产物
├── src/
│   ├── main.js             # 入口：组装所有模块 + 动画循环
│   ├── core/
│   │   ├── scene.js        # 渲染器/相机/控制器/灯光
│   │   └── geo.js          # 经纬度数学、陆地数据、碰撞
│   ├── textures/
│   │   ├── earth-texture.js   # 卫星图 → 卡通化管线
│   │   └── cloud-texture.js   # 云层
│   ├── features/           # 一个功能一个模块
│   │   ├── snow-layer.js      # 季节积雪
│   │   ├── circulation.js     # 大气环流
│   │   ├── climate-bands.js   # 五带
│   │   ├── graticule.js       # 经纬网
│   │   ├── ocean-currents.js  # 洋流
│   │   ├── landmarks.js       # 地标布局（数据驱动）
│   │   ├── stickers.js        # 贴纸质感 + 动效系统
│   │   ├── picking.js         # 点击拾取
│   │   └── boat.js            # 驾船
│   ├── data/
│   │   ├── land.json       # Natural Earth 陆地轮廓（仅海岸线，无国界）
│   │   ├── regions.js      # 地标清单 + 百科词条
│   │   └── facts.js        # 知识卡文案池
│   ├── ui/
│   │   ├── controls.js     # 控制面板连线
│   │   └── fact-card.js    # 知识卡
│   ├── styles/main.css
│   └── assets/             # 贴图与贴纸（构建时内联）
```

## 改内容去哪改

- **加/改地标**：`src/data/regions.js`（坐标、知识、百科词条）+ `src/features/landmarks.js` 的 `LAYOUT`（贴纸布局）
- **加知识卡文案**：`src/data/facts.js` 往数组里追加 `[标题, 正文]`
- **加贴纸图**：把 webp/png 丢进 `src/assets/sprites/`，无需改代码
- **调手感**：`src/core/scene.js`（灵敏度）、`src/features/boat.js`（船速/转向）

## 素材来源

- 地球底图：NASA Blue Marble（three-globe 示例资源）
- 陆地轮廓：Natural Earth land-110m（海岸线，不含国界，规避地图合规问题）
- 贴纸：Fluent Emoji 3D（MIT）+ 3 张 AI 生成后抠图

## Roadmap

- [x] 天气互动：点哪里下雨/下雪（热带出雨、寒带出雪）
- [ ] 动物拖放小游戏：把企鹅/北极熊送回家
- [ ] 板块边界与火山地震带图层
- [ ] 大陆漂移时间轴（盘古大陆 → 今天）
- [ ] 驾船环游打卡任务
- [ ] 收集图鉴徽章
