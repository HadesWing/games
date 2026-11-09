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
  check("版本 v8", /v8/.test(d.querySelector("#totalText").textContent));

  // ===== 小侦探 3×3：数量一致性 =====
  click(d.querySelectorAll(".lvBtn")[1]);
  const cells = d.querySelectorAll(".cell");
  const emptyCells = [...cells].filter(c => !c.querySelector("img")).length;
  const trayItems = [...d.querySelectorAll("#tray .trayItem")];
  const badges = trayItems.map(t => {
    const b = t.querySelector(".badge");
    return b && b.style.display !== "none" ? +b.textContent : 0;
  });
  check("小侦探空格数 = 3", emptyCells === 3, emptyCells);
  check("托盘动物数 = 3", trayItems.length === 3, trayItems.length);
  check("托盘剩余总和 = 空格数", badges.reduce((a,b)=>a+b,0) === emptyCells, badges.join("+") + " vs " + emptyCells);
  check("每只动物各需 1 只", badges.every(b => b === 1), badges.join(","));
  // 背景动物已摆满其他格子
  const filledImgs = [...cells].filter(c => c.querySelector("img")).length;
  check("棋盘已摆满背景(12/16... 9-3=6 张)", filledImgs === 6, filledImgs);
  // 已放好的动物不能再选
  const preAnimal = get("board[0] >= 0 ? board[0] : board[1]");
  // 找一个固定格上的动物 id
  let sceneryId = -1;
  for (let i = 0; i < 9; i++) { const v = get(`board[${i}]`); if (v >= 0 && get(`fixed[${i}]`)) { sceneryId = v; break; } }
  // scenery 不在托盘里
  const trayIdsLive = get("trayIds");
  check("背景动物不在托盘", !trayIdsLive.includes(sceneryId), "scenery=" + sceneryId + " tray=" + trayIdsLive.join(","));

  // ===== 按线索放置通关 =====
  const pos = get("solutionPos");
  for (const gid of trayIdsLive) {
    const cellIdx = pos[gid].r * 3 + pos[gid].c;
    click(d.querySelectorAll("#tray .trayItem")[trayIdsLive.indexOf(gid)]);
    click(cells[cellIdx]);
  }
  check("小侦探摆满通关", d.querySelector("#celebrate").classList.contains("show"));
  check("通关满分 100", get("currentScore") === 100, get("currentScore"));

  // ===== 大侦探 4×4：数量一致性 =====
  d.querySelector("#celebrate").classList.remove("show");
  click(d.querySelectorAll(".lvBtn")[5]);
  const cells4 = d.querySelectorAll(".cell");
  const empty4 = [...cells4].filter(c => !c.querySelector("img")).length;
  const tray4 = [...d.querySelectorAll("#tray .trayItem")];
  const badges4 = tray4.map(t => {
    const b = t.querySelector(".badge");
    return b && b.style.display !== "none" ? +b.textContent : 0;
  });
  check("大侦探空格数 = 4", empty4 === 4, empty4);
  check("大侦探托盘 4 只", tray4.length === 4);
  check("大侦探托盘剩余总和 = 空格数", badges4.reduce((a,b)=>a+b,0) === empty4, badges4.join("+") + " vs " + empty4);
  check("棋盘已摆满背景(12 张)", [...cells4].filter(c => c.querySelector("img")).length === 12);
  // 线索卡仍有图形示意
  check("线索卡>0 且含迷你示意", [...d.querySelectorAll(".clueCard")].length > 0
    && [...d.querySelectorAll(".clueCard")].every(c => c.querySelector(".miniTile") || c.querySelector(".miniRel")));

  // 已放好的动物不能重复选（防死局）
  const t0 = tray4[0];
  click(t0);
  const firstTrayId = get("trayIds")[0];
  // 放到答案位置
  const p1 = get("solutionPos")[firstTrayId];
  click(cells4[p1.r * 4 + p1.c]);
  click(t0); // 再点应被拒绝
  check("已放好的动物再点被拒", get("picked") === -1, get("picked"));

  // 剩余动物放完 → 通关
  const rest = get("trayIds").filter(gid => get("board").indexOf(gid) === -1);
  for (const gid of rest) {
    const pp = get("solutionPos")[gid];
    click(d.querySelectorAll("#tray .trayItem")[get("trayIds").indexOf(gid)]);
    click(cells4[pp.r * 4 + pp.c]);
  }
  check("大侦探摆满通关", d.querySelector("#celebrate").classList.contains("show"));

  // ===== 填空模式不受影响 =====
  d.querySelector("#celebrate").classList.remove("show");
  click(d.querySelectorAll(".lvBtn")[0]);
    // 填空模式：托盘剩余总和 = 空格数（挖空 4 格）
  const sumBadge0 = [...d.querySelectorAll("#tray .trayItem")].reduce((s,t)=>{const b=t.querySelector(".badge");return s+(b&&b.style.display!=="none"?+b.textContent:0);},0);
  const empty0 = [...d.querySelectorAll(".cell")].filter(c=>!c.querySelector("img")).length;
  check("入门 3×3 托盘剩余总和 = 空格数", sumBadge0 === empty0 && empty0 === 4, sumBadge0 + " vs " + empty0);

  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
  if (errors.length) console.log("JS错误:", errors);
}, 400);
