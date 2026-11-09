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

  // 1) 题量分档
  check("总题量 96", get("totalPuzzles()") === 96, get("totalPuzzles()"));
  const totals = get("LEVELS.map(L=>L.total)").join(",");
  check("各关题量 12,12,16,16,24,16", totals === "12,12,16,16,24,16", totals);

  // 2) 全空棋盘不再塌缩：gridAutoRows 已设置
  click(d.querySelectorAll(".lvBtn")[5]); // 大侦探 4×4（开局全空）
  check("大侦探 16 格", d.querySelectorAll(".cell").length === 16);
  check("gridAutoRows 已设置", /clamp/.test(d.querySelector("#board").style.gridAutoRows), d.querySelector("#board").style.gridAutoRows);
  check("aspect-ratio 存在于 CSS", /\.cell\s*\{[^}]*aspect-ratio/.test(html.replace(/\n/g," ")) || html.includes("aspect-ratio"));

  // 3) 线索卡图形化：无中文文字、有迷你示意
  click(d.querySelectorAll(".lvBtn")[1]); // 小侦探
  const cards = d.querySelectorAll(".clueCard");
  check("线索卡 > 0", cards.length > 0, cards.length);
  let allPicto = true, anyText = false;
  cards.forEach(c => {
    if (!c.querySelector(".miniTile")) allPicto = false;
    if (/[在的和坐]/.test(c.textContent.replace("✓","").replace("✗",""))) anyText = true;
  });
  check("线索卡全部为图形示意", allPicto);
  check("线索卡无中文描述文字", !anyText, anyText ? cards[0].textContent : "");
  const singles = [...cards].filter(c => c.querySelectorAll(".miniGrid").length);
  check("单动物线索用高亮迷你盘", singles.length > 0, singles.length);

  // 4) 线索校验仍然正确：按答案摆放 → 全绿通关
  const pos = get("solutionPos");
  for (let a = 0; a < 3; a++) {
    if (get("board").indexOf(a) >= 0) continue;
    get("picked = -1");
    click(d.querySelectorAll("#tray .trayItem")[a]);
    click(d.querySelectorAll(".cell")[pos[a].r * 3 + pos[a].c]);
  }
  check("小侦探按线索通关", d.querySelector("#celebrate").classList.contains("show"));

  // 5) 图例弹层
  click(d.querySelector("#legendBtn"));
  check("图例打开", d.querySelector("#legend").classList.contains("show"));
  const demos = d.querySelectorAll("[data-demo]");
  let demoOk = [...demos].every(el => el.querySelector(".miniTile"));
  check("图例 6 个示意图", demos.length === 6 && demoOk, demos.length);
  click(d.querySelector("#legendCloseBtn"));
  check("图例关闭", !d.querySelector("#legend").classList.contains("show"));

  // 6) 统计面板 + 重置（两步确认）
  get("recordDone(0,0,100)"); get("recordDone(0,1,85)");
  click(d.querySelector("#statsBtn"));
  check("统计面板打开", d.querySelector("#statsPanel").classList.contains("show"));
  check("统计汇总含满分", /满分 ⭐×2/.test(d.querySelector("#statsSummary").textContent), d.querySelector("#statsSummary").textContent);
  check("6 行关卡统计", d.querySelectorAll(".statRow").length === 6);
  check("入门行 2/12", /2\/12/.test(d.querySelectorAll(".statRow")[0].textContent), d.querySelectorAll(".statRow")[0].textContent.trim());
  click(d.querySelector("#resetBtn"));
  check("重置第一次只武装确认", get("resetArmed") === true && /再点一次/.test(d.querySelector("#resetBtn").textContent));
  check("进度未被清空", get("levelDone(0)") === 2, get("levelDone(0)"));
  click(d.querySelector("#resetBtn"));
  check("重置第二次清空进度", get("levelDone(0)") === 0 && get("totalDone()") === 0);
  click(d.querySelector("#statsCloseBtn"));
  check("统计面板关闭", !d.querySelector("#statsPanel").classList.contains("show"));

  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
  if (errors.length) console.log("JS错误:", errors);
}, 400);
