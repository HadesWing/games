const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const errors = [];
const vc = new VirtualConsole().on("jsdomError", e => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/g.html", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, d = w.document;
w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
w.speechSynthesis = { speak(){}, cancel(){}, getVoices(){ return []; } };
const get = e => w.eval(e);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const btns = () => d.querySelectorAll(".lvBtn");
const cat = c => d.querySelector(`.catBtn[data-cat="${c}"]`);
const cells = () => d.querySelectorAll(".cell");
const trayItems = () => d.querySelectorAll("#tray .trayItem");
const visible = () => [...btns()].filter(b => b.style.display !== "none");
let failed = 0;
const check = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x != null ? " → " + x : "")); if (!c) failed++; };
const delay = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await delay(400);
  check("版本 v15", /v15/.test(d.querySelector("#totalText").textContent));
  check("14 个关卡", btns().length === 14, btns().length);
  check("244 题", get("totalPuzzles()") === 244, get("totalPuzzles()"));

  // ===== 顶部分类 Tab =====
  check("默认在填格子", get("category") === "fill" && cat("fill").classList.contains("active"));
  const nFill = get("LEVELS.filter((L,i)=>catOf(i)==='fill').length");
  const nClue = get("LEVELS.filter((L,i)=>catOf(i)==='clue').length");
  check("填格子分类只显示填空关", visible().length === nFill && visible().every(b => b.dataset.cat === "fill"), `${visible().length}/${nFill}`);
  check("分类小字显示汇总进度", /0\/\d+/.test(cat("fill").querySelector("small").textContent), cat("fill").querySelector("small").textContent);
  click(cat("clue"));
  check("切到小侦探", get("category") === "clue" && cat("clue").classList.contains("active"));
  check("只显示侦探关", visible().length === nClue && visible().every(b => b.dataset.cat === "clue"), `${visible().length}/${nClue}`);
  check("分类已持久化", d.defaultView.localStorage.getItem("kidsudoku_cat_v1") === "clue");
  check("切分类自动进入该类关卡", get("catOf(level)") === "clue" && get("mode") === "clue", `level=${get("level")}`);
  // 记住上次玩的关
  click(btns()[12]);            // 机关侦探 5×5
  check("可进入障碍侦探关", get("level") === 12, get("level"));
  click(cat("fill"));
  click(cat("clue"));
  check("切回分类回到上次关卡", get("level") === 12, get("level"));

  // ===== 统计面板分组 =====
  click(d.querySelector("#statsBtn"));
  const groups = [...d.querySelectorAll("#statsList .statGroup")].map(g => g.textContent);
  check("统计分 2 组", groups.length === 2, groups.length);
  check("两组标题正确", /填格子/.test(groups[0]) && /小侦探/.test(groups[1]), groups.join(" | "));
  check("统计仍列出全部关卡", d.querySelectorAll("#statsList .statRow").length === 14);
  click(d.querySelector("#statsCloseBtn"));

  // ===== 新障碍：石头 / 小树 =====
  check("石头名称", get("thingName(-4)") === "石头", get("thingName(-4)"));
  check("小树名称", get("thingName(-5)") === "小树", get("thingName(-5)"));
  check("新障碍 SVG 已内嵌", get('!!SVG_ASSETS["1faa8"] && !!SVG_ASSETS["1f333"]'));

  // 机关侦探 5×5：5 个障碍
  click(btns()[12]);
  const obs5 = get("board").filter(v => v <= -2).length;
  check("机关侦探: 25 格", cells().length === 25, cells().length);
  check("机关侦探: 5 个障碍", obs5 === 5, obs5);
  check("机关侦探: 5 个空位", get("board").filter(v => v === -1).length === 5);
  check("机关侦探: 托盘 5 只", trayItems().length === 5);
  check("机关侦探: 含挨着障碍线索", get("clues.some(c => c.type.id === 'nearObstacle')"));
  check("障碍格图片可显示", [...cells()].filter((c, i) => get("board")[i] <= -2)
    .every(c => c.querySelector("img") && /^data:image/.test(c.querySelector("img").src)));
  check("线索卡含障碍图片", [...d.querySelectorAll(".clueCard img")].some(im => /^data:image/.test(im.src)));
  // 通关
  const pos5 = get("solutionPos"), ids5 = get("trayIds");
  for (const gid of ids5) {
    w.eval("picked = -1");
    click(trayItems()[ids5.indexOf(gid)]);
    click(cells()[pos5[gid].r * 5 + pos5[gid].c]);
  }
  check("机关侦探: 可通关", d.querySelector("#celebrate").classList.contains("show"));

  // 终极侦探 6×6：7 个障碍
  click(btns()[13]);
  check("终极侦探: 36 格", cells().length === 36);
  check("终极侦探: 7 个障碍", get("board").filter(v => v <= -2).length === 7, get("board").filter(v => v <= -2).length);
  const pos6 = get("solutionPos"), ids6 = get("trayIds");
  for (const gid of ids6) {
    w.eval("picked = -1");
    click(trayItems()[ids6.indexOf(gid)]);
    click(cells()[pos6[gid].r * 6 + pos6[gid].c]);
  }
  check("终极侦探: 可通关", d.querySelector("#celebrate").classList.contains("show"));

  // ===== 8×8 与 9×9 =====
  click(cat("fill"));
  click(btns()[10]);   // 宗师 8×8
  check("宗师 8×8: 64 格", cells().length === 64);
  check("宗师 8×8: 挖空 34", get("board").filter(v => v === -1).length === 34);
  check("宗师 8×8: 托盘 8 只", trayItems().length === 8);
  check("大棋盘样式生效", d.querySelector("#board").classList.contains("bigBoard") && d.querySelector("#boardWrap").classList.contains("bigBoard"));

  click(btns()[11]);   // 九宫格 9×9
  check("九宫格 9×9: 81 格", cells().length === 81, cells().length);
  check("九宫格 9×9: 挖空 45", get("board").filter(v => v === -1).length === 45, get("board").filter(v => v === -1).length);
  check("九宫格 9×9: 托盘 9 只", trayItems().length === 9);
  check("九宫格 9×9: 9 列", /repeat\(9,/.test(d.querySelector("#board").style.gridTemplateColumns));
  const sol9 = get("solution"), ft9 = get("fillTray");
  const inv9 = {}; ft9.forEach((gid, k) => inv9[gid] = k);
  for (let i = 0; i < 81; i++) {
    if (get("board")[i] === -1) {
      w.eval("picked = -1");
      click(trayItems()[inv9[sol9[Math.floor(i / 9)][i % 9]]]);
      click(cells()[i]);
    }
  }
  check("九宫格 9×9: 可通关", d.querySelector("#celebrate").classList.contains("show"));
  check("通关高亮 = 45 格", d.querySelectorAll(".cell.mine").length === 45, d.querySelectorAll(".cell.mine").length);

  check("无 JS 错误", errors.length === 0, errors.slice(0, 3).join(";"));
  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
})();
