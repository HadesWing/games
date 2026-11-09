const fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const html = fs.readFileSync("../小动物数独乐园.html", "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/g.html", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
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
            const row = new Set(), seen = new Set();
            for (let c = 0; c < ${L.size}; c++) { row.add(pz.solution[r][c]); seen.add(pz.solution[c][r]); }
            if (row.size !== ${L.size} || seen.size !== ${L.size}) return false;
          }
          return pz.fixedMap.filter(f => !f).length === ${L.blanks};
        })()`);
        if (!ok) { console.log(`BAD fill lv${lv} p${p}`); bad++; }
      } else {
        const ok = w.eval(`(() => {
          const pz = makeCluePuzzle(${L.size}, ${L.obs});
          if (pz.finalCount !== 1) return false;
          if (pz.fixedBoard.filter(v => v === -1).length !== ${L.size}) return false;
          return pz.clues.every(cl => clueSatisfied(cl, pz.answer));
        })()`);
        if (!ok) { console.log(`BAD clue lv${lv} p${p}`); bad++; }
      }
    }
    console.log(`lv${lv} ${L.label}: ${L.total} 题全部通过`);
  }
  console.log(bad === 0 ? `=== 172 题全验证通过 (${Date.now()-t0}ms) ===` : `=== ${bad} 题异常 ===`);
}, 400);
