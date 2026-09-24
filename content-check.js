/* ══════════════════════════════════════════════════════════════════════
 * content-check.js —— 全量内容校验（维护用，不被网页加载）
 *
 * 用法：在本目录执行  node content-check.js
 * 它读取 data/manifest.js 的契约，对 data/ 下的内容做一遍体检：
 *   · 每张声明过的表是否存在
 *   · records / map 类型的字段是否满足契约（必填、类型、枚举、引用存在性、身份键唯一）
 *   · 跨表引用完整性：六张以条目名索引的侧表、KB_REL 的关联值、
 *     KB_GLOSS_USE 的术语键、KB_ITEM_PROC 的条目键、问答领域与文件是否一一对应
 *   · 原理问答的专项规则（选项数、正确项留空、干扰项说明齐全、题干不重复）
 *
 * 与 qa-check.js 的分工：qa-check 只管原理问答的细节规则、输出更细；
 * content-check 覆盖全部内容类型，是提交前的总检。
 * ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');

const DIR = __dirname;
const errs = [], warns = [];

/* ── 在一个沙箱里加载数据与框架，模拟浏览器环境 ── */
function makeSandbox() {
  const s = {
    window: null, console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { createElement: () => ({ setAttribute() {}, appendChild() {}, style: {} }) },
    setTimeout, clearTimeout, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Date, isFinite
  };
  s.window = s;
  s.indexedDB = null;
  vm.createContext(s);
  return s;
}
const s = makeSandbox();
const load = (rel) => {
  const p = path.join(DIR, rel);
  if (!fs.existsSync(p)) { errs.push('缺文件 ' + rel); return false; }
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), s, { filename: rel }); return true; }
  catch (e) { errs.push(rel + ' 加载失败: ' + e.message.slice(0, 80)); return false; }
};

/* 框架层（与网页同一份代码，保证校验规则与界面一致） */
load('core/dom.js'); load('core/schema.js'); load('core/store.js'); load('core/validate.js');
const C = s.KBCore;

/* 数据层：按 data/manifest.js 声明的文件加载，另加 manifest 本身 */
load('data/manifest.js');
const MANIFEST = s.KB_MANIFEST || [];
if (!MANIFEST.length) { console.error('❌ data/manifest.js 里没有 KB_MANIFEST'); process.exit(1); }
const files = Array.from(new Set(MANIFEST.map(d => d.file).filter(f => f && f !== '__split__')));
files.forEach(f => load('data/' + f));
/* 原理问答的题目按领域分散 */
MANIFEST.filter(d => d.splitBy).forEach(def => {
  const meta = s[def.key === 'KB_QA' ? 'KB_QA_META' : ''];
  (s.KB_QA_META || []).forEach(m => load('data/qa-' + m.id + '.js'));
});

/* ══════════ ① 逐表登记（校验规则统一在 core/validate.js，与后台共用）══════════ */
const missing = [];
MANIFEST.forEach(def => { if (!C.store.register(def)) missing.push(def.key); });
if (missing.length) errs.push('契约声明了但数据里没有: ' + missing.join(' '));

const R = C.validateAll();
R.errs.forEach(x => errs.push(x));
R.warns.forEach(x => warns.push(x));
const counts = R.counts;
/* 首页统计用的参考图数量 */
const imgTotal = C.store.has('KB_IMG') ? Object.values(C.store.get('KB_IMG')).reduce((a, v) => a + v.length, 0) : 0;

/* ══════════ ②b STEP 解析引擎完整性（vendor/occt）══════════
 * 引擎缺失或被改动时页面表现为「能打开、解析必失败」，必须在发布前拦住。
 * 版本与哈希锁在 vendor/occt/VENDOR.json —— 升级引擎时更新该文件。 */
{
  const vdir = path.join(DIR, 'vendor', 'occt');
  const meta = path.join(vdir, 'VENDOR.json');
  if (!fs.existsSync(meta)) {
    errs.push('缺 vendor/occt/VENDOR.json（STEP 解析引擎的版本与哈希清单，见文件内说明）');
  } else {
    let v;
    try { v = JSON.parse(fs.readFileSync(meta, 'utf8')); }
    catch (e) { errs.push('vendor/occt/VENDOR.json 不是合法 JSON: ' + e.message); }
    if (v && v.files) {
      Object.keys(v.files).forEach(name => {
        const p = path.join(vdir, name);
        if (!fs.existsSync(p)) { errs.push('STEP 引擎缺文件 vendor/occt/' + name); return; }
        const actual = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
        if (actual !== v.files[name]) errs.push('vendor/occt/' + name + ' 的 SHA-256 与 VENDOR.json 不符（文件被改动或版本错配）');
      });
      /* 目录里多出的运行文件同样危险：可能是旧版本残留导致 worker 加载到错误依赖 */
      const expected = new Set(Object.keys(v.files).concat(['VENDOR.json']));
      fs.readdirSync(vdir).filter(f => fs.statSync(path.join(vdir, f)).isFile()).forEach(f => {
        if (!expected.has(f)) errs.push('vendor/occt/ 里有多余文件 ' + f + '（未在 VENDOR.json 登记）');
      });
    }
  }
}

/* ══════════ ③ 输出 ══════════ */
console.log('内容体检\n');
const groups = { site: '站点配置', kb: '知识库', qa: '原理问答', field: '实战宝典', ref: '参考工具' };
Object.keys(groups).forEach(g => {
  const rows = MANIFEST.filter(d => d.group === g && counts[d.key] !== undefined);
  if (!rows.length) return;
  console.log('【' + groups[g] + '】');
  const w = Math.max.apply(null, rows.map(d => (d.label || '').length));
  rows.forEach(d => console.log('  ' + (d.label || d.key).padEnd(w + 2) + String(counts[d.key]).padStart(4) + ' 项'));
  console.log('');
});
console.log('知识点 ' + (counts.KB_ITEMS || 0) + ' 条 · 问答 ' + (counts.KB_QA || 0) + ' 题 · 参考图 ' + imgTotal + ' 张 · 术语 ' + (counts.KB_GLOSS || 0) + ' 条\n');

if (warns.length) { console.log('⚠️ 提示 ' + warns.length + ' 条:'); warns.slice(0, 20).forEach(x => console.log('   · ' + x)); console.log(''); }
if (errs.length) {
  console.log('❌ 发现 ' + errs.length + ' 个问题（前 40 条）:');
  errs.slice(0, 40).forEach(x => console.log('   · ' + x));
  process.exit(1);
}
console.log('✓ 全部通过');
