// 猜数字网页版 DOM 回归：node tests/test.js
// 需要 jsdom；未安装时自动跳过（退出码 0），不会阻塞构建。
const fs = require('fs');
const path = require('path');

let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.log('jsdom 未安装，DOM 回归跳过'); process.exit(0); }

const file = path.join(__dirname, '..', 'index.html');
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true
});
const w = dom.window, d = w.document, api = w.__guessNumber;
let pass = 0, fail = 0;
const q = s => d.querySelector(s);
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
}
function submitValue(v) {
  q('#guess').value = v;
  q('#form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}
const fb = () => q('#feedback').textContent;
const range = () => q('#rangeText').textContent;

console.log('=== 初始状态 ===');
ok('初始范围 1~100', range() === '1~100', range());
ok('初始次数 0', q('#tries').textContent === '0');
ok('理论最少 7 次', q('#ideal').textContent === '7', q('#ideal').textContent);
ok('历史为空', q('#history').textContent.includes('还没有猜过'));
ok('三档难度按钮', d.querySelectorAll('.mode').length === 3);

console.log('=== 范围夹逼：答案 56，先猜 49 ===');
api.state().target = 56;
api.guess(49);
ok('反馈说太小了', fb().includes('太小了'), fb());
ok('锁定范围 49~100', range() === '49~100', range());
ok('下界更新为 49', api.state().low === 49 && api.state().lowEx === true);
ok('上界保持 100', api.state().high === 100);
ok('计 1 次', q('#tries').textContent === '1');
ok('历史出现 49', q('#history').textContent.includes('49'));

console.log('=== 继续夹逼：猜 70 太大 ===');
api.guess(70);
ok('反馈说太大了', fb().includes('太大了'), fb());
ok('锁定范围 49~70', range() === '49~70', range());
ok('上界更新为 70', api.state().high === 70 && api.state().highEx === true);
ok('区间提示写明不含两端', q('#rangeHint').textContent.includes('不含两端'));
ok('区间条已收窄', parseFloat(q('#barFill').style.width) < 100, q('#barFill').style.width);

console.log('=== 非法输入与已排除端点 ===');
const before = api.state().tries;
submitValue('49');
ok('已排除的数不再计入次数', api.state().tries === before, 'tries=' + api.state().tries);
ok('给出已排除提示', fb().includes('已经排除'), fb());
submitValue('abc');
ok('非整数输入被拦截', fb().includes('正整数') && api.state().tries === before, fb());
submitValue('99999');
ok('超出档位范围被拦截', fb().includes('之间哦') && api.state().tries === before, fb());

console.log('=== 猜中结算 ===');
api.guess(56);
ok('反馈猜中', fb().includes('猜中'), fb());
ok('显示答案 56', fb().includes('56'));
ok('局已结束', api.state().done === true);
ok('本档最佳写入 3 次', q('#best').textContent === '3 次', q('#best').textContent);
ok('战绩已存本地', w.localStorage.getItem('guessnum_v1').includes('"records"'));
ok('按钮变为再来', q('#go').textContent === '再来');

console.log('=== 难度切换 ===');
api.newGame('1000');
ok('1000 档范围 1~1,000', range() === '1~1,000', range());
ok('1000 档理论最少 10 次', q('#ideal').textContent === '10', q('#ideal').textContent);
api.newGame('10000');
ok('1 万档范围 1~10,000', range() === '1~10,000', range());
ok('1 万档理论最少 14 次', q('#ideal').textContent === '14', q('#ideal').textContent);
ok('高亮 1 万按钮', q('.mode.active').getAttribute('data-max') === '10000');
api.state().target = 7321;
api.guess(5000);
ok('大数档也正确夹逼', range() === '5,000~10,000', range());

console.log('=== 战绩上限 20 局 ===');
for (let i = 0; i < 25; i++) {
  api.newGame('100');
  api.guess(api.state().target);
}
const rec = JSON.parse(w.localStorage.getItem('guessnum_v1')).records;
ok('战绩不超过 20 条', rec.length === 20, 'len=' + rec.length);
ok('保留的是最近一局', rec[0].tries === 1);

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
w.close();
process.exit(fail ? 1 : 0);
