// 弹幕猜词 · 本地可玩原型
// 零 npm 依赖，只用 Node 内置模块。node server.mjs 即可启动。
// 作用：在接入真实抖音弹幕之前，先验证「关联度算法 + 交互节奏 + 叠层画面」是否成立

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { score, warmup, engineInfo } from './lib/score.mjs'
import * as judge from './lib/judge.mjs'
import { ANSWER_POOL, NOISE_GUESSES, FAKE_USERS, INDEX } from './lib/lexicon.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8830)
const ROUND_MS = Number(process.env.ROUND_MS || 90_000)
const BOT_MS = Number(process.env.BOT_MS || 1800)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// ---------- 游戏状态 ----------
const state = {
  round: 0,
  answer: '',
  category: '',
  startedAt: 0,
  endsAt: 0,
  status: 'playing', // playing | revealed
  board: [], // { user, word, score, hit, at }
  pending: new Set(), // 正在算分的词，防止并发时同一个词被加两次
  guessCount: 0,
  autopilot: true,
  hints: [],
  hintOpen: 0,
  history: [], // 已揭晓的历史局
}

function makeHints(answer, category) {
  const cs = [...answer]
  // 2 字题不能给「第 2 个字是 X」——那等于把答案念出来。
  // 第三提示改成同类的细分类（配件 / 大家电 / 主食），既收窄范围又不泄题。
  const cluster = INDEX.get(answer)?.cluster || category
  return [
    `${cs.length} 个字，属于「${category}」`,
    `第 1 个字是「${cs[0]}」`,
    cs.length >= 3 ? `第 2 个字是「${cs[1]}」` : `它属于「${cluster}」这一类`,
  ]
}

const clients = new Set()

function broadcast() {
  const payload = `data: ${JSON.stringify(snapshot())}\n\n`
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      clients.delete(res)
    }
  }
}

function snapshot() {
  const now = Date.now()
  // 按词去重：同一个词被多人猜只保留最高分那条，观感更接近真实直播间榜单
  const seen = new Set()
  const dedup = []
  for (const e of state.board) {
    if (seen.has(e.word)) continue
    seen.add(e.word)
    dedup.push(e)
  }
  return {
    round: state.round,
    answer: state.answer,
    category: state.category,
    status: state.status,
    remain: Math.max(0, Math.ceil((state.endsAt - now) / 1000)),
    total: Math.round(ROUND_MS / 1000),
    guessCount: state.guessCount,
    autopilot: state.autopilot,
    hints: state.hints,
    hintOpen: state.hintOpen,
    engine: engineInfo(),
    board: dedup.slice(0, 12),
    history: state.history.slice(-5).reverse(),
  }
}

function newRound() {
  const item = pick(ANSWER_POOL)
  state.round += 1
  state.answer = item.answer
  state.category = item.category
  state.startedAt = Date.now()
  state.endsAt = state.startedAt + ROUND_MS
  state.status = 'playing'
  state.board = []
  state.pending.clear()
  state.guessCount = 0
  state.hints = makeHints(item.answer, item.category)
  state.hintOpen = 1
  broadcast()
}

// 后台复核：本地大模型给出的关联度和 embedding 差得多时，直接修正榜单上这一条
// 注意这里复用完整的三路打分（含字面与读音），而不是单取模型的分：
// 模型会漏判谐音（「衣巾」对「衣襟」它只给 60），结构证据必须能纠正它
async function refineScore(entry, word, answer) {
  if (!judge.isReady()) return
  try {
    const r = await score(word, answer)
    if (state.answer !== answer) return // 已经换局，丢弃
    if (!state.board.includes(entry)) return
    if (Math.abs(r.score - entry.score) < 1 && r.reason === entry.reason) return
    entry.score = r.score
    entry.reason = r.reason
    entry.refined = true
    state.board.sort((x, y) => y.score - x.score || x.at - y.at)
    broadcast()
  } catch {
    // 复核失败就保留 embedding 分，不影响游戏
  }
}

async function submitGuess(user, text) {
  if (state.status !== 'playing') return { ok: false, reason: 'round-over' }
  const word = String(text).trim().slice(0, 8)
  if (!word) return { ok: false, reason: 'empty' }

  // 同一个词本局只留一条（不管谁猜的），避免榜单被同一个词刷屏
  if (state.board.some((e) => e.word === word) || state.pending.has(word)) {
    return { ok: false, reason: 'duplicate' }
  }

  const roundNo = state.round
  const answer = state.answer
  state.guessCount += 1
  state.pending.add(word)

  let s
  let hit
  let reason = ''
  try {
    // judge:false → 只取 embedding + 字面 + 读音，毫秒级返回；精排在后台补
    ;({ score: s, hit, reason } = await score(word, answer, { judge: false }))
  } finally {
    state.pending.delete(word)
  }

  // 算分期间已经换局了，这条结果作废，否则会污染下一局的榜单
  if (roundNo !== state.round) return { ok: false, reason: 'round-changed' }

  const entry = { user, word, score: s, hit, reason, at: Date.now() }
  state.board.push(entry)
  state.board.sort((x, y) => y.score - x.score || x.at - y.at)
  if (state.board.length > 40) state.board.length = 40

  // 先给 embedding 分让观众立刻看到，再让本地大模型在后台复核
  // 复核回来如果差异明显，直接改这一条的分数并广播，观众看到的是"分数自己往上走了一点"
  if (!hit) refineScore(entry, word, answer)

  if (hit) {
    state.status = 'revealed'
    state.endsAt = Date.now() + 4000
    state.history.push({ round: state.round, answer: state.answer, winner: user, word })
    setTimeout(() => {
      if (state.status === 'revealed') newRound()
    }, 4200)
  }

  broadcast()
  return { ok: true, score: s, hit }
}

// ---------- 机器人：让本地页面看起来像真直播间 ----------
function botTick() {
  if (!state.autopilot || state.status !== 'playing') return
  const user = pick(FAKE_USERS)
  // 28% 概率用答案里的字，模拟「差一点点」；其余用噪声词，模拟真实弹幕分布
  let word
  if (Math.random() < 0.28) {
    const ans = state.answer
    word = [...ans][Math.floor(Math.random() * [...ans].length)] + (Math.random() < 0.5 ? '' : pick(['子', '儿', '头']))
  } else {
    word = pick(NOISE_GUESSES)
  }
  submitGuess(user, word).catch((e) => console.warn('[bot] 打分失败：', e.message))
}

// ---------- 计时 ----------
setInterval(() => {
  if (state.status !== 'playing') return
  if (Date.now() >= state.endsAt) {
    state.status = 'revealed'
    state.endsAt = Date.now() + 5000
    state.history.push({ round: state.round, answer: state.answer, winner: null, word: null })
    broadcast()
    setTimeout(() => {
      if (state.status === 'revealed') newRound()
    }, 5000)
  } else {
    broadcast()
  }
}, 1000)

setInterval(botTick, BOT_MS)

// ---------- HTTP ----------
function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e6) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const p = url.pathname

  if (p === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  if (p === '/api/state') return json(res, 200, snapshot())

  if (p === '/api/guess' && req.method === 'POST') {
    const body = await readBody(req)
    const user = String(body.user || '我').slice(0, 20)
    return json(res, 200, await submitGuess(user, body.text))
  }

  if (p === '/api/engine') return json(res, 200, engineInfo())

  if (p === '/api/next' && req.method === 'POST') {
    newRound()
    return json(res, 200, { ok: true })
  }

  if (p === '/api/hint' && req.method === 'POST') {
    if (state.hintOpen < state.hints.length) state.hintOpen += 1
    broadcast()
    return json(res, 200, { ok: true, hintOpen: state.hintOpen })
  }

  if (p === '/api/autopilot' && req.method === 'POST') {
    const body = await readBody(req)
    state.autopilot = Boolean(body.on)
    broadcast()
    return json(res, 200, { ok: true, autopilot: state.autopilot })
  }

  if (p === '/api/simulate' && req.method === 'POST') {
    const body = await readBody(req)
    return json(res, 200, await submitGuess(String(body.user || pick(FAKE_USERS)), body.text || pick(NOISE_GUESSES)))
  }

  // 静态文件
  let filePath = p === '/' ? '/index.html' : p
  filePath = path.join(__dirname, 'public', path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''))
  if (!filePath.startsWith(path.join(__dirname, 'public'))) return json(res, 403, { error: 'forbidden' })

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('404')
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(buf)
  })
})

console.log('\n  弹幕猜词 · 本地原型')
console.log('  正在初始化语义引擎…')
const engine = await warmup()
if (engine.enabled) {
  const c = engine.calib
  console.log(`  ✓ embedding: ${engine.provider} / ${engine.model}  (${engine.dim} 维，缓存 ${engine.cached} 条)`)
  if (c) console.log(`  ✓ 校准: 不相关基准 ${c.muU} · 相关基准 ${c.muR} · σ ${c.sigma}`)
  if (engine.note) console.log(`  ! ${engine.note}`)
} else {
  console.log(`  ! 未检测到 embedding 模型，退回纯图谱模式（功能可用，语义精度下降）`)
  console.log('    启用方式：ollama pull bge-m3')
}

newRound()
server.listen(PORT, () => {
  console.log(`  打开: http://127.0.0.1:${PORT}\n`)
})
