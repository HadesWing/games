// 语义向量层：把「词」变成向量，用余弦相似度衡量词意接近程度
//
// 设计要点
//   1. provider 可插拔：ollama（本地）/ openai 兼容（云端）/ off（纯图谱）
//   2. 批量 embedding：一次请求算一批词，避免每词一次 HTTP
//   3. 两级缓存：内存 Map + data/embed-cache.json 落盘，开播时不必重算
//   4. 相似度校准：原始余弦值挤在 0.3–0.8，必须映射到 0–100 才有区分度
//
// 配置（全部走环境变量 / .env，代码里不出现任何密钥）
//   EMBED_PROVIDER=ollama|openai|off
//   EMBED_BASE_URL=http://127.0.0.1:11434
//   EMBED_MODEL=bge-m3
//   EMBED_API_KEY=sk-xxxx        # 只有 openai 兼容的云端才需要

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------- 极简 .env 读取（零依赖，缺文件不报错） ----------
function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(process.cwd(), name)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const eq = s.indexOf('=')
      if (eq < 0) continue
      const k = s.slice(0, eq).trim()
      let v = s.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!(k in process.env)) process.env[k] = v
    }
  }
}
loadEnv()

export const CONFIG = {
  provider: (process.env.EMBED_PROVIDER || 'auto').toLowerCase(),
  baseUrl: process.env.EMBED_BASE_URL || '',
  model: process.env.EMBED_MODEL || '',
  apiKey: process.env.EMBED_API_KEY || '',
  timeoutMs: Number(process.env.EMBED_TIMEOUT_MS || 8000),
  cachePath: process.env.EMBED_CACHE_PATH || join(process.cwd(), 'data', 'embed-cache.json'),
}

const DEFAULTS = {
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'bge-m3' },
  openai: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'BAAI/bge-m3' },
}

// ---------- 缓存 ----------
const memCache = new Map() // key → number[]
let meta = { provider: '', model: '', dim: 0, calib: null }
let dirty = false
let flushTimer = null

const keyOf = (text) => createHash('sha1').update(meta.model + '\u0000' + text).digest('hex').slice(0, 16)

function loadCache() {
  if (!existsSync(CONFIG.cachePath)) return
  try {
    const raw = JSON.parse(readFileSync(CONFIG.cachePath, 'utf8'))
    if (raw.model !== meta.model) return // 换模型即作废旧向量
    if (raw.calib) meta.calib = raw.calib
    for (const [k, v] of Object.entries(raw.vectors || {})) memCache.set(k, v)
  } catch {
    // 缓存损坏就当没有，重新算
  }
}

function flush(force = false) {
  if (!dirty && !force) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    mkdirSync(join(CONFIG.cachePath, '..'), { recursive: true })
    const tmp = CONFIG.cachePath + '.tmp'
    writeFileSync(tmp, JSON.stringify({ meta: { model: meta.model, dim: meta.dim }, calib: meta.calib, vectors: Object.fromEntries(memCache) }))
    renameSync(tmp, CONFIG.cachePath) // 原子替换，避免写一半断电留下坏文件
    dirty = false
  } catch (e) {
    console.warn('[embed] 缓存落盘失败：', e.message)
  }
}

function scheduleFlush() {
  dirty = true
  if (flushTimer) return
  flushTimer = setTimeout(() => flush(), 1500)
  if (flushTimer.unref) flushTimer.unref()
}

// ---------- provider ----------
async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CONFIG.timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`)
  }
  return res.json()
}

const PROVIDERS = {
  async ollama(texts) {
    const data = await post(
      `${CONFIG.baseUrl}/api/embed`,
      { model: CONFIG.model, input: texts, truncate: true },
    )
    if (!Array.isArray(data.embeddings)) throw new Error('ollama 返回格式异常')
    return data.embeddings
  },

  async openai(texts) {
    if (!CONFIG.apiKey) throw new Error('缺少 EMBED_API_KEY')
    const data = await post(
      `${CONFIG.baseUrl.replace(/\/$/, '')}/embeddings`,
      { model: CONFIG.model, input: texts, encoding_format: 'float' },
      { authorization: `Bearer ${CONFIG.apiKey}` },
    )
    return (data.data || []).map((d) => d.embedding)
  },
}

async function detectProvider() {
  const wanted = CONFIG.provider
  if (wanted === 'off' || wanted === 'graph') return null
  if (wanted === 'ollama' || wanted === 'openai') {
    CONFIG.baseUrl = CONFIG.baseUrl || DEFAULTS[wanted].baseUrl
    CONFIG.model = CONFIG.model || DEFAULTS[wanted].model
    return wanted
  }
  // auto：先探本地 ollama，再探云端
  try {
    const res = await fetch(`${DEFAULTS.ollama.baseUrl}/api/tags`, { signal: AbortSignal.timeout(1200) })
    if (res.ok) {
      const tags = await res.json()
      const names = (tags.models || []).map((m) => m.name)
      const pick = ['bge-m3', 'bge-m3:latest', 'quentinz/bge-small-zh-v1.5', 'nomic-embed-text']
        .find((n) => names.includes(n) || names.includes(n + ':latest'))
      if (pick) {
        CONFIG.baseUrl = CONFIG.baseUrl || DEFAULTS.ollama.baseUrl
        CONFIG.model = CONFIG.model || pick
        return 'ollama'
      }
    }
  } catch {
    // 本地没起服务，继续往下试
  }
  if (CONFIG.apiKey && CONFIG.baseUrl) {
    CONFIG.model = CONFIG.model || DEFAULTS.openai.model
    return 'openai'
  }
  return null
}

// ---------- 对外 API ----------
let provider = null
let ready = false
let lastError = ''

export async function init() {
  if (ready) return info()
  provider = await detectProvider()
  if (!provider) {
    ready = true
    return info()
  }
  meta = { provider, model: CONFIG.model, dim: 0, calib: meta.calib }
  loadCache()
  ready = true
  return info()
}

export function info() {
  return {
    enabled: Boolean(provider),
    provider: provider || 'off',
    model: provider ? CONFIG.model : '图谱模式',
    dim: meta.dim || 0,
    cached: memCache.size,
    calib: meta.calib || null,
    error: lastError || null,
  }
}

export function isReady() {
  return Boolean(provider) && ready
}

/** 批量取向量；已缓存的直接命中，只把没算过的发给模型 */
export async function embedMany(texts) {
  const list = [...new Set((texts || []).filter((t) => typeof t === 'string' && t.trim()))]
  const out = new Map()
  const missing = []

  for (const t of list) {
    const k = keyOf(t)
    if (memCache.has(k)) out.set(t, memCache.get(k))
    else missing.push(t)
  }
  if (!missing.length || !provider) return out

  const fn = PROVIDERS[provider]
  // 一次最多 16 条：太多会撑爆小模型的上下文，也让单次请求变慢
  for (let i = 0; i < missing.length; i += 16) {
    const chunk = missing.slice(i, i + 16)
    try {
      const vecs = await fn(chunk)
      vecs.forEach((v, j) => {
        if (!Array.isArray(v)) return
        const rounded = v.map((x) => Math.round(x * 1e5) / 1e5)
        memCache.set(keyOf(chunk[j]), rounded)
        out.set(chunk[j], rounded)
        meta.dim = rounded.length
      })
      scheduleFlush()
    } catch (e) {
      lastError = e.message
      console.warn('[embed] 计算失败，本批退回图谱：', e.message)
    }
  }
  return out
}

export async function embed(text) {
  const m = await embedMany([text])
  return m.get(text) || null
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}

// ---------- 校准 ----------
// 原始余弦的问题：不相关的词也有 0.3–0.45，同义/上下位 0.6–0.85，跨度太窄，直接 ×100 看不出差别。
// 解法是双锚点分段线性：
//   muU（跨分类随机词对的均值）→ 8 分，代表"没关系的两个词"
//   muR（已知相关词对的中位数）  → 90 分，代表"明显沾边"
// 中间线性插值，两侧收敛到 3 / 97。参数落盘，保证同一批词每次跑出来的分数完全一致。
export function calibrate({ unrelated = [], related = [] } = {}) {
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)
  const median = (a) => {
    if (!a.length) return null
    const s = [...a].sort((x, y) => x - y)
    return s[Math.floor(s.length / 2)]
  }
  const muU = mean(unrelated)
  const muR = median(related)
  if (muU == null || muR == null) return meta.calib
  const sd = Math.sqrt(unrelated.reduce((s, v) => s + (v - muU) ** 2, 0) / unrelated.length) || 0.05
  meta.calib = {
    muU: +muU.toFixed(4),
    muR: +muR.toFixed(4),
    sigma: +sd.toFixed(4),
    nU: unrelated.length,
    nR: related.length,
  }
  scheduleFlush()
  return meta.calib
}

export function hasCalib() {
  return Boolean(meta.calib)
}

export function setCalib(c) {
  meta.calib = c
  scheduleFlush()
}

/** 余弦 → 0–100 分（三段线性，顶部收窄，避免一律顶满） */
export function toScore(sim, calib = meta.calib) {
  const lo = calib?.muU ?? 0.42
  const hi = calib?.muR ?? 0.62
  const span = Math.max(hi - lo, 0.02)

  // 低于「不相关」基准：3–8 分，越远越低
  if (sim <= lo) {
    const tail = Math.max(lo - 0.08, 0.04)
    return Math.max(3, 8 - ((lo - sim) / tail) * 5)
  }
  // 不相关 → 明显相关：8–70 分，这一段是主区分区
  if (sim <= hi) return 8 + ((sim - lo) / span) * 62
  // 明显相关 → 非常相关：70–92 分，斜率减半，防止所有同类词都挤在 95+
  if (sim <= hi + span) return 70 + ((sim - hi) / span) * 22
  // 极少数高度相似：92–97，缓慢收敛
  return Math.min(97, 92 + ((sim - hi - span) / span) * 5)
}

export function flushNow() {
  flush(true)
}

export const _internal = { keyOf, memCache }
