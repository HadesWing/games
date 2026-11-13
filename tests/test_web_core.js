#!/usr/bin/env node
/**
 * 网页版核心逻辑回归（Node，无需浏览器 / jsdom）。
 *
 * 直接从 web/index.html 里抽取 audio-data 与 core 两段脚本，放进 vm 沙箱执行，
 * 断言与 Godot 版 A/B 玩法一致的规则。跑法：
 *     node tests/test_web_core.js
 * 退出码 0 表示全通过。改了 web/template.html 后记得先跑 tools/build_web.py。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "web", "index.html");
const html = fs.readFileSync(HTML, "utf8");

function script(id) {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`找不到脚本片段 #${id}`);
  return m[1];
}

// ---- 浏览器环境替身 ----
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const played = [];
class MockAudio {
  constructor(src) { this.src = src; this.paused = false; this.currentTime = 0; played.push(this); }
  play() { return Promise.resolve(); }
  pause() { this.paused = true; }
}
const timers = [];
let timerId = 0;
const sandbox = {
  console,
  localStorage,
  Audio: MockAudio,
  setTimeout: (fn, ms) => { const id = ++timerId; timers.push({ id, fn, ms }); return id; },
  clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
};
const ctx = vm.createContext(sandbox);
vm.runInContext(script("audio-data"), ctx, { filename: "audio-data.js" });
vm.runInContext(script("core"), ctx, { filename: "core.js" });

const run = (expr) => vm.runInContext(expr, ctx);
let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}
function resetSave() {
  store.clear();
  run("SAVE = blankSave();");
}

// ---- 数据完整性 ----
ok("内嵌音频 75 条、覆盖全部字母与音节", () => {
  assert.strictEqual(run("audioCount()"), 75);
  const all = run(`(function(){
    var ks=[];
    TABLE.stages.forEach(function(s){ ks=ks.concat(s.letters); });
    TABLE.syllables.forEach(function(e){ ks.push(e.syl); });
    return Array.from(new Set(ks));
  })()`);
  const missing = Array.from(all).filter((k) => !run(`hasAudio(${JSON.stringify(k)})`));
  assert.deepStrictEqual(missing, [], `缺音频: ${missing}`);
});
ok("ü → v 文件名归一化", () => {
  assert.strictEqual(run("audioKey('ü')"), "v");
  assert.strictEqual(run("audioKey('ün')"), "vn");
  assert.strictEqual(run("hasAudio('ü')"), true);
  assert.strictEqual(run("hasAudio('ün')"), true);
});
ok("呼读音汉字映射存在", () => {
  assert.strictEqual(run("sayOf('b')"), "玻");
  assert.strictEqual(run("sayOf('ba')"), "爸");
});
ok("47 条字母呼读音全为第一声（教学标准）", () => {
  // 声母/韵母的呼读音 = 该音节的第一声。「鹅/佛/日/熬/儿/昂」是韵母表的
  // 代表字，声调属于音节，声母韵母本身不标调；教学时统一读第一声。
  const bad = run(`(function(){
    var out=[];
    for (var k in SPEECH.letters) {
      var cmn = SPEECH.letters[k].cmn;
      if (cmn.slice(-1) !== "1") out.push(k + "=" + cmn);
    }
    return out;
  })()`);
  // vm 沙箱里的数组与 Node 侧原型不同，deepStrictEqual 会误判；用 JSON 比
  assert.strictEqual(JSON.stringify(bad), "[]", `非一声条目: ${JSON.stringify(bad)}`);
  assert.strictEqual(run("Object.keys(SPEECH.letters).length"), 47);
});
ok("6 条曾读错调的字母已改为一声版本", () => {
  const expect = { e: "e1", f: "fo1", r: "ri1", ao: "ao1", er: "er1", ang: "ang1" };
  for (const [k, cmn] of Object.entries(expect)) {
    assert.strictEqual(run(`SPEECH.letters[${JSON.stringify(k)}].cmn`), cmn);
  }
});
ok("不成词音节的兜底标签不显示空白", () => {
  // fo/te/ne/ri/er 的第一声音节在普通话里没有汉字，只能显示「只有录音」
  for (const k of ["f", "t", "n", "r", "er"]) {
    assert.strictEqual(run(`sayOf(${JSON.stringify(k)})`), "");
    assert.strictEqual(run(`sayLabel(${JSON.stringify(k)})`), "只有录音");
  }
  assert.strictEqual(run("sayLabel('b')"), "玻");
});

// ---- A 钓鱼难度池 ----
ok("字母池随等级递增：Lv.1 六个单韵母，Lv.10 覆盖前 5 个阶段", () => {
  assert.strictEqual(run("stageLetters(1).length"), 6);
  assert.ok(run("stageLetters(4).length") > run("stageLetters(1).length"));
  // Godot 版 letters_for_level() 用 ceil(lv/2) 取阶段数，10 级里最多解锁前 5 个
  // 阶段（20 个字母）；复韵母/鼻韵母留给后续 C-K 玩法。网页版保持同一梯度。
  const total = run("TABLE.stages.reduce(function(a,s){return a+s.letters.length;},0)");
  assert.strictEqual(total, 47);
  assert.strictEqual(run("stageLetters(10).length"), 20);
});
for (const lv of [1, 3, 5, 8, 10]) {
  ok(`Lv.${lv} 鱼群必含目标、数量符合梯度、无重复`, () => {
    const pool = run(`stageLetters(${lv})`);
    const want = Math.max(3, Math.min(8, 2 + lv));
    for (let i = 0; i < 40; i++) {
      const target = pool[i % pool.length];
      const cards = run(`makeFishRound(${JSON.stringify(target)}, ${lv})`);
      assert.strictEqual(cards.length, want, "鱼数量");
      assert.ok(cards.indexOf(target) >= 0, "目标不在池中");
      assert.strictEqual(new Set(cards).size, cards.length, "出现重复字母");
      cards.forEach((k) => assert.ok(pool.indexOf(k) >= 0, `越池字母 ${k}`));
    }
  });
}

// ---- B 找朋友 ----
ok("声母按 3 级一批解锁：7 / 15 / 19", () => {
  assert.strictEqual(run("tierSheng(1).length"), 7);
  assert.strictEqual(run("tierSheng(4).length"), 15);
  assert.strictEqual(run("tierSheng(7).length"), 19);
  assert.strictEqual(run("tierSheng(10).length"), 19);
});
ok("available() 只返回已解锁声母的音节", () => {
  for (const lv of [1, 4, 7, 10]) {
    const unlocked = run(`tierSheng(${lv})`);
    const list = run(`available(${lv})`);
    assert.ok(list.length > 0);
    list.forEach((e) => assert.ok(unlocked.indexOf(e.s) >= 0, `Lv.${lv} 出现 ${e.s}`));
  }
});
for (const lv of [1, 3, 5, 6, 8, 10]) {
  ok(`Lv.${lv} 回合卡片含正确声母/韵母、数量梯度、无重复`, () => {
    const nS = Math.max(1, Math.min(4, 1 + Math.floor((lv - 1) / 2)));
    const nY = Math.max(2, Math.min(4, 2 + Math.floor((lv - 1) / 2)));
    const entries = run(`available(${lv})`);
    for (const e of entries) {
      const r = run(`makeFriendRound(${JSON.stringify(e)}, ${lv})`);
      assert.ok(r.shengs.indexOf(e.s) >= 0, `缺声母 ${e.s}`);
      assert.ok(r.yuns.indexOf(e.y) >= 0, `缺韵母 ${e.y}`);
      assert.strictEqual(r.shengs.length, nS, "声母卡数量");
      assert.strictEqual(r.yuns.length, nY, "韵母卡数量");
      assert.strictEqual(new Set(r.shengs).size, r.shengs.length, "声母重复");
      assert.strictEqual(new Set(r.yuns).size, r.yuns.length, "韵母重复");
    }
  });
}
ok("配对判定：只有声母和韵母都对才算对", () => {
  const e = { s: "b", y: "a", syl: "ba" };
  assert.strictEqual(run(`isCorrect(${JSON.stringify(e)},"b","a")`), true);
  assert.strictEqual(run(`isCorrect(${JSON.stringify(e)},"p","a")`), false);
  assert.strictEqual(run(`isCorrect(${JSON.stringify(e)},"b","u")`), false);
});

// ---- 计分 / 星级 / 存档 ----
ok("scoreOf 首次点对比例换算百分制", () => {
  assert.strictEqual(run("scoreOf(0,8)"), 0);
  assert.strictEqual(run("scoreOf(4,8)"), 50);
  assert.strictEqual(run("scoreOf(8,8)"), 100);
  assert.strictEqual(run("scoreOf(0,0)"), 0);
});
ok("starsOf 分数线与进步奖励", () => {
  assert.strictEqual(run("starsOf(90,[])"), 3);
  assert.strictEqual(run("starsOf(70,[])"), 2);
  assert.strictEqual(run("starsOf(50,[])"), 1);
  assert.strictEqual(run("starsOf(10,[])"), 0);
  assert.strictEqual(run("starsOf(30,[{score:10},{score:20}])"), 1);
});
ok("finish：3 星升级、0 星降级、边界不越界", () => {
  resetSave();
  assert.strictEqual(run('lvl("fishing")'), 1);
  assert.strictEqual(run('finish("fishing",100)'), 3);
  assert.strictEqual(run('lvl("fishing")'), 2);
  assert.strictEqual(run('finish("fishing",10)'), 0);
  assert.strictEqual(run('lvl("fishing")'), 1);
  assert.strictEqual(run('finish("fishing",10)'), 0);
  assert.strictEqual(run('lvl("fishing")'), 1, "Lv.1 不再降");
  for (let i = 0; i < 15; i++) run('finish("fishing",100)');
  assert.strictEqual(run('lvl("fishing")'), 10, "封顶 Lv.10");
});
ok("存档写入 localStorage 且可重新载入", () => {
  resetSave();
  run('finish("friends",100)'); // 3 星 → 升到 Lv.2
  const raw = store.get("pinyinweb_v1");
  assert.ok(raw && JSON.parse(raw).sessions.length === 1);
  run("SAVE = loadSave();");
  assert.strictEqual(run("SAVE.sessions.length"), 1);
  assert.strictEqual(run('lvl("friends")'), 2);
});

// ---- 发音层 ----
ok("playKey 播前停旧音，不叠音", () => {
  resetSave();
  run("SAVE.sound = true;");
  played.length = 0;
  run('playKey("b"); playKey("a");');
  assert.strictEqual(played.length, 2);
  assert.strictEqual(played[0].paused, true, "上一段应被 pause");
  assert.strictEqual(played[1].paused, false);
});
ok("静音开关与停止朗读", () => {
  resetSave();
  run("SAVE.sound = false;");
  played.length = 0;
  assert.strictEqual(run('playKey("b")'), false);
  assert.strictEqual(played.length, 0);
  run("SAVE.sound = true;");
  run('playSeq(["b","a","ba"], 1000, null);');
  assert.strictEqual(timers.length, 3, "三段各排一个定时器");
  assert.deepStrictEqual(timers.map((t) => t.ms), [0, 1000, 2000]);
  run("stopSpeech();");
  assert.strictEqual(timers.length, 0, "stopSpeech 清空队列");
});

console.log(`\n网页版核心回归：${passed} 项全部通过 ✅`);
process.exit(0);
