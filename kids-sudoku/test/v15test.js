const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const errors = [];
const vc = new VirtualConsole().on("jsdomError", e => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/g.html", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, d = w.document;
w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
const spoken = [];
w.speechSynthesis = { speak(u){ spoken.push(u.text); }, cancel(){}, getVoices(){ return []; } };
const get = e => w.eval(e);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const rclick = el => el.dispatchEvent(new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
const btns = () => d.querySelectorAll(".lvBtn");
const cells = () => d.querySelectorAll(".cell");
const trayItems = () => d.querySelectorAll("#tray .trayItem");
const flashing = () => [...cells()].map((c, i) => c.classList.contains("flashAll") ? i : -1).filter(i => i >= 0);
const lit = () => [...cells()].map((c, i) => c.classList.contains("spotlight") ? i : -1).filter(i => i >= 0);
const sameAs = v => [...get("board")].map((x, i) => x === v ? i : -1).filter(i => i >= 0);
const delay = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (n, c, x) => { console.log((c ? "PASS " : "FAIL ") + n + (x != null ? " → " + x : "")); if (!c) failed++; };

(async () => {
  await delay(400);
  check("版本 v15", /v15/.test(d.querySelector("#totalText").textContent));

  click(btns()[8]);            // 大师 6×6：动物多、空格多
  await delay(60);
  const board0 = get("board");
  const firstAnimalCell = board0.findIndex(v => v >= 0);
  const a = board0[firstAnimalCell];
  const aName = get(`thingName(${a})`);
  const aSet = sameAs(a);
  check("测试关有多种动物", new Set(board0.filter(v => v >= 0)).size >= 2);

  // ===== 右键棋盘动物：只有同一种亮 =====
  const ev = new w.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  cells()[firstAnimalCell].dispatchEvent(ev);
  check("右键阻止系统菜单", ev.defaultPrevented);
  check("只闪同一种动物", JSON.stringify(flashing()) === JSON.stringify(aSet), `${flashing().length}/${aSet.length}`);
  check("持续描边也是同一种", JSON.stringify(lit()) === JSON.stringify(aSet));
  check("其它动物/障碍/空格不亮", [...cells()].every((c, i) =>
    !c.classList.contains("spotlight") || get("board")[i] === a));
  check("提示写明是哪一只和数量", d.querySelector("#hintText").textContent.includes(aName)
    && /在棋盘上有 \d+ 只/.test(d.querySelector("#hintText").textContent), d.querySelector("#hintText").textContent);
  check("托盘对应项也被标记", [...trayItems()].filter(t => t.classList.contains("traySpot"))
    .every(t => +t.dataset.animal === a)
    && [...trayItems()].some(t => t.classList.contains("traySpot")));
  check("spotlightId 记的是这只", get("spotlightId") === a, get("spotlightId"));
  await delay(1900);
  check("动画结束后描边仍在", flashing().length === 0 && lit().length === aSet.length);

  // ===== 换一只动物：旧高亮必须清干净 =====
  const b = board0.find(v => v >= 0 && v !== a);
  const bCell = board0.indexOf(b);
  rclick(cells()[bCell]);
  const bSet = sameAs(b);
  check("换动物后只闪新的一种", JSON.stringify(flashing()) === JSON.stringify(bSet), `${flashing().length}/${bSet.length}`);
  check("旧动物的高亮已清除", lit().every(i => get("board")[i] === b));
  check("托盘标记跟着换", [...trayItems()].filter(t => t.classList.contains("traySpot"))
    .every(t => +t.dataset.animal === b));

  // ===== 右键托盘动物 =====
  const t0 = trayItems()[0], t0a = +t0.dataset.animal;
  rclick(t0);
  check("右键托盘只高亮该动物", JSON.stringify(flashing()) === JSON.stringify(sameAs(t0a)),
    `${flashing().length}/${sameAs(t0a).length}`);

  // ===== 右键空格：已选动物 → 查选中的；未选 → 清空 =====
  const emptyCell = get("board").findIndex(v => v === -1);
  w.eval(`picked = ${t0a}`);
  rclick(cells()[emptyCell]);
  check("空格右键→高亮已选中的动物", JSON.stringify(lit()) === JSON.stringify(sameAs(t0a)));
  w.eval("picked = -1");
  rclick(cells()[emptyCell]);
  check("未选动物时空格右键清空高亮", lit().length === 0 && get("spotlightId") === null);
  check("空格提示友好", /还空着/.test(d.querySelector("#hintText").textContent));

  // ===== 放置/拿回后描边实时刷新 =====
  rclick(trayItems()[0]);
  const before = lit().length;
  const sol = get("solution"), ft = get("fillTray");
  const inv = {}; ft.forEach((gid, k) => inv[gid] = k);
  const spot = t0a;
  const target = get("board").findIndex((v, i) => v === -1 && sol[Math.floor(i / 6)][i % 6] === spot);
  check("找到该动物的合法空格", target >= 0, target);
  w.eval("picked = -1");
  click(trayItems()[inv[spot]]);
  click(cells()[target]);
  check("放置后新格子自动亮起", lit().length === before + 1 && lit().includes(target), `${before}→${lit().length}`);
  w.eval("picked = -1");
  click(cells()[target]);
  check("拿回后该格子熄灭", lit().length === before && !lit().includes(target));

  // ===== 长按（手机）同样只闪一种 =====
  const touched = cells()[board0.findIndex(v => v >= 0)];
  const touchedId = get("board")[[...cells()].indexOf(touched)];
  touched.dispatchEvent(new w.Event("touchstart", { bubbles: true }));
  await delay(650);
  check("长按只闪同一种", JSON.stringify(flashing()) === JSON.stringify(sameAs(touchedId)),
    `${flashing().length}/${sameAs(touchedId).length}`);
  await delay(1300);

  // ===== 障碍格：只亮同一种障碍 =====
  click(btns()[12]);            // 机关侦探 5×5
  await delay(60);
  const obBoard = get("board");
  const obsCell = obBoard.findIndex(v => v <= -2);
  const obsId = obBoard[obsCell];
  rclick(cells()[obsCell]);
  check("障碍格只亮同一种障碍", JSON.stringify(flashing()) === JSON.stringify(sameAs(obsId)),
    `${flashing().length}/${sameAs(obsId).length}`);
  check("障碍提示含障碍名", d.querySelector("#hintText").textContent.includes(get(`thingName(${obsId})`)),
    d.querySelector("#hintText").textContent);

  // ===== 换关/换题清空 =====
  check("切关前仍有高亮", get("spotlightId") !== null);
  click(btns()[0]);
  await delay(60);
  check("换关后高亮清空", get("spotlightId") === null && lit().length === 0
    && d.querySelectorAll(".trayItem.traySpot").length === 0);

  check("语音播报按种类读数量", spoken.some(s => /有\d+只|还没有放|有\d+个/.test(s)), spoken.slice(0, 4).join("|"));
  check("无 JS 错误", errors.length === 0, errors.slice(0, 3).join(";"));
  console.log(failed === 0 ? "\n=== ALL PASS ===" : "\n=== " + failed + " FAILURES ===");
})();
