/* ============================================================
 * core/store.js —— 数据仓库（框架层）
 *
 * 职责：把「页面上加载到的全局数据表」注册成可读写的仓库，并：
 *   · 记录改动（脏标记），后台据此提示"改了 N 处"
 *   · 支持改名联动：改条目名时同步更新所有以名称为键/值的关联表
 *     （这正是旧架构反复出问题的地方：改个名字，六张侧表静默断链）
 *   · 生成导出源码：window.KB_X = <JSON>;  —— 与现有数据文件同构，
 *     覆盖回 data/ 即可生效，仍然用 <script> 加载（双击 file:// 照常可用）
 *
 * 数据来源约定：每张表是 window[表名]。仓库只持有工作副本，
 * 不直接改 window 上的原始对象，这样"放弃改动"能一键还原。
 * ============================================================ */
window.KBCore = window.KBCore || {};

(function (C) {
  "use strict";

  const reg = new Map();      // 表名 → { def, base, cur }
  const listeners = [];

  function register(def) {
    const raw = window[def.key];
    if (raw === undefined) return false;
    reg.set(def.key, { def: def, base: C.clone(raw), cur: C.clone(raw) });
    return true;
  }
  function keys() { return Array.from(reg.keys()); }
  function has(k) { return reg.has(k); }
  function defOf(k) { return reg.has(k) ? reg.get(k).def : null; }
  /* 读取当前工作副本 */
  function get(k) { return reg.has(k) ? reg.get(k).cur : undefined; }
  /* 读取磁盘上的原始值（导出时做对比、改名时做基准都用它） */
  function base(k) { return reg.has(k) ? reg.get(k).base : undefined; }
  function dirty(k) { return reg.has(k) && JSON.stringify(reg.get(k).cur) !== JSON.stringify(reg.get(k).base); }
  function dirtyKeys() { return keys().filter(dirty); }

  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }
  function subscribe(fn) { listeners.push(fn); }

  /* 覆盖整表（编辑器里直接改结构时用） */
  function setAll(k, value) {
    if (!reg.has(k)) return;
    reg.get(k).cur = value;
    notify();
  }
  /* 放弃某张表 / 全部表的改动 */
  function revert(k) {
    if (k) { if (reg.has(k)) reg.get(k).cur = C.clone(reg.get(k).base); }
    else reg.forEach(e => { e.cur = C.clone(e.base); });
    notify();
  }
  /* 接受当前状态为"磁盘态"（导出成功后调用，清掉脏标记） */
  function commit(k) {
    const ks = k ? [k] : keys();
    ks.forEach(x => { if (reg.has(x)) reg.get(x).base = C.clone(reg.get(x).cur); });
    notify();
  }

  /* ── 序列化：与 data/*.js 完全同构 ── */
  function serialize(k) {
    return "window." + k + " = " + JSON.stringify(get(k), null, 1) + ";\n";
  }
  function fileOf(k) { const d = defOf(k); return d && d.file ? d.file : null; }

  /* 按文件分组导出：一个文件可能承载多张表（如 items-side.js 装五张）。
     标了 splitBy 的表（原理问答按领域拆文件）不走这里，由调用方单独处理。 */
  function exportFiles(onlyDirty) {
    const wanted = (onlyDirty ? dirtyKeys() : keys()).filter(k => {
      const d = defOf(k);
      return d && !d.splitBy && d.file && d.file !== "__split__";
    });
    const byFile = new Map();
    wanted.forEach(k => {
      const f = fileOf(k);
      if (!f) return;
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f).push(k);
    });
    const out = [];
    byFile.forEach((tables, file) => {
      const def = defOf(tables[0]) || {};
      const head = "/* " + file + "  —— " + (def.fileTitle || "") + "\n" +
        " * 由 admin.html 导出生成；包含的表: " + tables.join(", ") + "\n" +
        " * 手改也欢迎，格式就是 window.<表名> = <JSON>; */\n";
      out.push({ file: file, text: head + "\n" + tables.map(serialize).join("\n") });
    });
    return out;
  }

  /* 需要按领域拆文件的表（目前只有原理问答） */
  function splitTables(onlyDirty) {
    return (onlyDirty ? dirtyKeys() : keys()).filter(k => {
      const d = defOf(k);
      return d && (d.splitBy || d.file === "__split__");
    });
  }
  function splitFiles(k, fileOf_) {
    const v = get(k) || {};
    return Object.keys(v).map(dom => ({
      file: (fileOf_ ? fileOf_(dom) : "data/qa-" + dom + ".js"),
      text: "/* data/qa-" + dom + ".js —— 原理问答 · " + dom + "（" + (v[dom] || []).length + " 问）\n" +
        " * 由 admin.html 导出生成；手改也欢迎，格式就是 window.KB_QA[\"" + dom + "\"] = <JSON>; */\n" +
        "window.KB_QA = window.KB_QA || {};\n\n" +
        "window.KB_QA[" + JSON.stringify(dom) + "] = " + JSON.stringify(v[dom], null, 1) + ";\n"
    }));
  }

  /* ── 改名联动 ──
   * 条目名是六张侧表的键，也是 KB_REL 的值。改一个名字要把这些地方一起改，
   * 否则就是旧架构那种"静默断链"。这里扫描所有已注册表，找出键/值等于旧名的地方。
   * 返回每个受影响表的命中数，供后台提示与确认。 */
  function renamePlan(oldName, newName) {
    const plan = [];
    if (!oldName || !newName || oldName === newName) return plan;
    reg.forEach((e, k) => {
      const def = e.def || {};
      let hits = 0, note = "";
      const cur = e.cur;
      if (Array.isArray(cur)) {
        /* 数组型：元素是对象且有 name 字段 → 视为该表的身份键；元素是字符串 → 视为引用 */
        cur.forEach(x => {
          if (x && typeof x === "object" && x.name === oldName) { hits++; note = "记录名"; }
          else if (typeof x === "string" && x === oldName) { hits++; note = "引用值"; }
        });
      } else if (cur && typeof cur === "object") {
        /* 映射型：键是条目名 → "键"；值是字符串数组 → "引用值" */
        Object.keys(cur).forEach(key => {
          if (key === oldName) { hits++; note = note || "键"; }
          const v = cur[key];
          if (Array.isArray(v)) v.forEach(x => { if (typeof x === "string" && x === oldName) { hits++; note = note || "引用值"; } });
          else if (typeof v === "string" && v === oldName) { hits++; note = note || "引用值"; }
        });
      }
      if (hits) plan.push({ table: k, label: def.label || k, hits: hits, note: note });
    });
    return plan;
  }

  /* 真正执行改名（对工作副本操作）。把键与引用值都改掉。 */
  function renameApply(oldName, newName) {
    let changed = 0;
    reg.forEach(e => {
      const cur = e.cur;
      if (Array.isArray(cur)) {
        cur.forEach(x => {
          if (x && typeof x === "object" && x.name === oldName) { x.name = newName; changed++; }
        });
        for (let i = 0; i < cur.length; i++) if (typeof cur[i] === "string" && cur[i] === oldName) { cur[i] = newName; changed++; }
      } else if (cur && typeof cur === "object") {
        Object.keys(cur).forEach(key => {
          const v = cur[key];
          if (Array.isArray(v)) for (let i = 0; i < v.length; i++) if (typeof v[i] === "string" && v[i] === oldName) { v[i] = newName; changed++; }
          else if (typeof v === "string" && v === oldName) { cur[key] = newName; changed++; }
          if (key === oldName) { cur[newName] = v; delete cur[key]; changed++; }
        });
      }
    });
    notify();
    return changed;
  }

  /* 各表已有值的集合，供 schema 的 ref 校验用 */
  function knownIndex(refTables) {
    const known = {};
    (refTables || []).forEach(k => {
      const d = defOf(k);
      if (!d) return;
      const idKey = d.idKey || "name";
      const cur = get(k);
      if (Array.isArray(cur)) known[k] = cur.map(x => x && x[idKey]).filter(Boolean);
      else if (cur && typeof cur === "object") known[k] = Object.keys(cur);
    });
    return known;
  }

  C.store = {
    register: register, keys: keys, has: has, defOf: defOf,
    get: get, base: base, setAll: setAll, revert: revert, commit: commit,
    dirty: dirty, dirtyKeys: dirtyKeys, subscribe: subscribe,
    serialize: serialize, fileOf: fileOf, exportFiles: exportFiles,
    splitTables: splitTables, splitFiles: splitFiles,
    renamePlan: renamePlan, renameApply: renameApply, knownIndex: knownIndex
  };
})(window.KBCore);
