const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const errors = [];
const vc = new VirtualConsole().on("jsdomError", e => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/g.html", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window;
setTimeout(() => {
  const levels = w.eval("JSON.parse(JSON.stringify(LEVELS))");
  let bad = 0;
  const t0 = Date.now();
  for (let lv = 0; lv < levels.length; lv++) {
    const L = levels[lv];
    for (let p = 0; p < L.total; p++) {
      w.eval(`rnd = mulberry32(seedFor(${lv}, ${p}))`);
      if (L.mode === "fill") {
        const ok = w.eval(`(() => {
          const idMap = ${L.size} >= 6 ? shuffle([...Array(12).keys()]).slice(0, ${L.size}) : [...Array(${L.size}).keys()];
          const pz = makeFillPuzzle(${L.size}, ${L.blanks}, idMap);
          for (let r = 0; r < ${L.size}; r++) {
            const row = new Set(), col = new Set();
            for (let c = 0; c < ${L.size}; c++) { row.add(pz.solution[r][c]); col.add(pz.solution[c][r]); }
            if (row.size !== ${L.size} || col.size !== ${L.size}) return false;
          }
          return pz.fixedMap.filter(f => !f).length === ${L.blanks};
        })()`);
        if (!ok) { console.log(`BAD fill lv${lv} p${p}`); bad++; }
      } else {
        const ok = w.eval(`(() => {
          const pz = makeCluePuzzle(${L.size}, ${JSON.stringify(L.obs || false)});
          if (pz.finalCount !== 1) return false;
          if (pz.fixedBoard.filter(v => v === -1).length !== ${L.size}) return false;
          const obsCount = pz.fixedBoard.filter(v => v <= -2).length;
          const want = ${typeof L.obs === "number" ? L.obs : (L.obs ? 3 : 0)};
          if (obsCount !== want) return false;
          if (!pz.clues.every(cl => clueSatisfied(cl, pz.answer))) return false;
          ${L.obs ? "if (!pz.clues.some(cl => cl.type.kind === 'obstacle')) return false;" : ""}
          return true;
        })()`);
        if (!ok) { console.log(`BAD clue lv${lv} p${p}`); bad++; }
      }
    }
    console.log(`lv${lv} ${L.label}: ${L.total} 题通过${L.obs ? " (障碍" + (typeof L.obs === "number" ? L.obs : 3) + ")" : ""}`);
  }
  const total = levels.reduce((s, L) => s + L.total, 0);
  console.log(`总题数 ${total}，异常 ${bad}，耗时 ${Date.now()-t0}ms，JS错误 ${errors.length}`);
  console.log(bad === 0 && errors.length === 0 ? "=== 全量通过 ===" : "=== 存在异常 ===");
}, 400);
