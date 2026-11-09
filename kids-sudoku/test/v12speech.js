const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const errors = [];
const vc = new VirtualConsole().on("jsdomError", e => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/g.html", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, d = w.document;
const log = { speak: [], cancel: 0 };
w.speechSynthesis = { speak(u){ log.speak.push(u.text); }, cancel(){ log.cancel++; }, getVoices(){ return []; } };
w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
const get = e => w.eval(e);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
let failed = 0;
const check = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x != null ? " → " + x : "")); if (!c) failed++; };
const btns = () => d.querySelectorAll(".lvBtn");
const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await delay(400);
  log.speak.length = 0; log.cancel = 0;
  click(btns()[1]);               // 小侦探（clue → 播报）
  await delay(150);
  check("切到小侦探有播报", log.speak.length === 1, log.speak.join("|"));
  click(btns()[2]);               // 立刻切进阶 4×4（fill，不播报）
  check("切走立即 cancel", log.cancel >= 1, log.cancel);
  await delay(200);
  check("fill 关无新播报", log.speak.length === 1, log.speak.join("|"));
  click(btns()[6]);               // 障碍侦探（clue → 播报）
  await delay(200);
  check("再切回侦探类有新播报", log.speak.length === 2, log.speak.join("|"));
  log.speak.length = 0; log.cancel = 0;
  click(btns()[5]);               // 大侦探（clue → 安排了播报）
  click(btns()[2]);               // 60ms 内切走 → 旧播报必须被掐掉
  await delay(250);
  check("快速连点不补播旧语音", log.speak.length === 0 && log.cancel >= 2, `speak=${log.speak.length} cancel=${log.cancel}`);
  check("无 JS 错误", errors.length === 0, errors.join(";"));
  console.log(failed === 0 ? "\n=== SPEECH ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
})();
