const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const delay = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x != null ? " → " + x : "")); if (!c) failed++; };

function makeDom(seed, cat) {
  const errors = [];
  const vc = new VirtualConsole().on("jsdomError", e => errors.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", url: "http://localhost/g.html",
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      w.speechSynthesis = { speak(){}, cancel(){}, getVoices(){ return []; } };
      if (seed) w.localStorage.setItem("kidsudoku_v1", JSON.stringify(seed));
      if (cat) w.localStorage.setItem("kidsudoku_cat_v1", cat);
    }
  });
  return { w: dom.window, d: dom.window.document, errors };
}
const setup = (w, d) => {
  const get = e => w.eval(e);
  const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const cells = () => d.querySelectorAll(".cell");
  const tray = () => d.querySelectorAll("#tray .trayItem");
  const btns = () => d.querySelectorAll(".lvBtn");
  const solve = () => {
    if (get("mode") === "clue") {
      const n = get("LEVELS[level].size"), pos = get("solutionPos"), ids = get("trayIds");
      for (const gid of ids) {
        w.eval("picked = -1");
        click(tray()[ids.indexOf(gid)]);
        click(cells()[pos[gid].r * n + pos[gid].c]);
      }
    } else {
      const n = get("LEVELS[level].size"), sol = get("solution"), ft = get("fillTray");
      const inv = {}; ft.forEach((gid, k) => inv[gid] = k);
      for (let i = 0; i < n * n; i++) if (get("board")[i] === -1) {
        w.eval("picked = -1");
        click(tray()[inv[sol[Math.floor(i / n)][i % n]]]);
        click(cells()[i]);
      }
    }
  };
  return { get, click, cells, tray, btns, solve };
};
const saved = w => JSON.parse(w.localStorage.getItem("kidsudoku_v1") || "{}");

(async () => {
  // 取真实关卡题量表，避免测试里写死
  const probe = makeDom();
  await delay(300);
  const totals = probe.w.eval("LEVELS.map(L => L.total)");
  const sum = totals.reduce((a, b) => a + b, 0);
  check("题量表 14 关 / 244 题", totals.length === 14 && sum === 244, `${totals.length}/${sum}`);

  // ===== A：小侦探 3×3 已 12/12（还塞一条越界脏数据）=====
  const done12 = {};
  for (let i = 0; i < totals[1]; i++) done12[i] = 100;
  done12["99"] = 100; // 旧存档越界题号，必须被忽略
  const seedA = { "1": done12, "0": { 0: 100 } };
  const A = makeDom(seedA, "clue");
  await delay(300);
  const a = setup(A.w, A.d);
  check("版本 v16", /v16/.test(A.d.querySelector("#totalText").textContent));
  check("越界题号不计入进度", a.get("levelDone(1)") === 12, a.get("levelDone(1)"));
  check("小侦探 3×3 判定通关", a.get("levelCleared(1)") === true);
  check("总完成数 = 13（12 + 1）", a.get("totalDone()") === 13, a.get("totalDone()"));
  check("通关关卡数 = 1", a.get("clearedCount()") === 1, a.get("clearedCount()"));
  check("打开时自动离开已通关关", a.get("level") === 5, `level=${a.get("level")}`);
  check("总进度文字带分母", /已通关 1\/14 关/.test(A.d.querySelector("#totalText").textContent),
    A.d.querySelector("#totalText").textContent);
  check("已通关关卡按钮有 ✅ 标记", a.btns()[1].classList.contains("cleared")
    && /✅ 12\/12/.test(a.btns()[1].querySelector("small").textContent),
    a.btns()[1].querySelector("small").textContent);
  check("未通关关卡按钮无 ✅", !a.btns()[5].classList.contains("cleared"));
  a.click(A.d.querySelector("#statsBtn"));
  check("统计汇总带分母", /已通关 1\/14 个关卡/.test(A.d.querySelector("#statsSummary").textContent),
    A.d.querySelector("#statsSummary").textContent);
  const rowsA = [...A.d.querySelectorAll("#statsList .statRow")];
  const clueRow = rowsA.find(r => r.textContent.includes("小侦探 3×3"));
  check("统计里 14 行且通关行有 ✅", rowsA.length === 14 && !!clueRow && /✅/.test(clueRow.textContent),
    rowsA.length + " 行 / " + (clueRow ? clueRow.textContent.slice(0, 24) : "未找到"));
  a.click(A.d.querySelector("#statsCloseBtn"));

  // ===== B：手动进已通关关 = 复习；换一题 / 下一题直接去下一关 =====
  a.click(a.btns()[1]);
  check("进入已通关关 → 复习模式", a.get("reviewMode") === true);
  check("进度条文字标明复习", /复习/.test(A.d.querySelector("#statText").textContent),
    A.d.querySelector("#statText").textContent);
  check("提示说明进度不再变", /进度不会再变/.test(A.d.querySelector("#hintText").textContent));
  a.click(A.d.querySelector("#newBtn"));
  check("换一题不再抽本关旧题，跳到下一关", a.get("level") === 5, `level=${a.get("level")}`);
  check("跳关后仍在小侦探分类", a.get("category") === "clue" && a.get("reviewMode") === false);
  check("跳关有明确提示", /这一关全部通关啦/.test(A.d.querySelector("#hintText").textContent));
  a.click(a.btns()[1]);
  a.click(A.d.querySelector("#againBtn"));
  check("通关弹层的下一题也跳关", a.get("level") === 5, `level=${a.get("level")}`);

  // ===== C：Tab 切回时自动跳过已通关的关卡 =====
  A.w.eval("lastLevel['clue'] = 1");
  a.click(A.d.querySelector('.catBtn[data-cat="fill"]'));
  a.click(A.d.querySelector('.catBtn[data-cat="clue"]'));
  check("切回分类不落在已通关关", a.get("level") === 5, `level=${a.get("level")}`);

  // ===== D：真正做完本关最后一题 → 弹层文案 + 跳关 =====
  const done11 = {};
  for (let i = 0; i < totals[0] - 1; i++) done11[i] = 100;
  const D = makeDom({ "0": done11 }, "fill");
  await delay(300);
  const dd = setup(D.w, D.d);
  check("启动就出最后一题", dd.get("puzzleIndex") === totals[0] - 1, dd.get("puzzleIndex"));
  check("此时 11/12", dd.get("levelDone(0)") === 11, dd.get("levelDone(0)"));
  dd.solve();
  check("完成后 12/12", dd.get("levelCleared(0)") === true && dd.get("totalDone()") === 12,
    dd.get("totalDone()"));
  check("弹层提示本关全部通关", /本关全部通关/.test(D.d.querySelector("#winProg").textContent),
    D.d.querySelector("#winProg").textContent);
  check("弹层按钮变成去下一关", /本关通关 · 下一关/.test(D.d.querySelector("#againBtn").textContent),
    D.d.querySelector("#againBtn").textContent);
  dd.click(D.d.querySelector("#againBtn"));
  check("点下一题真的到下一关", dd.get("level") === 2, `level=${dd.get("level")}`);
  check("新关不是复习模式", dd.get("reviewMode") === false);
  check("存档仍是 12/12，没有多出题", dd.get("totalDone()") === 12);

  // ===== E：全部 244 题通关 → 自由复习，进度与分数都不变 =====
  const seedAll = {};
  totals.forEach((t, lv) => { seedAll[lv] = {}; for (let p = 0; p < t; p++) seedAll[lv][p] = 100; });
  const E = makeDom(seedAll, "fill");
  await delay(300);
  const e = setup(E.w, E.d);
  check("全部关卡判定通关", e.get("allCleared()") === true && e.get("clearedCount()") === 14);
  check("总进度 244/244", e.get("totalDone()") === 244, e.get("totalDone()"));
  check("没有下一关可去", e.get("nextOpenLevel(0)") === -1, e.get("nextOpenLevel(0)"));
  const before = JSON.stringify(saved(E.w));
  e.click(E.d.querySelector("#newBtn"));
  check("全通关后换题进入自由复习", /自由复习/.test(E.d.querySelector("#hintText").textContent));
  check("自由复习不改进度", e.get("totalDone()") === 244);
  e.solve();
  check("复习通关弹层标注不计分", /复习不计分/.test(E.d.querySelector("#winScore").textContent),
    E.d.querySelector("#winScore").textContent);
  check("复习通关不写存档", JSON.stringify(saved(E.w)) === before);
  check("全部通关弹层按钮文案", /自由复习/.test(E.d.querySelector("#againBtn").textContent),
    E.d.querySelector("#againBtn").textContent);

  // ===== F：无 JS 错误 =====
  const errs = [A, D, E].flatMap(x => x.errors);
  check("无 JS 错误", errs.length === 0, errs.slice(0, 3).join(";"));
  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
})();
