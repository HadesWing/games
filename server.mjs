// 弹幕猜词 · 本地可玩原型
// 零 npm 依赖，只用 Node 内置模块。node server.mjs 即可启动。
// 作用：在接入真实抖音弹幕之前，先验证「关联度算法 + 交互节奏 + 叠层画面」是否成立

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { score } from './lib/score.mjs'
import { ANSWER_POOL, NOISE_GUESSES, FAKE_USERS } from './lib/lexicon.mjs'

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
  guessCount: 0,
  autopilot: true,
  hints: [],
  hintOpen: 0,
  history: [], // 已揭晓的历史局
}

function makeHints(answer, category) {
  const cs = [...answer]
  return [
    `${cs.length} 个字，属于「${category}」`,
    `第 1 个字是「${cs[0]}」`,
    `第 2 个字是「${cs[1] || '?'}」，最后一个字是「${cs[cs.length - 1]}」`,
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
  state.guessCount = 0
  state.hints = makeHints(item.answer, item.category)
  state.hintOpen = 1
  broadcast()
}

function submitGuess(user, text) {
  if (state.status !== 'playing') return { ok: false, reason: 'round-over' }
  const word = String(text).trim().slice(0, 8)
  if (!word) return { ok: false, reason: 'empty' }
  state.guessCount += 1

  // 同一个词本局只留一条（不管谁猜的），避免榜单被同一个词刷屏
  if (state.board.some((e) => e.word === word)) {
    return { ok: false, reason: 'duplicate' }
  }

  const { score: s, hit } = score(word, state.answer)

  state.board.push({ user, word, score: s, hit, at: Date.now() })
  state.board.sort((x, y) => y.score - x.score || x.at - y.at)
  if (state.board.length > 40) state.board.length = 40

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
  // 40% 概率用图谱附近的词，60% 用噪声词，模拟真实弹幕分布
  let word
  if (Math.random() < 0.28) {
    const ans = state.answer
    // 从答案里拆一个字，制造「差一点点」的效果
    word = [...ans][Math.floor(Math.random() * [...ans].length)] + (Math.random() < 0.5 ? '' : pick(['子', '儿', '头']))
  } else {
    word = pick(NOISE_GUESSES)
  }
  submitGuess(user, word)
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
    return json(res, 200, submitGuess(user, body.text))
  }

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
    return json(res, 200, submitGuess(String(body.user || pick(FAKE_USERS)), body.text || pick(NOISE_GUESSES)))
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

newRound()
server.listen(PORT, () => {
  console.log(`\n  弹幕猜词 · 本地原型已启动`)
  console.log(`  打开: http://127.0.0.1:${PORT}\n`)
})
