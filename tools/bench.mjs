// A/B 基准：把「人工标注的期望分」和两套引擎的输出放一起对比
//
// 用法
//   node tools/bench.mjs              # 终端表格（默认启用 LLM 精排层）
//   node tools/bench.mjs --no-judge   # 只用 embedding，不调大模型
//   node tools/bench.mjs --out x.md   # 同时写一份 markdown
//
// 指标
//   MAE        平均绝对误差（越小越准）
//   荒谬数     误差 > 25 分的对数（观众会觉得"这分数在开玩笑"）
//   Spearman   和人工排序的秩相关（越接近 1，排序越接近人）

import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (args.includes('--no-judge')) process.env.JUDGE = 'off'

// 环境变量必须在模块加载前设好，所以这里用动态导入
const { score, graphScore, warmup, engineInfo } = await import('../lib/score.mjs')
const judge = await import('../lib/judge.mjs')

// [猜测, 答案, 人工期望分, 备注]
const CASES = [
  // —— embedding 的主场：字面完全不像，语义很近 ——
  ['拿铁', '咖啡', 85, '同品类具体品种'],
  ['美式', '咖啡', 82, '同品类具体品种'],
  ['卡布奇诺', '咖啡', 80, '同品类具体品种'],
  ['奶茶', '咖啡', 62, '同为饮品'],
  ['牛奶', '咖啡', 52, '制作原料'],
  ['苹果', '咖啡', 5, '毫无关系'],
  // —— 服饰部件：v0 因为词表缺「领口」直接判死 ——
  ['前襟', '衣襟', 92, '同义词'],
  ['领口', '衣襟', 80, '同区域部件'],
  ['袖口', '衣襟', 66, '同为上装部件'],
  ['扣子', '衣襟', 55, '相邻部件'],
  ['衬衫', '衣襟', 42, '整体与部件'],
  ['苹果', '衣襟', 4, '毫无关系'],
  // —— 动物：v0 会把「猫」判 9 分（因为词表里只有「小猫」）——
  ['猫', '小狗', 72, '同为常见宠物'],
  ['兔子', '小狗', 50, '同为小动物'],
  ['老虎', '小狗', 26, '同为哺乳动物，但差得远'],
  ['鲸鱼', '小狗', 15, '都是动物，但很疏远'],
  // —— 数码 ——
  ['充电宝', '手机', 76, '配件'],
  ['屏幕', '手机', 86, '组成部件'],
  ['电脑', '手机', 58, '同类电子设备'],
  ['耳机', '手机', 62, '常用搭配'],
  ['苹果', '手机', 40, '品牌联想'],
  // —— 其他分类 ——
  ['拉链', '纽扣', 68, '同功能件'],
  ['裤腰', '裤子', 82, '部件'],
  ['围巾', '衣领', 58, '位置相邻'],
  ['西瓜', '香蕉', 62, '同为水果'],
  ['饺子', '米饭', 58, '同为主食'],
]

function rank(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const r = new Array(arr.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}

function pearson(a, b) {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}

const spearman = (a, b) => pearson(rank(a), rank(b))

const outIdx = args.indexOf('--out')
const outPath = outIdx >= 0 ? args[outIdx + 1] : null

const eng = await warmup()
const mode = eng.enabled ? `${eng.provider}/${eng.model}` : '纯图谱（未启用 embedding）'
const jinfo = eng.judge || {}
console.log(`\n引擎：${mode}${eng.calib ? ` · 校准 μU=${eng.calib.muU} μR=${eng.calib.muR}` : ''}`)
console.log(`精排：${jinfo.enabled ? `开启（${jinfo.model}，批量 ${jinfo.batch}，超时 ${jinfo.timeoutMs}ms）` : '关闭'}`)

// 先把全部词对一次性批量判完，后续逐条打分全部命中缓存，测的才是稳定性能
if (jinfo.enabled) {
  const t0 = Date.now()
  const jm = await judge.judgeBatch(CASES.map(([g, a]) => [g, a]))
  console.log(`精排预热：${jm.size} 条，耗时 ${Date.now() - t0}ms（单条约 ${Math.round((Date.now() - t0) / Math.max(jm.size, 1))}ms）`)
}
console.log('')

const rows = []
for (const [g, a, want, note] of CASES) {
  const v1 = await score(g, a)
  const v0 = graphScore(g, a)
  rows.push({ g, a, want, note, v0: v0.score, v1: v1.score, reason: v1.reason, sim: v1.sim })
}

const mae = (key) => rows.reduce((s, r) => s + Math.abs(r[key] - r.want), 0) / rows.length
const absurd = (key) => rows.filter((r) => Math.abs(r[key] - r.want) > 25).length
const want = rows.map((r) => r.want)
const sp0 = spearman(rows.map((r) => r.v0), want)
const sp1 = spearman(rows.map((r) => r.v1), want)

const pad = (s, n) => String(s).padEnd(n)
const num = (v, n = 5) => String(v).padStart(n)

const lines = []
lines.push(`| 猜测 | 答案 | 人工期望 | v0 图谱 | v1 语义 | 判定路径 |`)
lines.push(`|---|---|---:|---:|---:|---|`)
for (const r of rows) {
  const d0 = Math.abs(r.v0 - r.want) > 25 ? ' ←' : ''
  const d1 = Math.abs(r.v1 - r.want) > 25 ? ' ←' : ''
  lines.push(
    `| ${r.g} | ${r.a} | ${r.want} | ${r.v0.toFixed(1)}${d0} | ${r.v1.toFixed(1)}${d1} | ${r.reason} |`,
  )
}

console.log('| 猜测 | 答案 | 期望 | v0 图谱 | v1 语义 | 路径 |')
console.log('|---|---|---:|---:|---:|---|')
for (const r of rows) {
  console.log(
    `| ${pad(r.g, 6)} | ${pad(r.a, 5)} | ${num(r.want, 3)} | ${num(r.v0.toFixed(1))} | ${num(r.v1.toFixed(1))} | ${r.reason} |`,
  )
}

const summary = [
  '',
  `- **平均绝对误差**：v0 ${mae('v0').toFixed(1)} → v1 ${mae('v1').toFixed(1)}`,
  `- **荒谬对数**（误差 > 25）：v0 ${absurd('v0')} / ${rows.length} → v1 ${absurd('v1')} / ${rows.length}`,
  `- **排序秩相关**（Spearman）：v0 ${sp0.toFixed(3)} → v1 ${sp1.toFixed(3)}`,
]
console.log(summary.join('\n'))

if (outPath) {
  const head = [
    '# 关联度引擎 A/B 基准',
    '',
    `- 引擎：${mode}`,
    jinfo.enabled ? `- 精排层：${jinfo.model}` : '- 精排层：关闭',
    eng.calib ? `- 校准锚点：不相关 ${eng.calib.muU} / 相关 ${eng.calib.muR}（σ ${eng.calib.sigma}）` : '',
    `- 样本：${rows.length} 对（人工标注期望分）`,
    '',
  ].filter(Boolean)
  const tail = [
    '',
    '## 结论',
    '',
    `- 平均绝对误差：**v0 ${mae('v0').toFixed(1)} → v1 ${mae('v1').toFixed(1)}**`,
    `- 荒谬对数（误差 > 25 分）：**v0 ${absurd('v0')} → v1 ${absurd('v1')}**`,
    `- 与人工排序的秩相关：**v0 ${sp0.toFixed(3)} → v1 ${sp1.toFixed(3)}**`,
    '',
    '> `←` 标记表示该条误差超过 25 分，属于观众会觉得"分数在开玩笑"的情况。',
  ]
  writeFileSync(outPath, [...head, ...lines, ...tail].join('\n'))
  console.log(`\n已写入 ${outPath}`)
}

const info = engineInfo()
if (!info.enabled) process.exitCode = 0
