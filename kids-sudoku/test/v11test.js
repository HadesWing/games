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
  check("版本 v13", /v13/.test(d.querySelector("#totalText").textContent));

  // ===== 小侦探通关 → 回看高亮 =====
  click(d.querySelectorAll(".lvBtn")[1]);
  const pos = get("solutionPos");
  const trayIdsLive = get("trayIds");
  for (const gid of trayIdsLive) {
    click(d.querySelectorAll("#tray .trayItem")[trayIdsLive.indexOf(gid)]);
    click(d.querySelectorAll(".cell")[pos[gid].r * 3 + pos[gid].c]);
  }
  check("通关弹层", d.querySelector("#celebrate").classList.contains("show"));
  const mineCount = d.querySelectorAll(".cell.mine").length;
  check("自己填的 3 格有绿色高亮框", mineCount === 3, mineCount);
  const fixedMine = get("fixed").filter(Boolean).length;
  check("题目原有格子无高亮", d.querySelectorAll(".cell.fixed.mine").length === 0, fixedMine);
  // 高亮格恰好是托盘动物所在位置
  const mineIdx = [...d.querySelectorAll(".cell")].map((c, i) => c.classList.contains("mine") ? i : -1).filter(i => i >= 0);
  const expect = trayIdsLive.map(gid => pos[gid].r * 3 + pos[gid].c).sort().join(",");
  check("高亮位置 = 玩家放置位置", mineIdx.sort().join(",") === expect, mineIdx.join(","));

  // 回看状态保持高亮
  click(d.querySelector("#reviewBtn"));
  check("回看后高亮保留", d.querySelectorAll(".cell.mine").length === 3);
  // 下一题高亮清除
  click(d.querySelector("#againBtn"));
  check("下一题高亮清除", d.querySelectorAll(".cell.mine").length === 0);

  // ===== 填空模式同样生效 =====
  click(d.querySelectorAll(".lvBtn")[0]);
  const sol = get("solution");
  for (let i = 0; i < 9; i++) {
    if (get("board")[i] === -1) {
      w.eval("picked = -1");
      click(d.querySelectorAll("#tray .trayItem")[sol[Math.floor(i / 3)][i % 3]]);
      click(d.querySelectorAll(".cell")[i]);
    }
  }
  check("填空模式通关", d.querySelector("#celebrate").classList.contains("show"));
  check("填空模式高亮 = 挖空数 4", d.querySelectorAll(".cell.mine").length === 4, d.querySelectorAll(".cell.mine").length);

  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
  if (errors.length) console.log("JS错误:", errors);
}, 400);
