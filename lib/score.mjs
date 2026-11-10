// 关联度打分引擎（v0，零依赖、确定性）
// 设计目标：同词必然同分、分数可解释、跨分类有明确区分
//
// 三条关键规则（按优先级）：
//   1. 猜测是答案的子串 → 看这个字在该分类里有多罕见。越罕见越具体，分越高
//      （「襟」只出现在 2 个服饰词里 → 88 分；「衣」出现在 7 个里 → 72 分）
//   2. 猜测包含完整答案 → 90 分以上，但不算猜中
//   3. 都在图谱内 → 按语义簇距离打
//
// 替换成本：把 score() 换成 embedding 余弦 + LLM 精排即可，调用方不用改

import { GRAPH, INDEX } from './lexicon.mjs'

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

// 统计某分类下有多少个词包含这段文字 —— 用「覆盖率」近似「这个词有多泛」
function countContaining(category, sub) {
  if (!category || !GRAPH[category]) return 1
  let n = 0
  for (const words of Object.values(GRAPH[category])) {
    for (const w of words) if (w.includes(sub)) n += 1
  }
  return Math.max(n, 1)
}

function sharedChars(a, b) {
  const bSet = new Set(chars(b).filter((c) => !STOP.has(c)))
  return chars(a).filter((c) => !STOP.has(c) && bSet.has(c))
}

/**
 * @param {string} guess  观众猜的词
 * @param {string} answer 本局答案
 * @returns {{ score:number, hit:boolean, reason:string }}
 */
export function score(guess, answer) {
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
    // 猜的词里完整包含了答案（衣襟儿 / 衣襟上）
    base = 91
    reason = 'superset'
  } else if (a.includes(g)) {
    // 猜的词是答案的一部分 —— 核心是「这个字有多具体」
    const cnt = countContaining(cat, g)
    base = 94 - 3.2 * cnt
    reason = 'subset'
  } else if (A && G && A.category === G.category && A.cluster === G.cluster) {
    // 同簇：同一个部件 / 同一类东西
    const gap = Math.abs(A.wordIndex - G.wordIndex) / Math.max(A.size - 1, 1)
    base = 87 - gap * 5
    reason = 'same-cluster'
  } else if (A && G && A.category === G.category) {
    // 同分类不同簇
    const cGap = Math.abs(A.clusterIndex - G.clusterIndex)
    base = 61 - cGap * 2.5
    reason = 'same-category'
  } else if (A && G) {
    base = 13
    reason = 'cross-category'
  } else {
    // 至少一方不在图谱里 —— 只能看字面
    const sh = sharedChars(g, a)
    if (sh.length === 0) {
      base = 8
      reason = 'unknown'
    } else {
      // 共有的字如果本身很罕见，说明猜得越准
      const rarest = Math.min(...sh.map((c) => countContaining(cat, c)))
      base = 46 + 34 * (1 - Math.min(rarest, 10) / 10)
      reason = 'shared-char'
    }
  }

  // 超长词降权：题目限定 1–3 字，4 字以上观感上应打折
  base -= Math.max(0, chars(g).length - 3) * 3

  // 稳定扰动（仅非命中分支），让同分不同词不至于完全并列
  if (reason !== 'subset' && reason !== 'superset') base += (hash01(g + '|' + a) - 0.5) * 3

  return { score: clamp(Math.round(base * 10) / 10, 3, 97), hit: false, reason }
}
