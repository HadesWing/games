// 分析器：读采集下来的 JSONL，出一份能指导决策的报告
//
// 用法：
//   node tools/analyze.mjs                       # 分析 data/ 下所有文件
//   node tools/analyze.mjs data/xxx.jsonl        # 分析指定文件
//   node tools/analyze.mjs --out data/r.md       # 指定输出路径
//
// 产出的每个指标都对应一个具体动作，不是凑数的统计数据。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')

const argv = process.argv.slice(2)
const outIdx = argv.indexOf('--out')
const outPath = outIdx >= 0 ? argv[outIdx + 1] : null
const files = argv.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1)

// ---------- 读数据 ----------
function listFiles() {
  if (files.length) return files
  if (!fs.existsSync(DATA)) return []
  return fs
    .readdirSync(DATA)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(DATA, f))
}

const inputFiles = listFiles()
if (!inputFiles.length) {
  console.error('没有找到数据文件。先用 tools/collect.mjs 采一轮，或用 node tools/sample.mjs 生成样例。')
  process.exit(1)
}

const events = []
for (const f of inputFiles) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    try {
      const e = JSON.parse(line)
      if (e.type !== 'meta') events.push(e)
    } catch {}
  }
}
events.sort((a, b) => a.t - b.t)

const chats = events.filter((e) => e.type === 'chat' && e.text)
const gifts = events.filter((e) => e.type === 'gift')
const likes = events.filter((e) => e.type === 'like')
const members = events.filter((e) => e.type === 'member')

if (!events.length) {
  console.error('数据文件是空的。')
  process.exit(1)
}

const span = events[events.length - 1].t - events[0].t
const minutes = Math.max(span / 60000, 0.1)

// ---------- 工具函数 ----------
const len = (s) => [...s].length
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) + '%' : '—')
const num = (n) => n.toLocaleString('en-US')

function percentile(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

function topN(data, n = 20) {
  const arr = data instanceof Map ? [...data.entries()] : [...data]
  return arr.sort((a, b) => b[1] - a[1]).slice(0, n)
}

function bar(v, max, width = 24) {
  return '█'.repeat(Math.max(1, Math.round((v / (max || 1)) * width)))
}

// 过滤纯符号 / 纯数字 / 无意义内容
const isMeaningful = (t) => /[\u4e00-\u9fa5A-Za-z]/.test(t)

// ---------- 指标 ----------
const chatByUser = new Map()
const userChatRate = []
for (const c of chats) {
  chatByUser.set(c.user || '未知', (chatByUser.get(c.user || '未知') || 0) + 1)
  userChatRate.push(c.t)
}

const uniqueUsers = chatByUser.size
const perUser = uniqueUsers ? chats.length / uniqueUsers : 0
const top10Share =
  [...chatByUser.values()].sort((a, b) => b - a).slice(0, 10).reduce((s, v) => s + v, 0) / (chats.length || 1)

// 词形分布
const shape = { '1 字': 0, '2 字': 0, '3 字': 0, '4–6 字': 0, '7 字以上': 0, 无效: 0 }
for (const c of chats) {
  const n = len(c.text)
  if (!isMeaningful(c.text)) shape['无效'] += 1
  else if (n === 1) shape['1 字'] += 1
  else if (n === 2) shape['2 字'] += 1
  else if (n === 3) shape['3 字'] += 1
  else if (n <= 6) shape['4–6 字'] += 1
  else shape['7 字以上'] += 1
}
const validGuess = shape['1 字'] + shape['2 字'] + shape['3 字']

// 词重复率：只统计「看起来像猜词」的弹幕（1–3 字、有中文或字母）
// 把闲聊和符号混进来会让重复率虚高，没有任何指导意义
const guessChats = chats.filter((c) => isMeaningful(c.text) && len(c.text) <= 3)
const guessWords = new Map()
for (const c of guessChats) guessWords.set(c.text, (guessWords.get(c.text) || 0) + 1)
const dupMessages = [...guessWords.values()].filter((v) => v > 1).reduce((s, v) => s + v, 0)
const dupRate = guessChats.length ? dupMessages / guessChats.length : 0

// 发言间隔
const gaps = []
for (let i = 1; i < userChatRate.length; i++) gaps.push(userChatRate[i] - userChatRate[i - 1])

// 每分钟弹幕
const buckets = new Map()
const t0 = events[0].t
for (const c of chats) {
  const m = Math.floor((c.t - t0) / 60000)
  buckets.set(m, (buckets.get(m) || 0) + 1)
}
const bucketList = [...buckets.entries()].sort((a, b) => a[0] - b[0])
const maxBucket = Math.max(...bucketList.map((b) => b[1]), 1)

// 礼物
const giftTotal = gifts.reduce((s, g) => s + (g.diamond || 0) * (g.count || 1), 0)
const giftCount = gifts.reduce((s, g) => s + (g.count || 1), 0)
const giftByUser = new Map()
const giftByName = new Map()
let giftNoValue = 0
for (const g of gifts) {
  const v = (g.diamond || 0) * (g.count || 1)
  if (!g.diamond) giftNoValue += 1
  giftByUser.set(g.user || '未知', (giftByUser.get(g.user || '未知') || 0) + v)
  const key = g.gift || '未知'
  const cur = giftByName.get(key) || { times: 0, value: 0 }
  giftByName.set(key, { times: cur.times + 1, value: cur.value + v })
}
const topGiftUserValue = Math.max(...[...giftByUser.values()], 0)
const giftConcentration = giftTotal ? topGiftUserValue / giftTotal : 0

function hhmm(ms) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---------- 自动结论 ----------
const findings = []
if (chats.length / minutes < 5) {
  findings.push({
    level: 'warn',
    text: `弹幕密度只有 **${(chats.length / minutes).toFixed(1)} 条/分钟**，房间太冷。这种房间的礼物收入基本可以忽略，样本价值也不高。下次选在线人数中腰部（500–5000）的房间。`,
  })
}
if (top10Share > 0.5) {
  findings.push({
    level: 'warn',
    text: `**Top 10 用户贡献了 ${pct(top10Share * 100, 100)} 的弹幕**，参与高度集中。说明真正的活跃玩家就那几个人，榜单设计要让这几个人有面子（专属称号、连击特效），而不是讨好所有人。`,
  })
}
if (validGuess / (chats.length || 1) < 0.3) {
  findings.push({
    level: 'high',
    text: `**只有 ${pct(validGuess, chats.length)} 的弹幕是 1–3 字**，大部分人根本不按规则玩。你需要更显眼地提示"发 1–3 个字"，否则大量有效猜测被浪费。`,
  })
}
if (dupRate > 0.5) {
  findings.push({
    level: 'info',
    text: `**有效猜测里 ${pct(dupRate * 100, 100)} 是重复词**。榜单必须按词去重，否则前 10 名会被同一个词刷满（本地原型已经做了去重）。`,
  })
}
if (giftConcentration > 0.5 && gifts.length > 3) {
  findings.push({
    level: 'warn',
    text: `**礼物收入高度依赖单个用户**（榜首占 ${pct(giftConcentration * 100, 100)}）。这种结构很脆——榜一走了当晚收入就归零。要想办法把中腰部用户的付费意愿做起来。`,
  })
}
if (gifts.length && minutes) {
  const perHour = (gifts.length / minutes) * 60
  findings.push({
    level: 'info',
    text: `礼物频次约 **${perHour.toFixed(1)} 次/小时**。这是判断"这个玩法到底有没有人付费"最直接的指标——低于 5 次/小时说明变现模型在这类房间跑不通。`,
  })
}
if (!findings.length) findings.push({ level: 'ok', text: '各项指标都在正常区间，样本可以用于决策。' })

const levelIcon = { high: '🔴', warn: '🟠', info: '🔵', ok: '🟢' }

// ---------- 生成报告 ----------
const L = []
L.push('# 弹幕竞品分析报告')
L.push('')
L.push(`> 数据源：${inputFiles.map((f) => path.basename(f)).join('、')}`)
L.push(`> 时间：${hhmm(events[0].t)} – ${hhmm(events[events.length - 1].t)}　时长约 ${minutes.toFixed(0)} 分钟`)
L.push(`> 生成于：${new Date().toLocaleString('zh-CN')}`)
L.push('')

L.push('## 一、结论先说')
L.push('')
for (const f of findings) L.push(`- ${levelIcon[f.level]} ${f.text}`)
L.push('')

L.push('## 二、概览')
L.push('')
L.push('| 指标 | 数值 |')
L.push('|---|---|')
L.push(`| 总事件 | ${num(events.length)} |`)
L.push(`| 聊天弹幕 | ${num(chats.length)} |`)
L.push(`| 礼物事件 | ${num(gifts.length)}（含连击共 ${num(giftCount)} 个） |`)
L.push(`| 点赞 / 进场 | ${num(likes.length)} / ${num(members.length)} |`)
L.push(`| 弹幕密度 | ${(chats.length / minutes).toFixed(1)} 条/分钟 |`)
L.push(`| 独立发言人数 | ${num(uniqueUsers)} |`)
L.push(`| 人均发言 | ${perUser.toFixed(1)} 条 |`)
L.push(`| Top10 用户占比 | ${pct(top10Share * 100, 100)} |`)
L.push('')

L.push('## 三、弹幕节奏')
L.push('')
L.push(`相邻两条弹幕间隔：**中位数 ${(percentile(gaps, 50) / 1000).toFixed(1)} 秒**，P90 ${(percentile(gaps, 90) / 1000).toFixed(1)} 秒。`)
L.push('')
L.push('每分钟弹幕量分布：')
L.push('')
L.push('```')
for (const [m, v] of bucketList) L.push(`${String(m).padStart(3)}′  ${bar(v, maxBucket)} ${v}`)
L.push('```')
L.push('')

L.push('## 四、猜词行为')
L.push('')
L.push('| 字数 | 条数 | 占比 |')
L.push('|---|---|---|')
for (const [k, v] of Object.entries(shape)) L.push(`| ${k} | ${num(v)} | ${pct(v, chats.length)} |`)
L.push('')
L.push(`- 符合题目约束（1–3 字）的占 **${pct(validGuess, chats.length)}**，共 ${num(guessChats.length)} 条`)
L.push(`- 这些有效猜测里，重复出现的占 **${pct(dupRate * 100, 100)}**，不同的词只有 ${num(guessWords.size)} 个`)
L.push('')

L.push('### 高频猜测词 TOP 30（只统计 1–3 字）')
L.push('')
L.push('> 这些词就是你词库里应该有的"高关联猜测"。如果某个词反复出现却从来没猜中，说明它离答案很近但不对——可以收进词库当"干扰项"。')
L.push('')
L.push('| 排名 | 词 | 次数 |')
L.push('|---|---|---|')
topN(guessWords, 30).forEach(([w, c], i) => L.push(`| ${i + 1} | ${w} | ${c} |`))
L.push('')

L.push('### 最活跃的人 TOP 10')
L.push('')
L.push('| 排名 | 用户 | 弹幕数 | 占比 |')
L.push('|---|---|---|---|')
topN(chatByUser, 10).forEach(([u, c], i) => L.push(`| ${i + 1} | ${u} | ${c} | ${pct(c, chats.length)} |`))
L.push('')

L.push('## 五、礼物与付费')
L.push('')
if (!gifts.length) {
  L.push('这次采集没有抓到礼物数据。如果是用 `stdin` 模式接 Python 工具，注意它可能只打印聊天消息；换成代理方案能拿到完整礼物流。')
} else {
  L.push('| 指标 | 数值 |')
  L.push('|---|---|')
  L.push(`| 礼物事件 | ${num(gifts.length)} 次 |`)
  L.push(`| 折算钻石 | ${num(giftTotal)}${giftNoValue ? `（其中 ${giftNoValue} 条无钻石字段）` : ''} |`)
  L.push(`| 每小时频次 | ${((gifts.length / minutes) * 60).toFixed(1)} 次 |`)
  L.push(`| 榜首用户占收入 | ${pct(giftConcentration * 100, 100)} |`)
  L.push('')
  L.push('礼物种类分布：')
  L.push('')
  L.push('| 礼物 | 次数 | 钻石 |')
  L.push('|---|---|---|')
  topN([...giftByName.entries()].map(([k, v]) => [k, v.times]), 12).forEach(([g, t]) => {
    const v = giftByName.get(g)
    L.push(`| ${g} | ${t} | ${num(v.value)} |`)
  })
  L.push('')
  L.push('送礼最多的人：')
  L.push('')
  L.push('| 排名 | 用户 | 钻石 |')
  L.push('|---|---|---|')
  topN(giftByUser, 10).forEach(([u, v], i) => L.push(`| ${i + 1} | ${u} | ${num(v)} |`))
  L.push('')
}

L.push('## 六、这些数据怎么用')
L.push('')
L.push('| 指标 | 对应动作 |')
L.push('|---|---|')
L.push('| 1–3 字弹幕占比低 | 画面上把"发 1–3 个字"做成更大的提示 |')
L.push('| 高频词里有大量正确答案的近义词 | 这些词收进词库做干扰项 |')
L.push('| 重复率极高 | 榜单必须按词去重 |')
L.push('| Top10 占比高 | 榜单要给活跃用户专属标识 |')
L.push('| 礼物集中在少数人 | 定价要围绕"榜一大哥"，别指望长尾 |')
L.push('| 礼物频次 < 5 次/小时 | 这个房间不适合做付费玩法，换赛道 |')
L.push('')

const md = L.join('\n')
const finalOut = outPath || path.join(DATA, `report-${Date.now()}.md`)
fs.mkdirSync(path.dirname(finalOut), { recursive: true })
fs.writeFileSync(finalOut, md, 'utf8')

console.log(md)
console.log(`\n报告已保存：${finalOut}\n`)
