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
const rclick = el => el.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
const btns = () => d.querySelectorAll(".lvBtn");
const trayItems = () => d.querySelectorAll("#tray .trayItem");
const cells = () => d.querySelectorAll(".cell");
const delay = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x != null ? " → " + x : "")); if (!c) failed++; };

(async () => {
  await delay(400);
  check("版本 v13", /v13/.test(d.querySelector("#totalText").textContent));
  check("划线按钮默认关", /关/.test(d.querySelector("#markBtn").textContent));

  // ===== 划线提示开关 =====
  click(d.querySelector("#markBtn"));
  check("开关打开", get("markHint") === true);
  check("按钮文案→开", /开/.test(d.querySelector("#markBtn").textContent));
  check("开关状态已存本地", d.defaultView.localStorage.getItem("kidsudoku_marks_v1") === "1", d.defaultView.localStorage.getItem("kidsudoku_marks_v1"));

  click(btns()[8]);           // 大师 6×6
  await delay(60);
  const a0 = get("fillTray")[0];
  click(trayItems()[0]);      // 选第 1 只动物
  check("选中动物", get("picked") === a0);

  const expected = () => get(`(() => {
    const L = LEVELS[level], a = picked, out = new Set();
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== a) continue;
      const r = Math.floor(i / L.size), c = i % L.size;
      for (let k = 0; k < L.size; k++) { out.add(r * L.size + k); out.add(k * L.size + c); }
    }
    return [...out].filter(i => !fixed[i] && board[i] === -1).sort((x,y)=>x-y);
  })()`);
  const marked = () => [...cells()].map((c, i) => c.classList.contains("crossed") ? i : -1).filter(i => i >= 0).sort((x,y)=>x-y);
  check("同行同列空格打叉", JSON.stringify(marked()) === JSON.stringify(expected()), `实际 ${marked().length} / 预期 ${expected().length}`);
  check("有叉可查（非空集合）", marked().length > 0, marked().length);
  check("已固定格不打叉", [...cells()].every((c, i) => !c.classList.contains("crossed") || !get("fixed")[i]));
  check("已填格不打叉", [...cells()].every((c, i) => !c.classList.contains("crossed") || get("board")[i] === -1));

  // 切换到另一只动物 → 叉跟着换
  click(trayItems()[1]);
  const a1 = get("picked");
  check("切换动物", a1 !== a0 && a1 >= 0, `${a0}→${a1}`);
  check("叉随动物切换", JSON.stringify(marked()) === JSON.stringify(expected()), `实际 ${marked().length} / 预期 ${expected().length}`);

  // 放置一只后，叉实时更新
  const empties = get("board").map((v, i) => v === -1 ? i : -1).filter(i => i >= 0);
  const sol = get("solution");
  const target = empties.find(i => sol[Math.floor(i / 6)][i % 6] === a1);
  if (target != null) {
    click(cells()[target]);
    check("放置后重新计算叉", JSON.stringify(marked()) === JSON.stringify(expected()), `实际 ${marked().length} / 预期 ${expected().length}`);
  }

  // 关掉开关 → 叉清空
  click(d.querySelector("#markBtn"));
  check("关闭后叉清空", marked().length === 0, marked().length);
  click(d.querySelector("#markBtn")); // 再打开，方便后面测试

  // ===== 右键闪烁：棋盘动物 =====
  const animalCells = () => [...cells()].map((c, i) => get("board")[i] >= 0 ? i : -1).filter(i => i >= 0);
  const firstAnimal = animalCells()[0];
  const ev = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  cells()[firstAnimal].dispatchEvent(ev);
  check("右键阻止系统菜单", ev.defaultPrevented);
  const flashed = [...cells()].filter(c => c.classList.contains("flashAll")).length;
  check("所有已填动物一起闪", flashed === animalCells().length, `${flashed}/${animalCells().length}`);
  check("提示显示数量", /已经有 \d+ 只小动物/.test(d.querySelector("#hintText").textContent), d.querySelector("#hintText").textContent);
  check("空格不闪", [...cells()].every((c, i) => !c.classList.contains("flashAll") || get("board")[i] >= 0));
  await delay(1900);
  check("闪烁自动结束", [...cells()].every(c => !c.classList.contains("flashAll")));

  // 右键托盘动物也有效
  const ev2 = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  trayItems()[0].dispatchEvent(ev2);
  check("右键托盘同样闪烁", [...cells()].some(c => c.classList.contains("flashAll")), ev2.defaultPrevented);
  await delay(1900);

  // ===== 长按（手机）=====
  const touched = cells()[animalCells()[0]];
  touched.dispatchEvent(new w.Event("touchstart", { bubbles: true }));
  await delay(650);
  check("长按触发闪烁", [...cells()].some(c => c.classList.contains("flashAll")));
  check("长按后点击被吞掉", get("suppressClick") === true);
  clickedGuard = get("board").filter(v => v === -1).length;
  click(touched);
  check("长按松手不误放", get("board").filter(v => v === -1).length === clickedGuard);
  await delay(900);

  // 静音时划线提示仍可用（不受声音开关影响）
  click(d.querySelector("#soundBtn"));
  w.eval("picked = -1; updateTray()");
  click(trayItems()[1]);
  check("静音下划线仍然工作", marked().length > 0, marked().length);
  click(d.querySelector("#soundBtn"));

  check("无 JS 错误", errors.length === 0, errors.slice(0, 3).join(";"));
  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
})();
