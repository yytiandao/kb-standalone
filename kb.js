/* ══════════════════════════════════════════════════════════════════════
 * kb.js —— 知识库查询 CLI（给 AI 维护工具与人工排查用，零依赖）
 *
 * 用法：
 *   node kb.js stats                各表条数一览
 *   node kb.js schema [表名]        数据契约（manifest 字段定义）JSON；不带表名输出全部
 *   node kb.js search <关键词>      跨表搜索（条目/术语/标准/问答），JSON 输出
 *   node kb.js get <条目名>         条目全量视图：本体 + 深度解析/经验数值/关联/记忆/
 *                                   动手练习/参考图/图用法 六张侧表按条目名联结
 *   node kb.js qa [领域id] [条数]   原理问答按领域查看（不带 id 列出领域清单）
 *
 * 给 AI 工具的约定：要查内容先用本脚本取精确上下文，不要整读 data/ 下的
 * 大文件（items-side.js 1.4MB 会撑爆上下文）；改动后必跑 node content-check.js。
 * ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const DIR = __dirname;

/* 与 content-check 同一套沙箱加载方式 */
function loadAll() {
  const s = { console: { log() {}, warn() {}, error() {} } };
  s.window = s;
  vm.createContext(s);
  const load = f => vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), s, { filename: f });
  load('data/manifest.js');
  const files = Array.from(new Set((s.KB_MANIFEST || []).map(d => d.file).filter(f => f && f !== '__split__')));
  files.forEach(f => load('data/' + f));
  (s.KB_QA_META || []).forEach(m => { try { load('data/qa-' + m.id + '.js'); } catch (e) { /* 缺文件由 content-check 报 */ } });
  return s;
}

function count(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Object.keys(v).length;
  return v === undefined ? 0 : 1;
}

function cmdStats() {
  const s = loadAll();
  const out = {};
  (s.KB_MANIFEST || []).forEach(d => { out[d.key] = count(s[d.key]); });
  console.log(JSON.stringify(out, null, 1));
}

function cmdSchema(key) {
  const s = loadAll();
  const defs = (s.KB_MANIFEST || []).filter(d => !key || d.key === key);
  if (key && !defs.length) { console.error('没有这张表: ' + key + '（表名见 node kb.js stats）'); process.exit(1); }
  console.log(JSON.stringify(key ? defs[0] : defs, null, 1));
}

/* 搜索：条目(name/points/usage) · 术语(en/cn/d) · 标准(code/name/note) · 问答(q) */
function cmdSearch(kw) {
  if (!kw) { console.error('用法: node kb.js search <关键词>'); process.exit(1); }
  const s = loadAll();
  const K = kw.toLowerCase();
  const hits = [];
  const push = (table, key, where, text) => {
    const i = text.toLowerCase().indexOf(K);
    if (i < 0) return;
    hits.push({ table: table, key: key, field: where,
      snippet: text.slice(Math.max(0, i - 30), i + 70).replace(/\s+/g, ' ') });
  };
  (s.KB_ITEMS || []).forEach(it => {
    push('KB_ITEMS', it.name, 'name', it.name || '');
    push('KB_ITEMS', it.name, 'points', it.points || '');
    push('KB_ITEMS', it.name, 'usage', it.usage || '');
  });
  (s.KB_GLOSS || []).forEach(g => {
    push('KB_GLOSS', g.en, 'en', g.en || '');
    push('KB_GLOSS', g.en, 'cn', g.cn || '');
    push('KB_GLOSS', g.en, 'd', g.d || '');
  });
  (s.KB_STD || []).forEach(t => {
    push('KB_STD', t.code, 'name', (t.code || '') + ' ' + (t.name || ''));
    push('KB_STD', t.code, 'note', t.note || '');
  });
  Object.keys(s.KB_QA || {}).forEach(dom =>
    (s.KB_QA[dom] || []).forEach((q, i) => push('KB_QA', dom + '#' + (i + 1), 'q', q.q || '')));
  console.log(JSON.stringify({ keyword: kw, hits: hits.length, results: hits.slice(0, 40) }, null, 1));
  if (hits.length > 40) console.error('（共 ' + hits.length + ' 条命中，只显示前 40，换个更具体的关键词）');
}

/* 条目全量视图：六张以条目名为键的侧表全部联结进来 */
function cmdGet(name) {
  if (!name) { console.error('用法: node kb.js get <条目名>'); process.exit(1); }
  const s = loadAll();
  const items = s.KB_ITEMS || [];
  let it = items.find(x => x.name === name);
  if (!it) it = items.find(x => (x.name || '').toLowerCase() === name.toLowerCase());
  if (!it) {
    const near = items.map(x => x.name).filter(n => n && (n.includes(name) || name.includes(n))).slice(0, 8);
    console.error('没有这个条目: ' + name + (near.length ? '\n名字相近的：' + near.join('、') : ''));
    process.exit(1);
  }
  const pick = k => (s[k] && s[k][it.name] !== undefined) ? s[k][it.name] : undefined;
  console.log(JSON.stringify({
    item: it,
    deep: pick('KB_DEEP'),        /* 深度解析（分节长文） */
    nums: pick('KB_NUM'),         /* 关键经验数值 */
    rel:  pick('KB_REL'),         /* 关联条目 */
    memo: pick('KB_MEMO'),        /* 一句话记忆 */
    task: pick('KB_TASK'),        /* 动手练习 */
    imgs: pick('KB_IMG'),         /* 参考图（含来源） */
    imgUsage: pick('KB_USAGE')    /* 参考图使用建议 */
  }, null, 1));
}

function cmdQa(dom, n) {
  const s = loadAll();
  const qa = s.KB_QA || {};
  if (!dom) {
    console.log(JSON.stringify((s.KB_QA_META || []).map(m => ({ id: m.id, name: m.name, n: m.n })), null, 1));
    return;
  }
  if (!qa[dom]) { console.error('没有这个领域: ' + dom + '（领域清单: node kb.js qa）'); process.exit(1); }
  const list = n ? qa[dom].slice(0, parseInt(n, 10) || 5) : qa[dom];
  console.log(JSON.stringify({ domain: dom, total: qa[dom].length, questions: list }, null, 1));
}

const cmd = process.argv[2];
const arg1 = process.argv[3], arg2 = process.argv[4];
if (cmd === 'stats') cmdStats();
else if (cmd === 'schema') cmdSchema(arg1);
else if (cmd === 'search') cmdSearch((process.argv.slice(3).join(' ') || '').trim());
else if (cmd === 'get') cmdGet(arg1);
else if (cmd === 'qa') cmdQa(arg1, arg2);
else {
  console.log('kb.js —— 知识库查询 CLI\n\n用法:\n  node kb.js stats\n  node kb.js schema [表名]\n  node kb.js search <关键词>\n  node kb.js get <条目名>\n  node kb.js qa [领域id] [条数]');
  process.exit(cmd ? 1 : 0);
}
