// 关联度打分引擎 v1
//
// v0 是「人工语义图谱 + 字面兜底」，问题在于词表覆盖不到就判 8 分（领口 9.5、拿铁 9.2 这种笑话）。
// v1 改成 embedding 主导，图谱退居「先验修正」和「离线兜底」两个角色：
//
//   1. 完全相同            → 100，命中
//   2. 字面包含关系        → 仍用图谱的字频公式
//                            （embedding 分不出「襟」和「衣」谁更具体，这是字面层的独有能力）
//   3. 其余全部            → embedding 余弦 → 双锚点校准 → 0–100
//   4. 图谱同簇/同分类      → 只做 ±4 分的小幅先验修正，不主导分数
//   5. 模型不可用 / 调用失败 → 整体退回 graphScore()，功能不中断
//
// 两个导出：
//   score(guess, answer)  → Promise，服务端用
//   graphScore(guess, answer) → 同步纯图谱版，用于降级和 A/B 对比

import { GRAPH, INDEX, RELATED_PAIRS } from './lexicon.mjs'
import * as embed from './embed.mjs'
import * as judge from './judge.mjs'

// FNV-1a：给兜底分支一个稳定扰动，保证同一句话每次分数一致
function hash01(s) {
  let h = 2166136261
  for (const ch of s) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

const chars = (s) => [...s]
const STOP = new Set(['的', '了', '子', '儿', '头', '小', '老'])
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round1 = (v) => Math.round(v * 10) / 10

// 统计某分类下有多少个词包含这段文字 —— 用「覆盖率」近似「这个词有多泛」
function countContaining(category, sub) {
  const clusters = category ? GRAPH[category] : null
  if (!clusters) return 1
  let n = 0
  for (const words of Object.values(clusters)) {
    for (const w of words) if (w.includes(sub)) n += 1
  }
  return Math.max(n, 1)
}

function sharedChars(a, b) {
  const bSet = new Set(chars(b).filter((c) => !STOP.has(c)))
  return chars(a).filter((c) => !STOP.has(c) && bSet.has(c))
}

// ---------- v0：纯图谱打分（同步，永远可用） ----------
export function graphScore(guess, answer) {
  const g = String(guess || '').trim()
  const a = String(answer || '').trim()

  if (!g) return { score: 0, hit: false, reason: 'empty' }
  if (g === a) return { score: 100, hit: true, reason: 'exact' }

  const A = INDEX.get(a)
  const G = INDEX.get(g)
  const cat = A?.category

  let base
  let reason

  if (a.length >= 2 && g.includes(a)) {
    base = 91
    reason = 'superset'
  } else if (a.includes(g)) {
    base = 94 - 3.2 * countContaining(cat, g)
    reason = 'subset'
  } else if (A && G && A.category === G.category && A.cluster === G.cluster) {
    const gap = Math.abs(A.wordIndex - G.wordIndex) / Math.max(A.size - 1, 1)
    base = 87 - gap * 5
    reason = 'same-cluster'
  } else if (A && G && A.category === G.category) {
    const cGap = Math.abs(A.clusterIndex - G.clusterIndex)
    base = 61 - cGap * 2.5
    reason = 'same-category'
  } else if (A && G) {
    base = 13
    reason = 'cross-category'
  } else {
    const sh = sharedChars(g, a)
    if (sh.length === 0) {
      base = 8
      reason = 'unknown'
    } else {
      const rarest = Math.min(...sh.map((c) => countContaining(cat, c)))
      base = 46 + 34 * (1 - Math.min(rarest, 10) / 10)
      reason = 'shared-char'
    }
  }

  base -= Math.max(0, chars(g).length - 3) * 3
  if (reason !== 'subset' && reason !== 'superset') base += (hash01(g + '|' + a) - 0.5) * 3

  return { score: clamp(round1(base), 3, 97), hit: false, reason }
}

// ---------- 校准：造「不相关 / 相关」两组锚点 ----------
// 用固定种子的 LCG 取样，保证每次跑出来的锚点完全一样，分数可复现
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function buildAnchors(count = 180) {
  const groups = new Map()
  for (const [word, info] of INDEX) {
    if (!groups.has(info.category)) groups.set(info.category, [])
    groups.get(info.category).push(word)
  }
  const cats = [...groups.keys()]
  const rnd = lcg(20261110)
  const unrelated = []
  const seen = new Set()
  let guard = 0
  while (unrelated.length < count && guard++ < count * 40) {
    const ca = cats[Math.floor(rnd() * cats.length)]
    const cb = cats[Math.floor(rnd() * cats.length)]
    if (ca === cb) continue
    const wa = groups.get(ca)[Math.floor(rnd() * groups.get(ca).length)]
    const wb = groups.get(cb)[Math.floor(rnd() * groups.get(cb).length)]
    const key = wa < wb ? wa + '|' + wb : wb + '|' + wa
    if (seen.has(key)) continue
    seen.add(key)
    unrelated.push([wa, wb])
  }
  return { unrelated, related: RELATED_PAIRS }
}

function simsFor(pairs, vecs) {
  const out = []
  for (const [a, b] of pairs) {
    const va = vecs.get(a)
    const vb = vecs.get(b)
    if (va && vb) out.push(embed.cosine(va, vb))
  }
  return out
}

/**
 * 启动时预热：把词表全部算成向量 + 首次运行自动校准
 * 之后每局只算「词表外的词」，通常每局十几个，延迟可忽略
 */
export async function warmup() {
  const info = await embed.init()
  // 精排层独立初始化：没有本地对话模型也不影响主流程
  const jinfo = await judge.init().catch(() => judge.info())

  if (!info.enabled) {
    return { ...info, judge: jinfo, calibrated: false, note: '未检测到 embedding 模型，已退回纯图谱模式' }
  }

  const words = [...INDEX.keys()]
  const vecs = await embed.embedMany(words)
  if (vecs.size < words.length) {
    return { ...embed.info(), judge: jinfo, calibrated: embed.hasCalib(), note: '部分词向量计算失败，请检查模型服务' }
  }

  if (!embed.hasCalib()) {
    const { unrelated, related } = buildAnchors()
    const unrelSims = simsFor(unrelated, vecs)
    const relSims = simsFor(related, vecs)
    const cal = embed.calibrate({ unrelated: unrelSims, related: relSims })
    embed.flushNow()
    return { ...embed.info(), judge: jinfo, calibrated: true, fresh: true, cal }
  }

  return { ...embed.info(), judge: jinfo, calibrated: true }
}

export function engineInfo() {
  return { ...embed.info(), judge: judge.info() }
}

// ---------- v1：embedding 主导 ----------
// opts.judge === false 时跳过精排层，只给 embedding 分（直播实时响应用）
export async function score(guess, answer, opts = {}) {
  const useJudge = opts.judge !== false
  const g = String(guess || '').trim()
  const a = String(answer || '').trim()

  if (!g) return { score: 0, hit: false, reason: 'empty' }
  if (g === a) return { score: 100, hit: true, reason: 'exact' }

  const A = INDEX.get(a)
  const G = INDEX.get(g)
  const cat = A?.category

  // 字面包含：具体性判断交给字频公式，这是 embedding 做不到的
  if (a.length >= 2 && g.includes(a)) return { score: 91, hit: false, reason: 'superset' }
  if (a.includes(g)) return { score: clamp(round1(94 - 3.2 * countContaining(cat, g)), 3, 97), hit: false, reason: 'subset' }

  if (!embed.isReady()) return graphScore(g, a)

  let sim = null
  let base = null
  try {
    const vecs = await embed.embedMany([g, a])
    const vg = vecs.get(g)
    const va = vecs.get(a)
    if (vg && va) {
      sim = embed.cosine(vg, va)
      base = embed.toScore(sim)
    }
  } catch {
    base = null
  }

  if (base == null) return graphScore(g, a)

  // 精排层（可选）：本地对话模型直接判分，比小 embedding 模型更接近人的直觉
  // 带缓存和超时预算，超时就继续用 embedding 的结果，绝不卡住直播
  let judged = null
  if (useJudge && judge.isReady()) {
    try {
      judged = await judge.judgeWithBudget(g, a)
    } catch {
      judged = null
    }
  }
  if (judged != null) base = judged

  // 图谱先验：只做小幅修正，不让手工簇的分数量级压过真实语义
  let prior = 0
  let reason = judged != null ? 'llm' : 'semantic'
  if (A && G && A.category === G.category && A.cluster === G.cluster) {
    prior = judged != null ? 2 : 4
    reason = judged != null ? 'llm+cluster' : 'semantic+cluster'
  } else if (A && G && A.category === G.category) {
    prior = 0
    reason = judged != null ? 'llm+samecat' : 'semantic+samecat'
  } else if (A && G) {
    prior = judged != null ? -2 : -3
    reason = judged != null ? 'llm+crosscat' : 'semantic+crosscat'
  }

  let s = base + prior
  // 超长词降权：题目限定 1–3 字，4 字以上观感上该打折
  s -= Math.max(0, chars(g).length - 3) * 1.5

  return { score: clamp(round1(s), 3, 97), hit: false, reason, sim: sim == null ? null : +sim.toFixed(4) }
}

/** 一次性批量打分（工具/测试用），比逐条调用少很多往返 */
export async function scoreMany(pairs) {
  const words = new Set()
  for (const [g, a] of pairs) {
    words.add(String(g).trim())
    words.add(String(a).trim())
  }
  await embed.embedMany([...words])
  const out = []
  for (const [g, a] of pairs) out.push(await score(g, a))
  return out
}

export { embed }
