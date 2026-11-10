// LLM 精排层（可选）
//
// 为什么需要它：小 embedding 模型对短词的知识很有限。
// 实测 bge-small-zh 给「拿铁 vs 咖啡」0.38、「充电宝 vs 手机」0.35，比无关词还低；
// 换成 8B 对话模型直接问，拿铁 85、充电宝 75，和人一致。
//
// 代价与对策
//   - 单次约 1 秒（模型预热后），首次加载约 20 秒
//     → 启动时后台空跑一次把模型加载进内存，不阻塞启动
//   - 一局里有 60–80 个不同的词
//     → 批量：一次请求判 8 对；缓存按「答案|猜测」存盘，同一局内重复的弹幕直接命中
//   - 极端情况下模型很慢
//     → 打分走超时预算（默认 2.5s），超时立刻回落到 embedding 分，绝不卡住直播
//
// 开关：JUDGE=auto|on|off（默认 auto，检测到本地对话模型就启用）

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONFIG = {
  mode: (process.env.JUDGE || 'auto').toLowerCase(),
  baseUrl: (process.env.JUDGE_BASE_URL || process.env.EMBED_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  model: process.env.JUDGE_MODEL || '',
  // 首次调用要等模型加载（本机 7B 约 20 秒），之后每批 8 对约 1.5 秒
  // 服务端是后台复核，等得起；这里给足预算，避免冷启动时全批失败
  timeoutMs: Number(process.env.JUDGE_TIMEOUT_MS || 25000),
  keepAlive: process.env.JUDGE_KEEP_ALIVE || '30m',
  batch: Math.max(1, Math.min(Number(process.env.JUDGE_BATCH || 6), 16)),
  cachePath: process.env.JUDGE_CACHE_PATH || join(process.cwd(), 'data', 'judge-cache.json'),
}

// 优先挑中文能力好、体量适中的本地模型；云端的 :cloud 模型不走这条路
const PREFERRED = ['qwen2.5:7b-instruct-q4_0', 'qwen2.5:7b', 'qwen3:8b', 'qwen2.5-coder:7b', 'llama3:8b-text-q5_K_M']

const keyOf = (guess, answer) => createHash('sha1').update(`${answer}\u0000${guess}`).digest('hex').slice(0, 16)

const cache = new Map()
let ready = false
let enabled = false
let dirty = false
let timer = null
let lastError = ''
let stats = { hit: 0, miss: 0, timeout: 0, calls: 0 }

function loadCache() {
  if (!existsSync(CONFIG.cachePath)) return
  try {
    const raw = JSON.parse(readFileSync(CONFIG.cachePath, 'utf8'))
    for (const [k, v] of Object.entries(raw.scores || {})) cache.set(k, v)
  } catch {
    // 坏了就重算
  }
}

function scheduleFlush() {
  dirty = true
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    if (!dirty) return
    try {
      mkdirSync(join(CONFIG.cachePath, '..'), { recursive: true })
      const tmp = CONFIG.cachePath + '.tmp'
      writeFileSync(tmp, JSON.stringify({ scores: Object.fromEntries(cache) }))
      renameSync(tmp, CONFIG.cachePath)
      dirty = false
    } catch (e) {
      console.warn('[judge] 缓存落盘失败：', e.message)
    }
  }, 1500)
  if (timer.unref) timer.unref()
}

async function detect() {
  if (CONFIG.mode === 'off' || CONFIG.mode === 'false') return false
  try {
    const res = await fetch(`${CONFIG.baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const { models = [] } = await res.json()
    const names = models.filter((m) => !String(m.name).includes(':cloud')).map((m) => m.name)
    if (CONFIG.model) {
      CONFIG.model = names.find((n) => n === CONFIG.model || n.startsWith(CONFIG.model + ':')) || CONFIG.model
      return true
    }
    const hit = PREFERRED.map((p) => names.find((n) => n === p || n.startsWith(p + ':'))).find(Boolean)
    if (hit) {
      CONFIG.model = hit
      return true
    }
    // 没有优先型号时，退而求其次用一个本地 completion 模型
    const any = names.find((n) => !/embed|bge|gte|nomic/i.test(n))
    if (any) {
      CONFIG.model = any
      return true
    }
  } catch {
    // 没起服务就当作不可用
  }
  return false
}

export async function init() {
  if (ready) return info()
  enabled = await detect()
  ready = true
  if (enabled) {
    loadCache()
    // 后台空跑一次，把模型加载进显存/内存，避免第一个观众等 20 秒
    fetch(`${CONFIG.baseUrl}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model: CONFIG.model, prompt: '你好', stream: false, options: { num_predict: 1 } }),
      signal: AbortSignal.timeout(120_000),
    }).catch(() => {})
  }
  return info()
}

export function info() {
  return {
    enabled,
    model: enabled ? CONFIG.model : '未启用',
    cached: cache.size,
    timeoutMs: CONFIG.timeoutMs,
    batch: CONFIG.batch,
    stats: { ...stats },
    error: lastError || null,
  }
}

export function isReady() {
  return enabled
}

const PROMPT_HEAD = `你是中文词语关联度裁判。下面每行是「答案词 | 玩家猜词」，请为每一对打 0-100 的整数分。

打分尺度：
90-100：同义或几乎就是答案本身
70-89：同类中的具体品种，或答案的直接组成部分
50-69：同一大类但不同项
30-49：有一点关联但比较远
0-29：基本无关

参考样例（务必按这个尺度对齐，不要自己另立标准）：
咖啡 | 拿铁 = 85
咖啡 | 奶茶 = 60
咖啡 | 苹果 = 5
手机 | 充电宝 = 75
手机 | 电脑 = 55
小狗 | 猫 = 70
小狗 | 老虎 = 30
小狗 | 鲸鱼 = 20
衣襟 | 领口 = 80
衣襟 | 衬衫 = 45
纽扣 | 拉链 = 65

只输出一个 JSON 数组，顺序与输入完全一致，不要任何解释。例如：[85, 20, 55]`

async function callModel(pairs, budget = CONFIG.timeoutMs) {
  const body = pairs.map(([g, a], i) => `${i + 1}. ${a} | ${g}`).join('\n')
  const t0 = Date.now()
  const res = await fetch(`${CONFIG.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.model,
      prompt: `${PROMPT_HEAD}\n\n${body}`,
      stream: false,
      format: 'json',
      keep_alive: CONFIG.keepAlive,
      options: { temperature: 0, num_predict: 24 + pairs.length * 8, num_ctx: 1024 },
    }),
    signal: AbortSignal.timeout(budget),
  })
  stats.calls += 1
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const text = String(data.response || '')
  // 模型可能返回 [85,20]、{"scores":[85,20]} 或 {"关联度":[85,20]}，一律递归取数字
  const collect = (v, out = []) => {
    if (typeof v === 'number') out.push(v)
    else if (Array.isArray(v)) for (const x of v) collect(x, out)
    else if (v && typeof v === 'object') for (const x of Object.values(v)) collect(x, out)
    return out
  }
  let nums = []
  try {
    nums = collect(JSON.parse(text))
  } catch {
    nums = [...text.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]))
  }
  nums = nums.map(Number).filter((n) => Number.isFinite(n))
  if (nums.length !== pairs.length) throw new Error(`返回数量不符：期望 ${pairs.length}，实际 ${nums.length}（${text.slice(0, 60)}）`)
  return { scores: nums.map((n) => Math.max(0, Math.min(100, Math.round(n)))), ms: Date.now() - t0 }
}

/**
 * 批量精排
 * @param {Array<[string,string]>} pairs [猜测, 答案]
 * @returns {Promise<Map<string,{score:number, ms:number}>>} key = guess|answer
 */
export async function judgeBatch(pairs) {
  const out = new Map()
  if (!enabled) return out

  const missing = []
  for (const [g, a] of pairs) {
    const k = keyOf(g, a)
    if (cache.has(k)) {
      stats.hit += 1
      out.set(`${g}|${a}`, { score: cache.get(k), cached: true })
    } else {
      missing.push([g, a, k])
    }
  }
  if (!missing.length) return out

  for (let i = 0; i < missing.length; i += CONFIG.batch) {
    const chunk = missing.slice(i, i + CONFIG.batch)
    let result = null
    let lastErr = null
    // 冷启动第一次常常要等模型加载，超时后放大预算重试一次
    for (const budget of [CONFIG.timeoutMs, CONFIG.timeoutMs * 2]) {
      try {
        result = await callModel(
          chunk.map(([g, a]) => [g, a]),
          budget,
        )
        break
      } catch (e) {
        lastErr = e
        if (!/timeout|aborted/i.test(e.message)) break
      }
    }
    if (!result) {
      if (lastErr && /timeout|aborted/i.test(lastErr.message)) stats.timeout += chunk.length
      lastError = lastErr ? lastErr.message : 'unknown'
      continue
    }
    chunk.forEach(([g, a, k], j) => {
      const v = result.scores[j]
      if (v == null) return
      cache.set(k, v)
      out.set(`${g}|${a}`, { score: v, ms: result.ms })
    })
    stats.miss += chunk.length
    scheduleFlush()
  }
  return out
}

/** 带预算的单次判定：超时立刻返回 null，由调用方回落 */
export function judgeWithBudget(guess, answer) {
  if (!enabled) return Promise.resolve(null)
  const k = keyOf(guess, answer)
  if (cache.has(k)) {
    stats.hit += 1
    return Promise.resolve(cache.get(k))
  }
  return judgeBatch([[guess, answer]]).then((m) => {
    const hit = m.get(`${guess}|${answer}`)
    return hit ? hit.score : null
  })
}
