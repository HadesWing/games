// 弹幕桥接器：把外部抓到的弹幕灌进本地猜词服务
//
// ⚠️ 未实测。代码是按公开的协议/输出格式写的，字段映射需要按你实际使用的
//    抓取工具的真实输出调整。第一次跑请先加 --dry 看一眼抓到的东西对不对。
//
// 用法：
//   1) 从代理类工具（如 DouyinBarrageGrab，本地 ws://127.0.0.1:8888）接：
//        node ingest.mjs ws ws://127.0.0.1:8888
//
//   2) 从 Python 抓取工具的控制台输出接（管道）：
//        python main.py | node ingest.mjs stdin
//
//   3) 先干跑，只打印不提交：
//        node ingest.mjs ws ws://127.0.0.1:8888 --dry
//
// 依赖：Node 18+（内置 fetch；Node 22 起内置 WebSocket）

const args = process.argv.slice(2)
const mode = args[0] || 'stdin'
const target = args[1]
const DRY = args.includes('--dry')
const API = process.env.API || 'http://127.0.0.1:8830/api/guess'

const MAX_LEN = 8 // 超过这个长度不当作猜词
const RATE_LIMIT = 30 // 每秒最多提交多少条，防止刷爆

let windowStart = Date.now()
let windowCount = 0
const recent = new Map() // 去重：同一个人同一个词 5 秒内只提交一次

function clean(raw) {
  if (typeof raw !== 'string') return ''
  // 去表情、去首尾空格、去零宽字符
  return raw
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
}

// 从不同工具的输出里尽量宽松地抽出 { user, text }
function extract(obj) {
  const o = obj && obj.Data ? obj.Data : obj
  if (!o || typeof o !== 'object') return null

  const text =
    o.Content ?? o.content ?? o.Msg ?? o.msg ?? o.Text ?? o.text ?? o.Comment ?? o.comment

  const user =
    o.User?.Nickname ??
    o.user?.nickname ??
    o.Nickname ??
    o.nickname ??
    o.UserName ??
    o.userName ??
    o.User?.nickName ??
    '观众'

  if (!text) return null
  return { user: String(user).slice(0, 20), text: clean(String(text)) }
}

// 兜底：从 DouyinLiveWebFetcher 风格的文本行里正则抽
// 形如：【聊天msg】[67197561586]说谎: 去拿
const LINE_RE = /【聊天msg】\S*?\]\s*([^:：]+)[:：]\s*(.+)$/

function fromLine(line) {
  const m = line.match(LINE_RE)
  if (!m) return null
  return { user: m[1].trim().slice(0, 20), text: clean(m[2]) }
}

async function submit({ user, text }) {
  if (!text) return
  const n = [...text].length
  if (n < 1 || n > MAX_LEN) return

  const key = user + '|' + text
  const now = Date.now()
  const last = recent.get(key) || 0
  if (now - last < 5000) return
  recent.set(key, now)
  if (recent.size > 3000) recent.clear()

  if (now - windowStart > 1000) {
    windowStart = now
    windowCount = 0
  }
  if (++windowCount > RATE_LIMIT) return

  if (DRY) {
    console.log('[dry]', user, '→', text)
    return
  }

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, text }),
    })
    const j = await r.json()
    if (j.ok) console.log(`${user} → ${text}  ${j.score}${j.hit ? '  ★猜中' : ''}`)
  } catch (e) {
    console.error('提交失败（本地服务没起？）', e.message)
  }
}

// ---------- ws 模式 ----------
if (mode === 'ws') {
  const url = target || 'ws://127.0.0.1:8888'
  const ws = new WebSocket(url)
  console.log(`连接 ${url} …`)
  ws.onopen = () => console.log('已连接，等待弹幕')
  ws.onerror = (e) => console.error('连接错误', e.message || e)
  ws.onclose = () => {
    console.error('连接断开，10 秒后重连')
    setTimeout(() => process.exit(1), 1000) // 交给外面的 supervisor 重启
  }
  ws.onmessage = (ev) => {
    let obj
    try {
      obj = JSON.parse(ev.data)
    } catch {
      return
    }
    // 只处理聊天消息（不同工具用 Type / MsgType / Method 区分）
    const type = obj.Type ?? obj.type ?? obj.MsgType ?? obj.Method ?? ''
    if (type && !/chat|Chat|1/.test(String(type))) return
    const item = extract(obj)
    if (item) submit(item)
  }
}

// ---------- stdin 模式 ----------
if (mode === 'stdin') {
  process.stdin.setEncoding('utf8')
  let buf = ''
  process.stdin.on('data', (chunk) => {
    buf += chunk
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() || ''
    for (const line of lines) {
      const item = fromLine(line)
      if (item) submit(item)
    }
  })
  process.stdin.on('end', () => process.exit(0))
  console.log('从 stdin 读弹幕中…')
}
