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
  check("版本 v10", /v10/.test(d.querySelector("#totalText").textContent));
  check("12 只动物", get("ANIMALS.length") === 12, get("ANIMALS.length"));
  check("障碍侦探图标是 🌵", d.querySelectorAll(".lvBtn")[6].textContent.includes("🌵"));

  // ===== 大侦探背景丰富度：不同背景动物种类数 =====
  click(d.querySelectorAll(".lvBtn")[5]);
  const cells4 = [...d.querySelectorAll(".cell")];
  const sceneryTypes = new Set(cells4.filter(c => c.querySelector("img")).map(c => c.querySelector("img").alt));
  check("大侦探背景 ≥5 种动物（不再只有猫兔）", sceneryTypes.size >= 5, [...sceneryTypes].join(","));

  // 多题验证种类丰富度
  let minTypes = 99;
  for (let t = 0; t < 6; t++) {
    click(d.querySelector("#newBtn"));
    const cs = [...d.querySelectorAll(".cell")].filter(c => c.querySelector("img")).map(c => c.querySelector("img").alt);
    minTypes = Math.min(minTypes, new Set(cs).size);
  }
  check("6 道题背景种类都 ≥5", minTypes >= 5, minTypes);

  // ===== 大侦探通关回归 =====
  click(d.querySelectorAll(".lvBtn")[5]);
  const pos = get("solutionPos");
  const trayIdsLive = get("trayIds");
  for (const gid of trayIdsLive) {
    click(d.querySelectorAll("#tray .trayItem")[trayIdsLive.indexOf(gid)]);
    click(d.querySelectorAll(".cell")[pos[gid].r * 4 + pos[gid].c]);
  }
  check("大侦探通关", d.querySelector("#celebrate").classList.contains("show"));

  // ===== 单关重置 =====
  click(d.querySelector("#reviewBtn"));
  get("recordDone(1,0,100)"); get("recordDone(1,1,90)"); get("recordDone(2,0,80)");
  click(d.querySelector("#statsBtn"));
  check("统计面板打开", d.querySelector("#statsPanel").classList.contains("show"));
  const rows = d.querySelectorAll(".statRow");
  check("7 行关卡统计", rows.length === 7, rows.length);
  const resetBtns = d.querySelectorAll(".rowReset");
  check("每行有重置按钮", resetBtns.length === 7, resetBtns.length);
  const done1 = get("levelDone(1)"), done2 = get("levelDone(2)");
  check("准备数据：关1有2题 关2有1题", done1 === 2 && done2 === 1, done1 + "/" + done2);
  // 只重置关卡 1（两次点击确认）
  const btn1 = d.querySelector('.rowReset[data-lv="1"]');
  click(btn1);
  check("第一次点只武装确认", get("levelDone(1)") === 2 && btn1.classList.contains("armed"));
  click(btn1);
  check("第二次点只清了关卡 1", get("levelDone(1)") === 0, get("levelDone(1)"));
  check("关卡 2 进度未受影响", get("levelDone(2)") === 1, get("levelDone(2)"));
  check("总进度剩 2 题（关2 的 1 题 + 大侦探通关 1 题）", get("totalDone()") === 2, get("totalDone()"));
  // 刷新后面板行更新
  check("关卡 1 行重置按钮隐藏", !d.querySelector('.rowReset[data-lv="1"]').textContent.trim());

  // ===== 全局重置回归 =====
  const gbtn = d.querySelector("#resetBtn");
  click(gbtn); click(gbtn);
  check("全局重置仍然可用", get("totalDone()") === 0);

  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
  if (errors.length) console.log("JS错误:", errors);
}, 400);
