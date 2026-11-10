// 用 pinyin-pro 生成 `lib/pinyin-table.json`
//
// 为什么要预生成而不是运行时依赖 pinyin-pro：
//   1. 项目一直保持「运行时零依赖」，clone 下来 node server.mjs 就能跑；
//   2. 拼音是静态数据，一个汉字就那几个读音，没必要每次启动现算；
//   3. 生成物只有几十 KB，比装 1MB 依赖更轻。
//
// 只有改了生成逻辑或换库时才需要重跑；pinyin-pro 只是 devDependency。
//
// 用法：node tools/gen-pinyin.mjs
//
// 编码方式：每个汉字 2 个 ASCII 字符（0x20–0x7E，共 95 档），拼成 syllable 下标。
//   下标 0 表示「无读音」，其余为 SYL 数组下标 + 1。
//   20992 个汉字 → 约 42KB 文本，比直接存拼音字符串小一个数量级。

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pinyin } from 'pinyin-pro'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'lib', 'pinyin-table.json')

const START = 0x4e00
const END = 0x9fff // 基本汉字区，20992 字

// ü 统一写成 v，避免不同库的写法差异
const normalize = (s) =>
  s
    .toLowerCase()
    .replaceAll('ü', 'v')
    .replaceAll('ǖ', 'v')
    .replaceAll('ǘ', 'v')
    .replaceAll('ǚ', 'v')
    .replaceAll('ǜ', 'v')
    .replace(/[^a-z]/g, '')

const syllables = []
const sylIndex = new Map()
let unknown = 0

function idOf(syl) {
  if (!syl) return 0
  if (!sylIndex.has(syl)) {
    sylIndex.set(syl, syllables.length)
    syllables.push(syl)
  }
  return sylIndex.get(syl) + 1
}

let packed = ''
for (let cp = START; cp <= END; cp++) {
  const ch = String.fromCodePoint(cp)
  let syl = ''
  try {
    const raw = pinyin(ch, { toneType: 'none', type: 'array', multiple: false, v: true })
    const first = Array.isArray(raw) ? raw[0] : raw
    // 单字查不到读音时库会原样返回该汉字，长度 > 1 说明没命中
    if (first && first.length <= 6 && first !== ch) syl = normalize(first)
  } catch {
    syl = ''
  }
  if (!syl) unknown++
  const id = idOf(syl)
  packed += String.fromCharCode(0x20 + Math.floor(id / 95)) + String.fromCharCode(0x20 + (id % 95))
}

const table = { start: START, end: END, syl: syllables.join(','), idx: packed }
writeFileSync(OUT, JSON.stringify(table))

console.log(`已生成 ${OUT}`)
console.log(`  汉字数：${END - START + 1}   无读音：${unknown}`)
console.log(`  音节数：${syllables.length}`)
console.log(`  文件大小：${(JSON.stringify(table).length / 1024).toFixed(1)} KB`)
