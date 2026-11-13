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
ok('端点收紧为 50~100', range() === '50~100', range());
ok('反馈里也是 50~100', fb().includes('50~100'), fb());
ok('历史显示实际可猜区间', q('#history').textContent.includes('50 ~ 100'));
ok('下界更新为 49', api.state().low === 49 && api.state().lowEx === true);
ok('上界保持 100', api.state().high === 100);
ok('计 1 次', q('#tries').textContent === '1');
ok('历史出现 49', q('#history').textContent.includes('49'));

console.log('=== 继续夹逼：猜 70 太大 ===');
api.guess(70);
ok('反馈说太大了', fb().includes('太大了'), fb());
ok('两端收紧为 50~69', range() === '50~69', range());
ok('上界更新为 70', api.state().high === 70 && api.state().highEx === true);
ok('区间提示写明剩余 20 个可能', q('#rangeHint').textContent.includes('还剩 20 个可能'), q('#rangeHint').textContent);
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
ok('赢后标签变成「答案是」', q('#rangeLabel').textContent === '答案是');
ok('赢后大数字显示答案 56', range() === '56', range());
ok('赢后提示本局结束', q('#rangeHint').textContent.includes('本局结束'));

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
ok('大数档也正确夹逼', range() === '5,001~10,000', range());

console.log('=== 战绩上限 20 局 ===');
for (let i = 0; i < 25; i++) {
  api.newGame('100');
  api.guess(api.state().target);
}
const rec = JSON.parse(w.localStorage.getItem('guessnum_v1')).records;
ok('战绩不超过 20 条', rec.length === 20, 'len=' + rec.length);
ok('保留的是最近一局', rec[0].tries === 1);

console.log('=== 端点不显示：答案 56，先猜 2 再猜 100 ===');
api.newGame('100');
api.state().target = 56;
api.guess(2);
ok('猜 2 后显示 3~100', range() === '3~100', range());
api.guess(100);
ok('两端收紧为 3~99', range() === '3~99', range());
ok('提示只剩 97 个可能', q('#rangeHint').textContent.includes('还剩 97 个可能'), q('#rangeHint').textContent);
ok('反馈里不再出现排除端点', fb().includes('3~99') && !fb().includes('2~100'), fb());
const t1 = api.state().tries;
submitValue('2');
ok('猜过的 2 被拦截', api.state().tries === t1 && fb().includes('已经排除'), fb());
submitValue('100');
ok('猜过的 100 被拦截', api.state().tries === t1 && fb().includes('已经排除'), fb());
ok('拦截提示显示 3~99', fb().includes('3~99'), fb());
submitValue('3');
ok('下边界 3 可以正常猜', api.state().tries === t1 + 1, 'tries=' + api.state().tries);
ok('再收紧为 4~99', range() === '4~99', range());

console.log('=== 上边界与只剩一个数 ===');
api.newGame('100');
api.state().target = 56;
api.guess(2); api.guess(100); api.guess(99);
ok('上边界也向内收 1', range() === '3~98', range());
api.newGame('100');
api.state().target = 5;
api.guess(4); api.guess(6);
ok('只剩一个可能时显示单数字', range() === '5', range());
ok('提示只剩 1 个可能', q('#rangeHint').textContent.includes('还剩 1 个可能'), q('#rangeHint').textContent);

console.log('\n结果: ' + pass + ' PASS / ' + fail + ' FAIL');
w.close();
process.exit(fail ? 1 : 0);
