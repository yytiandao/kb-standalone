/* ══════════════════════════════════════════════════════════════════════
 * qa-check.js —— 原理问答数据校验（维护用，不被网页加载）
 *
 * 用法：在本目录执行  node qa-check.js
 * 加完题目跑一次；它会逐条报出「哪个文件的第几题、哪个字段有问题」。
 *
 * 逐题规则与 id 派生算法在 core/validate.js 里维护（与后台、content-check 共用），
 * 本文件只负责：加载文件、领域↔文件对应关系、结果输出。
 * ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const DIR = __dirname;
const errs = [], warns = [];

// ── 沙箱：加载领域清单与共享校验核心 ──
function freshSandbox() {
  const s = { window: null, console: { log() {}, warn() {}, error() {} } };
  s.window = s; vm.createContext(s);
  return s;
}
function run(s, file) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return false;
  vm.runInContext(fs.readFileSync(p, 'utf8'), s, { filename: file });
  return true;
}

const s = freshSandbox();
if (!run(s, 'core/dom.js') || !run(s, 'core/schema.js') || !run(s, 'core/store.js') || !run(s, 'core/validate.js')) {
  console.error('❌ core/ 框架文件缺失（dom/schema/store/validate）'); process.exit(1);
}
const C = s.KBCore;
if (!run(s, 'data/qa-meta.js')) { console.error('❌ 找不到 data/qa-meta.js'); process.exit(1); }
const META = vm.runInContext('window.KB_QA_META', s);
if (!Array.isArray(META) || !META.length) { console.error('❌ data/qa-meta.js 里的 KB_QA_META 为空或不是数组'); process.exit(1); }

// 领域清单自身的检查（规则同 core/validate.js 的 validateQaMeta）
const metaIds = C.validateQaMeta(META, errs, warns);

// ── 逐个领域加载数据文件并校验（逐题规则共用 core/validate.js）──
const allQ = new Map();            // 题干 → 出处（查全局重复）
const allId = new Map();           // id  → 出处
const summary = [];
let totalQ = 0;

for (const m of META) {
  const file = 'data/qa-' + m.id + '.js';
  const ok = run(s, file);
  if (!ok) { errs.push('缺数据文件 ' + file + '（KB_QA_META 里有 ' + m.id + '，但没有对应文件）'); continue; }
  const arr = vm.runInContext('window.KB_QA[' + JSON.stringify(m.id) + ']', s);
  if (!Array.isArray(arr)) { errs.push(file + ' 没有正确赋值 window.KB_QA[' + JSON.stringify(m.id) + ']（应为数组）'); continue; }
  if (!arr.length) warns.push(file + ' 是空数组（该领域暂无内容）');

  const r = C.validateQa(arr, m.id, i => file + ' 第 ' + (i + 1) + ' 题', allQ, allId);
  r.errs.forEach(x => errs.push(x));
  r.warns.forEach(x => warns.push(x));
  summary.push({ id: m.id, name: m.name, n: arr.length });
  totalQ += arr.length;
}

// 反向：data/ 里存在问答数据文件但 KB_QA_META 里没有（文件不会被加载）
const metaFiles = new Set(META.map(m => 'qa-' + m.id + '.js'));
try {
  fs.readdirSync(path.join(DIR, 'data')).filter(f => /^qa-[\w-]+\.js$/.test(f) && f !== 'qa-meta.js').forEach(f => {
    if (!metaFiles.has(f)) warns.push('data/' + f + ' 存在但 data/qa-meta.js 的 KB_QA_META 里没有它的领域，所以不会被加载');
  });
} catch (e) { /* data 目录缺失时上面已报错 */ }

// ── 输出 ──
console.log('原理问答数据校验\n');
const w = Math.max(...summary.map(x => x.name.length), 6);
summary.forEach(x => console.log('  ' + x.name.padEnd(w) + '  ' + String(x.n).padStart(3) + ' 问'));
console.log('  ' + '合计'.padEnd(w) + '  ' + String(totalQ).padStart(3) + ' 问\n');
if (warns.length) { console.log('⚠️ 提示 ' + warns.length + ' 条:'); warns.slice(0, 20).forEach(x => console.log('   · ' + x)); console.log(''); }
if (errs.length) {
  console.log('❌ 错误 ' + errs.length + ' 条（需修正）:');
  errs.slice(0, 60).forEach(x => console.log('   · ' + x));
  process.exit(1);
}
console.log('✓ 全部通过');
