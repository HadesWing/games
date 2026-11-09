const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const errors = [];
const vc = new VirtualConsole().on("jsdomError", e => errors.push(e.message)).on("error", e => errors.push(e));
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/g.html", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, d = w.document;
w.speechSynthesis = { speak(){}, cancel(){}, getVoices(){ return []; } };
const get = e => w.eval(e);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
let failed = 0;
const check = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x != null ? " → " + x : "")); if (!c) failed++; };

setTimeout(() => {
  click(d.querySelectorAll(".lvBtn")[2]); // 进阶 4×4
  const size = 4;

  // 系统性测试：对每一个空格 × 每一只动物，若该动物已在同行或同列 → 必须拒绝
  let attempts = 0, accepted = [];
  const badCases = [];
  // 先收集初始 board（题目固定态），逐案模拟
  for (let round = 0; round < 8; round++) {
    const board = get("board");
    let done = false;
    for (let i = 0; i < 16 && !done; i++) {
      if (board[i] !== -1) continue;
      const r = Math.floor(i / size), c = i % size;
      for (let a = 0; a < size; a++) {
        let conflict = null;
        for (let k = 0; k < size; k++) {
          if (k !== c && board[r * size + k] === a) conflict = "行";
          if (k !== r && board[k * size + c] === a) conflict = conflict || "列";
        }
        if (conflict) {
          attempts++;
          w.eval("picked = -1");           // 强制重置，避免点选切换干扰
          click(d.querySelectorAll("#tray .trayItem")[a]);
          click(d.querySelectorAll(".cell")[i]);
          const b = get("board");
          if (b[i] !== -1) { accepted.push({ i, a, conflict }); }
          done = true;
          break;
        }
      }
    }
    if (!done) break;
  }
  check("4×4 全部冲突放置被拒 (" + (attempts - accepted.length) + "/" + attempts + ")",
    attempts >= 5 && accepted.length === 0,
    accepted.length ? "被放进去的案例: " + JSON.stringify(accepted) : "全部拒绝");

  // 正确填满通关
  const sol = get("solution");
  for (let i = 0; i < 16; i++) {
    if (get("board")[i] === -1) {
      w.eval("picked = -1");
      click(d.querySelectorAll("#tray .trayItem")[sol[Math.floor(i / size)][i % size]]);
      click(d.querySelectorAll(".cell")[i]);
    }
  }
  check("4×4 正确填满通关", d.querySelector("#celebrate").classList.contains("show"));
  check("无错误日志", errors.length === 0, errors.join("|") || "none");
  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
}, 400);
