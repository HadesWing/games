// 读音相似度层
//
// 解决「词义和字面都不像，但听起来像」这一类猜测：
//   巾 / 襟    同音（jīn）        → 观众觉得「这也能算对一半」
//   领 / 林    前后鼻音不分        → 南方口音常见
//   zi / zhi   平翘舌不分          → 同上
//
// 数据来源是同目录的 pinyin-table.json（由 tools/gen-pinyin.mjs 预生成），
// 运行时零依赖，不装 pinyin-pro 也能跑。
//
// 对外只暴露三个函数：
//   hasPinyin(text)      是否含可识别的汉字读音
//   charSim(a, b)        单字读音相近度 0–1
//   wordSim(a, b)        整词读音相近度 0–1

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

let SYL = []
let IDX = ''
let START = 0x4e00
let ready = false

function load() {
  if (ready) return true
  try {
    const raw = JSON.parse(readFileSync(join(HERE, 'pinyin-table.json'), 'utf8'))
    SYL = raw.syl ? raw.syl.split(',') : []
    IDX = raw.idx || ''
    START = raw.start || 0x4e00
    ready = SYL.length > 0 && IDX.length >= 2
  } catch {
    ready = false
  }
  return ready
}

/** 查单个汉字的无声调拼音；非汉字或表里没有返回 '' */
export function syllableOf(ch) {
  if (!load()) return ''
  const cp = ch.codePointAt(0)
  if (cp < START) return ''
  const at = (cp - START) * 2
  if (at + 1 >= IDX.length) return ''
  const a = IDX.charCodeAt(at) - 0x20
  const b = IDX.charCodeAt(at + 1) - 0x20
  const id = a * 95 + b
  return id === 0 ? '' : SYL[id - 1] || ''
}

/** 整串读音；汉字转拼音，字母数字原样保留（小写） */
export function pinyinOf(text) {
  load()
  const out = []
  for (const ch of String(text || '')) {
    const s = syllableOf(ch)
    if (s) out.push(s)
    else if (/[a-z0-9]/i.test(ch)) out.push(ch.toLowerCase())
  }
  return out
}

export function hasPinyin(text) {
  return pinyinOf(text).length > 0
}

// ---------- 模糊音归一 ----------
// 只做「母语者真的会混」的那几组，不做无节制的合并：
//   平翘舌  zh/ch/sh → z/c/s
//   鼻音    n → l（南方部分地区）
//   前后鼻  ing→in, eng→en, ang→an, iang→ian, uang→uan
//   唇音    ün/vn → un
const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']

function split(s) {
  for (const ini of INITIALS) {
    if (s.startsWith(ini)) {
      // y/w 后面其实是韵母变形，统一按原样拆
      return { ini, fin: s.slice(ini.length) }
    }
  }
  return { ini: '', fin: s }
}

const FIN_MAP = {
  iang: 'ian',
  uang: 'uan',
  ing: 'in',
  eng: 'en',
  ang: 'an',
  vn: 'un',
  van: 'uan',
}

function canon(s) {
  const { ini, fin } = split(s || '')
  let i = ini
  if (i === 'zh') i = 'z'
  else if (i === 'ch') i = 'c'
  else if (i === 'sh') i = 's'
  else if (i === 'n') i = 'l'
  // 翘舌 r 与 l 在部分口音里混用，但合并会误伤太多，这里不做
  const f = FIN_MAP[fin] || fin
  return i + f
}

/** 编辑距离（Levenshtein），音节很短，直接 DP */
function lev(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m || !n) return m || n
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

// 声母的发音部位分组：只有同一组内的声母互换才算「听起来接近」
// j/q/x 舌面 · z/c/s 平舌 · b/p/m/f 唇 · d/t 舌尖 · g/k/h 舌根 · n/l 鼻边
const GROUP = {
  j: 'palatal', q: 'palatal', x: 'palatal',
  z: 'dental', c: 'dental', s: 'dental',
  b: 'labial', p: 'labial', m: 'labial', f: 'labial',
  d: 'alveolar', t: 'alveolar',
  g: 'velar', k: 'velar', h: 'velar',
  n: 'nasal', l: 'nasal',
}

function nearInitial(ia, ib) {
  if (ia === ib) return true
  return Boolean(GROUP[ia] && GROUP[ia] === GROUP[ib])
}

/**
 * 单字读音相近度 0–1
 *   1.00  完全同音      巾 / 襟   jīn
 *   0.86  模糊音等价    领 / 林   ling → lin（前后鼻音）
 *                       山 / 三   shan → san（平翘舌）
 *   0.62  同发音部位    襟 / 钦   j / q
 *   0.32  韵母同声母远  襟 / 拎   j / l（听起来不像，只能算沾边）
 *   0     不像
 */
export function charSim(a, b) {
  const sa = syllableOf(a)
  const sb = syllableOf(b)
  if (!sa || !sb) {
    // 非汉字：完全相同才算
    return a === b ? 1 : 0
  }
  return sylSim(sa, sb)
}

/**
 * 整词读音相近度 0–1（带长度折扣，用于加权）
 * 等长按位对齐取平均；不等长取最优对齐（允许一侧多出音节，按部分匹配打折）
 */
export function wordSim(a, b) {
  const { best, shortLen, longLen } = align(a, b)
  if (best <= 0) return 0
  // 长度差要打折，但不能按比例硬砍：
  // 「巾」猜「衣襟」是把答案后半截听对了，属于有效线索，不该只剩 0.5。
  // 所以最差保留 0.6，剩下 0.4 按长度比给。
  return best * (0.6 + 0.4 * (shortLen / longLen))
}

/**
 * 不带长度折扣的读音相近度。
 * 用来判断「有没有一段音节被完全听对」——「巾」对「衣襟」的 raw 是 1.0，
 * 虽然整词只有 0.8，但它确实完整命中了「襟」，这种应该给保底分。
 */
export function wordSimRaw(a, b) {
  return align(a, b).best
}

function align(a, b) {
  const pa = pinyinOf(a)
  const pb = pinyinOf(b)
  if (!pa.length || !pb.length) return { best: 0, shortLen: 0, longLen: 0 }

  if (pa.length === pb.length) {
    let sum = 0
    for (let i = 0; i < pa.length; i++) sum += sylSim(pa[i], pb[i])
    return { best: sum / pa.length, shortLen: pa.length, longLen: pb.length }
  }

  const [short, long] = pa.length < pb.length ? [pa, pb] : [pb, pa]
  let best = 0
  for (let start = 0; start + short.length <= long.length; start++) {
    let sum = 0
    for (let i = 0; i < short.length; i++) sum += sylSim(short[i], long[start + i])
    best = Math.max(best, sum / short.length)
  }
  return { best, shortLen: short.length, longLen: long.length }
}

// 音节级相似度（charSim 的实际实现，输入已是拼音）
function sylSim(sa, sb) {
  if (sa === sb) return 1
  const ca = canon(sa)
  const cb = canon(sb)
  if (ca === cb) return 0.86
  const { ini: ia, fin: fa } = split(ca)
  const { ini: ib, fin: fb } = split(cb)
  // 韵母一致时，声母是否同部位决定差多少
  if (fa === fb && ia !== ib) return nearInitial(ia, ib) ? 0.62 : 0.32
  if (ia === ib && (fa.startsWith(fb) || fb.startsWith(fa))) return 0.55
  if (lev(ca, cb) <= 1) return 0.5
  return 0
}

export function info() {
  load()
  return { enabled: ready, syllables: SYL.length, chars: IDX.length / 2 }
}

export { canon, split }
