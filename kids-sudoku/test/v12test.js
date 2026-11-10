const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const errors = [];
const vc = new VirtualConsole().on("jsdomError", e => errors.push(e.message)).on("error", e => errors.push(e));
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/g.html", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, d = w.document;
const log = { speak: [], cancel: 0 };
w.speechSynthesis = {
  speak(u){ log.speak.push(u.text); },
  cancel(){ log.cancel++; },
  getVoices(){ return []; }
};
const get = e => w.eval(e);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
let failed = 0;
const check = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x != null ? " → " + x : "")); if (!c) failed++; };
const btns = () => d.querySelectorAll(".lvBtn");

setTimeout(() => {
  check("版本 v16", /v16/.test(d.querySelector("#totalText").textContent), d.querySelector("#totalText").textContent);
  check("关卡数 = 14", btns().length === 14, btns().length);
  check("总题数 = 244", get("totalPuzzles()") === 244, get("totalPuzzles()"));

  // ===== 托盘放完的动物整项隐藏（入门 3×3 填空）=====
  click(btns()[0]);
  const sol = get("solution");
  const blanks = [];
  for (let i = 0; i < 9; i++) if (get("board")[i] === -1) blanks.push(i);
  const target = sol[Math.floor(blanks[0] / 3)][blanks[0] % 3];
  const sameAnimal = blanks.filter(i => sol[Math.floor(i / 3)][i % 3] === target);
  const trayItems = () => d.querySelectorAll("#tray .trayItem");
  for (const i of sameAnimal) {
    w.eval("picked = -1");
    click(trayItems()[target]);
    click(d.querySelectorAll(".cell")[i]);
  }
  check("放完的动物托盘整项隐藏", trayItems()[target].style.display === "none", trayItems()[target].style.display);
  check("其余动物仍显示", [...trayItems()].some((t, idx) => idx !== target && t.style.display !== "none"));
  // 通关（放完剩余的）
  for (const i of blanks) {
    if (get("board")[i] === -1) {
      w.eval("picked = -1");
      click(trayItems()[sol[Math.floor(i / 3)][i % 3]]);
      click(d.querySelectorAll(".cell")[i]);
    }
  }
  check("隐藏托盘不影响通关", d.querySelector("#celebrate").classList.contains("show"));

  // （语音打断见 v12speech.js：需真实异步计时，本文件同步执行不适合）

  // ===== 超级侦探 5×5（线索）=====
  click(btns()[7]);
  awaitMs(50);
  check("超级侦探: 棋盘 25 格", d.querySelectorAll(".cell").length === 25, d.querySelectorAll(".cell").length);
  check("超级侦探: 有线索卡（最小线索集，数量不固定）", d.querySelectorAll(".clueCard").length >= 3, d.querySelectorAll(".clueCard").length);
  check("超级侦探: 托盘 5 只", d.querySelectorAll("#tray .trayItem").length === 5, d.querySelectorAll("#tray .trayItem").length);
  const pos5 = get("solutionPos");
  const ids5 = get("trayIds");
  for (const gid of ids5) {
    w.eval("picked = -1");
    click(d.querySelectorAll("#tray .trayItem")[ids5.indexOf(gid)]);
    click(d.querySelectorAll(".cell")[pos5[gid].r * 5 + pos5[gid].c]);
  }
  check("超级侦探: 可正常通关", d.querySelector("#celebrate").classList.contains("show"));

  // ===== 大师 6×6（填空，随机动物组合）=====
  click(btns()[8]);
  awaitMs(50);
  const holes6 = get("board").filter(v => v === -1).length;
  check("大师 6×6: 36 格", d.querySelectorAll(".cell").length === 36, d.querySelectorAll(".cell").length);
  check("大师 6×6: 挖空 18", holes6 === 18, holes6);
  check("大师 6×6: 托盘 6 只", d.querySelectorAll("#tray .trayItem").length === 6);
  check("大师 6×6: 动物组合来自 12 只池", get("fillTray").length === 6 && new Set(get("fillTray")).size === 6, JSON.stringify(get("fillTray")));
  // 行列校验仍然生效：找一行里已固定动物重复的格子，放同种应被拒
  const sol6 = get("solution"); const fillTray6 = get("fillTray");
  const inv6 = {}; fillTray6.forEach((gid, k) => inv6[gid] = k);
  let placed = 0, rejectedOK = null;
  const b6 = get("board");
  outer:
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    const i = r * 6 + c;
    if (b6[i] !== -1) continue;
    // 找同行已放的同种动物
    for (let k = 0; k < 6; k++) {
      const j = r * 6 + k;
      if (j !== i && b6[j] >= 0) {
        w.eval("picked = -1");
        click(d.querySelectorAll("#tray .trayItem")[inv6[b6[j]]]);
        click(d.querySelectorAll(".cell")[i]);
        if (get("board")[i] === -1 && get("currentScore") < 100) { rejectedOK = true; break outer; }
      }
    }
  }
  check("大师 6×6: 同行重复被拒且扣分", rejectedOK === true);
  // 全部填完通关
  for (let i = 0; i < 36; i++) {
    if (get("board")[i] === -1) {
      w.eval("picked = -1");
      click(d.querySelectorAll("#tray .trayItem")[inv6[sol6[Math.floor(i / 6)][i % 6]]]);
      click(d.querySelectorAll(".cell")[i]);
    }
  }
  check("大师 6×6: 可正常通关", d.querySelector("#celebrate").classList.contains("show"));

  // ===== 王者 7×7 =====
  click(btns()[9]);
  awaitMs(50);
  check("王者 7×7: 49 格", d.querySelectorAll(".cell").length === 49);
  check("王者 7×7: 挖空 28", get("board").filter(v => v === -1).length === 28, get("board").filter(v => v === -1).length);
  check("王者 7×7: 托盘 7 只", d.querySelectorAll("#tray .trayItem").length === 7);
  const sol7 = get("solution"); const fillTray7 = get("fillTray");
  const inv7 = {}; fillTray7.forEach((gid, k) => inv7[gid] = k);
  for (let i = 0; i < 49; i++) {
    if (get("board")[i] === -1) {
      w.eval("picked = -1");
      click(d.querySelectorAll("#tray .trayItem")[inv7[sol7[Math.floor(i / 7)][i % 7]]]);
      click(d.querySelectorAll(".cell")[i]);
    }
  }
  check("王者 7×7: 可正常通关", d.querySelector("#celebrate").classList.contains("show"));

  check("无 JS 错误", errors.length === 0, errors.join(";"));
  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
}, 400);

function awaitMs(ms) { const t = Date.now(); while (Date.now() - t < ms); }
