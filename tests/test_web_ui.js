#!/usr/bin/env node
/**
 * 网页版 DOM 冒烟（可选，需要 jsdom）。
 *
 *     npm install --no-save jsdom        # 或直接设置 NODE_PATH 指向已装 jsdom 的目录
 *     node tests/test_web_ui.js
 *
 * 未安装 jsdom 时自动跳过（退出码 0），不阻塞其它回归。
 * 覆盖：首次渲染、完整走完一局钓鱼、结算与存档、切换玩法、三段拼读、试听页 75 卡。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

let jsdom;
try { jsdom = require("jsdom"); }
catch (e) {
  console.log("跳过 DOM 冒烟：未安装 jsdom（npm install --no-save jsdom）");
  process.exit(0);
}
const { JSDOM, VirtualConsole } = jsdom;

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));
vc.on("error", (m) => errors.push(String(m)));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://example.test/games/pinyin/",
  virtualConsole: vc,
  beforeParse(win) {
    // jsdom 没有真实音频设备，替换成哑实现（只验证调用链，不验证声音）
    win.Audio = class {
      constructor(src) { this.src = src; this.currentTime = 0; }
      play() { return Promise.resolve(); }
      pause() {}
    };
    win.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  },
});

const win = dom.window;
const doc = win.document;
const q = (s) => doc.querySelector(s);
const qa = (s) => Array.from(doc.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

async function main() {
  ok("首次渲染：3 个页签、Lv.1 三条鱼、进度 1/8", () => {
    assert.strictEqual(qa(".tab").length, 3);
    assert.strictEqual(qa(".fish").length, 3);
    assert.ok(q(".hud").textContent.includes("1"));
    assert.ok(q("#lvBadge").textContent.includes("Lv.1"));
    assert.strictEqual(q("#overlay").classList.contains("show"), false);
  });

  ok("看字提示可切换，且显示正确目标", () => {
    click(q('[data-act="toggleText"]'));
    const hint = q(".text-hint");
    assert.strictEqual(hint.classList.contains("hidden"), false);
    assert.ok(hint.textContent.includes(win.F.targets[win.F.idx]));
  });

  ok("点错鱼：摇晃反馈，题目不前进", () => {
    const cur = win.F.targets[win.F.idx];
    const wrong = qa(".fish").find((b) => b.dataset.k !== cur);
    click(wrong);
    assert.strictEqual(win.F.idx, 0);
    assert.strictEqual(win.F.first, 0);
    assert.strictEqual(win.F.attempts, 1);
    // 清掉本用例制造的失误，后面的整局验证「每题首次点对」的满分路径
    win.F.attempts = 0;
  });

  // 完整一局：每题都点正确的鱼
  for (let i = 0; i < 8; i++) {
    const cur = win.F.targets[win.F.idx];
    const fish = qa(".fish").find((b) => b.dataset.k === cur);
    assert.ok(fish, `第 ${i + 1} 题找不到目标鱼 ${cur}`);
    click(fish);
    await sleep(870);
  }
  ok("一局 8 题全对 → 结算层出现、100 分、存档写入", () => {
    assert.strictEqual(q("#overlay").classList.contains("show"), true);
    assert.ok(q(".modal .stars").textContent.includes("★"));
    assert.ok(q(".modal p").textContent.includes("100"));
    const saved = JSON.parse(win.localStorage.getItem("pinyinweb_v1"));
    assert.strictEqual(saved.sessions.length, 1);
    assert.strictEqual(saved.sessions[0].score, 100);
    assert.strictEqual(saved.levels.fishing, 2); // 3 星自动升级
  });

  ok("换个玩法 → 找朋友页正常渲染", () => {
    click(q('[data-act="menu"]'));
    assert.strictEqual(q("#overlay").classList.contains("show"), false);
    assert.ok(qa(".pcard[data-act='sheng']").length >= 1);
    assert.ok(qa(".pcard[data-act='yun']").length >= 2);
    assert.ok(q(".target .tone").textContent.length > 0);
  });

  ok("点声母高亮，配对正确触发三段拼读", async () => {
    const e = win.R.targets[win.R.idx];
    const s = qa(".pcard[data-act='sheng']").find((b) => b.dataset.k === e.s);
    const y = qa(".pcard[data-act='yun']").find((b) => b.dataset.k === e.y);
    assert.ok(s && y, "正确声母/韵母卡不在页面上");
    click(s);
    assert.strictEqual(s.classList.contains("sel"), true);
    click(y);
    await sleep(120);
    assert.strictEqual(q("#blend").textContent, e.s, "第一段应显示声母");
    assert.strictEqual(win.R.busy, true);
  });

  ok("切到全部读音：75 张卡片、点卡片有播放反馈", async () => {
    click(q('[data-game="listen"]'));
    assert.strictEqual(qa(".snd").length, 75);
    assert.strictEqual(qa("section.group").length, 11);
    const first = q(".snd");
    click(first);
    assert.strictEqual(first.classList.contains("playing"), true);
    await sleep(50);
  });

  ok("全程无脚本错误", () => {
    assert.deepStrictEqual(errors, []);
  });

  console.log(`\n网页版 DOM 冒烟：${passed} 项全部通过 ✅`);
  dom.window.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("DOM 冒烟失败：", e);
  process.exit(1);
});
