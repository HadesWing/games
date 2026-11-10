// 生成合成样例数据 —— 只用于验证 collect → analyze 管线能不能跑通
//
// ⚠️ 这不是真实数据。真实结论必须用 tools/collect.mjs 采回来的数据跑。
//
// 用法：node tools/sample.mjs
// 产出：data/SAMPLE-<时间戳>.jsonl

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOISE_GUESSES, ANSWER_POOL } from '../lib/lexicon.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(__dirname, '..', 'data')
fs.mkdirSync(DATA, { recursive: true })

const DURATION_MIN = 48
const start = Date.now() - DURATION_MIN * 60_000

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const outFile = path.join(DATA, `SAMPLE-${stamp}.jsonl`)

const pick = (a) => a[Math.floor(Math.random() * a.length)]
const rand = (a, b) => a + Math.random() * (b - a)

// 观众：少数重度用户 + 大量轻度用户（近似 Zipf）
const NAMES = [
  '小智', 'YY', '墨个镜', '退休九十九', 'Hz七哥', '佩佩', '坐看雪', '羊驼追导', '正牌老公', '烟头',
  'B-LUCK', '起喜糖', '嫦娥不会飞', '冰激凌', 'Estrella', '不想说话', '夜航船', '冬瓜排骨',
  '柠檬不酸', '三分钟热度', '南山南', '一只咸鱼', '晚风', '打工人甲', '番茄炒蛋', '老张头',
  '糖醋里脊', '睡不醒', '橘子汽水', '摸鱼选手', '无名氏', '路人甲', '清欢', '小满', '半糖少冰',
]
const users = []
for (let i = 0; i < 240; i++) {
  const base = NAMES[i % NAMES.length]
  const name = i < NAMES.length ? base : `${base}${Math.floor(i / NAMES.length) + 1}`
  // 权重按 zipf：排名越靠前发言越频繁
  const weight = 1 / Math.pow(i + 1, 0.85)
  users.push({ name, weight })
}
const totalWeight = users.reduce((s, u) => s + u.weight, 0)
function pickUser() {
  let r = Math.random() * totalWeight
  for (const u of users) {
    r -= u.weight
    if (r <= 0) return u.name
  }
  return users[0].name
}

// 每轮答案（估计 3–4 分钟一局）
const rounds = []
for (let m = 0; m < DURATION_MIN; m += rand(3, 4.5)) {
  rounds.push({ at: m, ...pick(ANSWER_POOL) })
}
function answerAt(minute) {
  let cur = rounds[0]
  for (const r of rounds) if (r.at <= minute) cur = r
  return cur
}

const lines = []
const push = (e) => lines.push(JSON.stringify(e))

// 用来凑随机字，制造"没见过的词"，让重复率接近真实水平
const CHARS = [...'衣服袖领襟扣袋帽袜鞋裤裙带链缝线布料棉麻丝毛皮绒纱绸缎针剪尺熨烫洗晾穿脱叠挂柜箱架杆钩环钉珠绣花边长短宽窄厚薄新旧颜色款式号码男女老少夏冬春秋单夹羽绒牛仔针织梭织西装制服睡衣泳装旗袍唐装和服衬衫卫衣毛衣外套夹克风衣大衣背心马甲短裤长裤裙摆裤腰裤脚袖口下摆衣角领带领结腰带皮带围巾手套丝巾胸针袖扣材质']

push({ t: start, type: 'meta', room: 'SAMPLE', sample: true, note: '合成数据，仅用于验证分析管线' })

let chatCount = 0
let giftCount = 0

for (let m = 0; m < DURATION_MIN; m++) {
  // 弹幕密度曲线：开头爬升、中间平稳、结尾冲刺
  const curve = 0.55 + 0.45 * Math.sin((Math.PI * m) / DURATION_MIN) + (m > DURATION_MIN - 6 ? 0.5 : 0)
  const perMinute = Math.round(rand(18, 30) * curve)

  for (let i = 0; i < perMinute; i++) {
    const t = start + m * 60_000 + rand(0, 59_000)
    const user = pickUser()
    const r = Math.random()

    if (r < 0.58) {
      // 正常猜词：从答案附近或噪声词池里取
      const ans = answerAt(m)
      let word
      const r2 = Math.random()
      if (r2 < 0.34) {
        const cs = [...ans.answer]
        word = Math.random() < 0.35 ? pick(cs) : pick(cs) + pick(['子', '儿', '', '头'])
      } else if (r2 < 0.66) {
        word = pick(NOISE_GUESSES)
      } else {
        const n = Math.random() < 0.72 ? 2 : 1
        word = Array.from({ length: n }, () => pick(CHARS)).join('')
      }
      push({ t, type: 'chat', user, text: word })
      chatCount++
    } else if (r < 0.78) {
      // 不按规则玩：整句话
      push({
        t,
        type: 'chat',
        user,
        text: pick(['这是什么', '主播提示一下', '不对吧', '哈哈哈', '我猜到了', '再给点提示', '太难了', '？？？', '不就是那个吗', '666']),
      })
      chatCount++
    } else if (r < 0.9) {
      push({ t, type: 'chat', user, text: pick(['？', '。', '！', '...', '。。。']) })
      chatCount++
    } else if (r < 0.97) {
      push({ t, type: 'like', user, count: Math.round(rand(1, 30)) })
    } else {
      push({ t, type: 'member', user })
    }
  }

  // 礼物：集中在开头和结尾
  const giftRate = m < 8 ? 1.1 : m > DURATION_MIN - 8 ? 1.4 : 0.35
  if (Math.random() < giftRate) {
    const g = pick([
      { gift: '小心心', diamond: 1 },
      { gift: '玫瑰', diamond: 1 },
      { gift: '棒棒糖', diamond: 10 },
      { gift: '为你点亮', diamond: 52 },
      { gift: '粉丝团灯牌', diamond: 60 },
      { gift: '抖音一号', diamond: 1000 },
    ])
    push({
      t: start + m * 60_000 + rand(0, 59_000),
      type: 'gift',
      user: pickUser(),
      gift: g.gift,
      count: Math.random() < 0.3 ? Math.round(rand(2, 20)) : 1,
      diamond: g.diamond,
    })
    giftCount++
  }

  // 在线人数统计
  push({ t: start + m * 60_000 + 30_000, type: 'stats', online: Math.round(rand(600, 2200)) })
}

lines.sort((a, b) => JSON.parse(a).t - JSON.parse(b).t)
fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8')

console.log(`\n  合成样例已生成：${outFile}`)
console.log(`  ${lines.length} 条事件（聊天约 ${chatCount}，礼物 ${giftCount}）`)
console.log(`  时长 ${DURATION_MIN} 分钟，${rounds.length} 局`)
console.log(`\n  ⚠️ 这只是合成数据。真实结论请用 tools/collect.mjs 采回的跑。\n`)
