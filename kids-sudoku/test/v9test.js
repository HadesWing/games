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
  check("无 JS 错误", errors.length === 0, errors.join("|") || "none");
  check("版本 v9 / 总题量 112", /v9/.test(d.querySelector("#totalText").textContent) && /112/.test(d.querySelector("#totalText").textContent), d.querySelector("#totalText").textContent);
  check("关卡按钮 7 个", d.querySelectorAll(".lvBtn").length === 7, d.querySelectorAll(".lvBtn").length);

  // ===== 障碍侦探 4×4 =====
  click(d.querySelectorAll(".lvBtn")[6]);
  const cells = d.querySelectorAll(".cell");
  check("棋盘 16 格", cells.length === 16);
  const chairCells = [...cells].filter(c => c.querySelector('img[alt="椅子"]')).length;
  const plantCells = [...cells].filter(c => c.querySelector('img[alt="花盆"]')).length;
  check("1 把椅子", chairCells === 1, chairCells);
  check("2 个花盆", plantCells === 2, plantCells);
  const empty = [...cells].filter(c => !c.querySelector("img")).length;
  check("空位 = 4", empty === 4, empty);
  const tray = [...d.querySelectorAll("#tray .trayItem")];
  const badges = tray.map(t => { const b = t.querySelector(".badge"); return b && b.style.display !== "none" ? +b.textContent : 0; });
  check("托盘剩余总和 = 空位", badges.reduce((a,b)=>a+b,0) === empty, badges.join("+") + " vs " + empty);
  check("线索卡>0", d.querySelectorAll(".clueCard").length > 0, d.querySelectorAll(".clueCard").length);
  const hasObsClue = [...d.querySelectorAll(".clueCard")].some(c => c.textContent.includes("椅子") || (c.querySelectorAll("img").length >= 2));
  check("有障碍/图形线索", hasObsClue);

  // ===== 障碍关按答案通关 =====
  const pos = get("solutionPos");
  const trayIdsLive = get("trayIds");
  for (const gid of trayIdsLive) {
    const cellIdx = pos[gid].r * 4 + pos[gid].c;
    click(tray[trayIdsLive.indexOf(gid)]);
    click(cells[cellIdx]);
  }
  check("障碍关通关弹层", d.querySelector("#celebrate").classList.contains("show"));

  // ===== 回看棋盘 =====
  click(d.querySelector("#reviewBtn"));
  check("回看：弹层关闭", !d.querySelector("#celebrate").classList.contains("show"));
  check("回看：留在当前题", get("puzzleIndex") === get("puzzleIndex"));
  const boardAfter = get("board");
  check("回看：棋盘保留", boardAfter.every(v => v !== -1));
  // 回看状态点棋盘被锁定
  const emptyCellIdx = [...cells].findIndex(c => !c.querySelector("img"));
  const before = JSON.stringify(get("board"));
  click(cells[0]);
  check("回看：点棋盘不改动", JSON.stringify(get("board")) === before && /通关/.test(d.querySelector("#hintText").textContent), d.querySelector("#hintText").textContent);

  // ===== 下一题正常 =====
  click(d.querySelector("#againBtn"));
  check("下一题：换题并解锁", get("justWon") === false && !d.querySelector("#celebrate").classList.contains("show"));

  // ===== 小侦探回归 =====
  click(d.querySelectorAll(".lvBtn")[1]);
  const cells3 = d.querySelectorAll(".cell");
  check("小侦探空位 = 3", [...cells3].filter(c => !c.querySelector("img")).length === 3);
  const pos3 = get("solutionPos");
  const t3 = get("trayIds");
  for (const gid of t3) {
    click(d.querySelectorAll("#tray .trayItem")[t3.indexOf(gid)]);
    click(cells3[pos3[gid].r * 3 + pos3[gid].c]);
  }
  check("小侦探通关", d.querySelector("#celebrate").classList.contains("show"));
  click(d.querySelector("#againBtn"));

  // ===== 填空模式回归 =====
  click(d.querySelectorAll(".lvBtn")[0]);
  const sumBadge0 = [...d.querySelectorAll("#tray .trayItem")].reduce((s,t)=>{const b=t.querySelector(".badge");return s+(b&&b.style.display!=="none"?+b.textContent:0);},0);
  const empty0 = [...d.querySelectorAll(".cell")].filter(c=>!c.querySelector("img")).length;
  check("入门 3×3 托盘剩余 = 空格", sumBadge0 === empty0 && empty0 === 4, sumBadge0 + " vs " + empty0);

  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
  if (errors.length) console.log("JS错误:", errors);
}, 400);
