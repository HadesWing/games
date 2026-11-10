// 采集器：把弹幕原始事件记成 JSONL，供后续分析
//
// 和 ingest.mjs 的分工：
//   ingest.mjs  → 灌进猜词游戏，实时玩
//   collect.mjs → 原样存盘，事后分析
//
// 用法：
//   node tools/collect.mjs ws ws://127.0.0.1:8888 --room 745964462470
//   python main.py | node tools/collect.mjs stdin --room 745964462470
//
// 输出：data/<room>-<YYYYMMDD-HHmm>.jsonl，一行一个事件
// 停止：Ctrl+C（会 flush 后退出）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')

const argv = process.argv.slice(2)
const mode = argv[0] || 'stdin'
const target = argv[1] && !argv[1].startsWith('--') ? argv[1] : 'ws://127.0.0.1:8888'
const room = (argv.find((a) => a.startsWith('--room=')) || '').split('=')[1] ||
  (argv.includes('--room') ? argv[argv.indexOf('--room') + 1] : 'unknown')

fs.mkdirSync(DATA, { recursive: true })

const now = new Date()
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
const outFile = path.join(DATA, `${room}-${stamp}.jsonl`)

// ---------- 带缓冲的写入（弹幕高峰期一秒几百条，不能每条都 appendFileSync）----------
let buf = []
let flushTimer = null
let written = 0
const counts = { chat: 0, gift: 0, like: 0, member: 0, social: 0, stats: 0, other: 0 }

function write(rec) {
  buf.push(JSON.stringify(rec))
  counts[rec.type] = (counts[rec.type] || 0) + 1
  if (buf.length >= 200) flush()
  if (!flushTimer) flushTimer = setTimeout(flush, 300)
}

function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!buf.length) return
  fs.appendFileSync(outFile, buf.join('\n') + '\n')
  written += buf.length
  buf = []
}

// ---------- 归档头 ----------
fs.appendFileSync(
  outFile,
  JSON.stringify({ t: Date.now(), type: 'meta', room, mode, source: process.env.SOURCE || '' }) + '\n',
)

// ---------- 字段抽取（不同抓取工具字段名不一样，这里尽量宽松）----------
function pick(o, keys) {
  for (const k of keys) {
    const v = k.split('.').reduce((x, p) => (x == null ? x : x[p]), o)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

function toEvent(obj) {
  const o = obj && obj.Data ? obj.Data : obj
  if (!o || typeof o !== 'object') return null

  const rawType = String(pick(o, ['Type', 'type', 'MsgType', 'Method', 'method']) || '')
  const user = String(pick(o, ['User.Nickname', 'user.nickname', 'Nickname', 'nickname', 'UserName', 'userName']) || '')
    .slice(0, 30)

  // 礼物
  const giftName = pick(o, ['Gift.Name', 'gift.name', 'GiftName', 'giftName'])
  if (giftName || /gift/i.test(rawType)) {
    return {
      t: Date.now(),
      type: 'gift',
      user,
      gift: String(giftName || 'unknown'),
      count: Number(pick(o, ['GiftCount', 'giftCount', 'RepeatCount', 'repeatCount', 'Count']) || 1),
      diamond: Number(pick(o, ['Gift.DiamondCount', 'gift.diamondCount', 'DiamondCount', 'diamondCount']) || 0),
    }
  }

  // 点赞
  const likeCount = pick(o, ['Count', 'count', 'LikeCount', 'likeCount'])
  if (/like/i.test(rawType) && likeCount != null) {
    return { t: Date.now(), type: 'like', user, count: Number(likeCount) || 1 }
  }

  // 进场
  if (/member|enter/i.test(rawType)) return { t: Date.now(), type: 'member', user }

  // 关注
  if (/social|follow/i.test(rawType)) return { t: Date.now(), type: 'social', user }

  // 统计（在线人数）
  const online = pick(o, ['ViewerCount', 'viewerCount', 'OnlineCount', 'onlineCount'])
  if (online != null) return { t: Date.now(), type: 'stats', online: Number(online) || 0 }

  // 聊天
  const text = pick(o, ['Content', 'content', 'Msg', 'msg', 'Text', 'text', 'Comment', 'comment'])
  if (text) {
    return {
      t: Date.now(),
      type: 'chat',
      user,
      text: String(text)
        .replace(/\[[^\]]*\]/g, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .trim()
        .slice(0, 60),
    }
  }

  return { t: Date.now(), type: 'other', raw: String(rawType).slice(0, 40) }
}

// DouyinLiveWebFetcher 的控制台行格式
const LINE_RE = /【(聊天|礼物|点赞|进场|统计|粉丝团)msg】(.+)$/

function fromLine(line) {
  const m = line.match(LINE_RE)
  if (!m) return null
  const [, kind, rest] = m
  const t = Date.now()

  if (kind === '聊天') {
    const mm = rest.match(/\[?(\d+)?\]?([^:：]+)[:：]\s*(.+)$/)
    if (!mm) return null
    return { t, type: 'chat', user: mm[2].trim().slice(0, 30), text: mm[3].trim().slice(0, 60) }
  }
  if (kind === '礼物') {
    // X L 送出了 为你点亮x1
    const mm = rest.match(/^(.+?)\s*送出了\s*(.+?)x(\d+)\s*$/)
    if (!mm) return { t, type: 'gift', user: '', gift: rest.trim().slice(0, 30), count: 1, diamond: 0 }
    return { t, type: 'gift', user: mm[1].trim().slice(0, 30), gift: mm[2].trim().slice(0, 30), count: Number(mm[3]), diamond: 0 }
  }
  if (kind === '点赞') {
    const mm = rest.match(/^(.+?)\s*点了(\d+)个赞/)
    return mm ? { t, type: 'like', user: mm[1].trim().slice(0, 30), count: Number(mm[2]) } : null
  }
  if (kind === '进场') {
    const mm = rest.match(/\]\s*(.+?)\s*进入了直播间/)
    return { t, type: 'member', user: mm ? mm[1].trim().slice(0, 30) : '' }
  }
  if (kind === '统计') {
    const mm = rest.match(/当前观看人数:\s*(\d+)/)
    return mm ? { t, type: 'stats', online: Number(mm[1]) } : null
  }
  return null
}

// ---------- 运行 ----------
console.log(`\n  采集目标：${room}`)
console.log(`  输出文件：${outFile}\n`)

if (mode === 'ws') {
  const connect = () => {
    const ws = new WebSocket(target)
    ws.onopen = () => console.log(`[${ts()}] 已连接 ${target}`)
    ws.onerror = () => {}
    ws.onclose = () => {
      flush()
      console.log(`[${ts()}] 连接断开，3 秒后重连`)
      setTimeout(connect, 3000)
    }
    ws.onmessage = (ev) => {
      let obj
      try {
        obj = JSON.parse(ev.data)
      } catch {
        return
      }
      const e = toEvent(obj)
      if (e) write(e)
    }
  }
  connect()
}

if (mode === 'stdin') {
  process.stdin.setEncoding('utf8')
  let rest = ''
  process.stdin.on('data', (chunk) => {
    rest += chunk
    const lines = rest.split(/\r?\n/)
    rest = lines.pop() || ''
    for (const line of lines) {
      const e = fromLine(line)
      if (e) write(e)
    }
  })
  process.stdin.on('end', () => {
    flush()
    summary()
    process.exit(0)
  })
}

function ts() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function summary() {
  flush()
  console.log(`\n  已写入 ${written} 条`)
  console.log(
    `  聊天 ${counts.chat || 0} · 礼物 ${counts.gift || 0} · 点赞 ${counts.like || 0} · 进场 ${counts.member || 0}`,
  )
  console.log(`  文件：${outFile}\n`)
}

// 每 10 秒报一次进度，方便确认还在跑
setInterval(() => {
  if (written) console.log(`[${ts()}] 累计 ${written} 条 · 聊天 ${counts.chat || 0} · 礼物 ${counts.gift || 0}`)
}, 10_000)

// 退出时兜底 flush
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    summary()
    process.exit(0)
  })
}
