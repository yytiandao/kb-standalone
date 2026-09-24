/* ══════════════════════════════════════════════════════════════════════
 * admin/admin.js —— 后台内核
 *
 * 界面完全由 data/manifest.js 驱动：左侧分组树来自 def.group/label，
 * 中间列表与右侧表单来自 def.editor + def.fields。这里只有「壳」：
 * 路由、脏标记、校验、改名联动、导出导入。
 *
 * 写入只有一条路径：编辑器的 readForm 返回「整表新值」→ store.setAll。
 * 导出只有一条路径：store.exportFiles → 生成与 data/*.js 同构的源码。
 * ══════════════════════════════════════════════════════════════════════ */
window.KBAdmin = window.KBAdmin || {};

(function (A) {
  "use strict";
  const C = window.KBCore;
  const esc = C.esc;
  const q = C.q;

  const GROUP_LABEL = { site: "站点配置", kb: "知识库", qa: "原理问答", field: "实战宝典", ref: "参考工具" };

  A.state = { table: null, id: null, kw: "", qaDomain: "", dirtyForm: false };
  A.toast = C.toast;
  A.ctx = () => A._ctx || (A._ctx = buildCtx());

  /* 契约里 optionsFrom 的动态选项、qa 的领域清单，都从这里取 */
  function buildCtx() {
    const optionLists = {};
    (window.KB_MANIFEST || []).forEach(def => {
      const cur = C.store.get(def.key);
      if (Array.isArray(cur)) {
        const key = def.idKey || "name";
        optionLists[def.key] = cur.map(x => x && x[key]).filter(v => v !== undefined && v !== null);
      } else if (cur && typeof cur === "object") {
        optionLists[def.key] = Object.keys(cur);
      }
    });
    return { optionLists: optionLists, qaDomains: (window.KB_QA_META || []) };
  }

  /* ══════════ 注册：把契约里声明的表登记进仓库 ══════════ */
  function boot() {
    const missing = [];
    (window.KB_MANIFEST || []).forEach(def => {
      if (C.store.register(def)) return;
      /* 原理问答的题目不在单一全局上，而是按领域分散的，单独登记 */
      if (def.key === A.TABLE_KEY) { C.store.register(Object.assign({}, def, { key: A.TABLE_KEY })); return; }
      missing.push(def.key);
    });
    /* KB_QA 由各 qa-<领域>.js 分散定义，若上面没注册成功则手工兜底 */
    if (!C.store.has(A.TABLE_KEY)) {
      const def = (window.KB_MANIFEST || []).find(d => d.editor === "qa") || { key: A.TABLE_KEY, file: "", label: "原理问答" };
      const v = window.KB_QA;
      if (v !== undefined) {
        C.store.register({ key: A.TABLE_KEY, def: def });
      }
    }
    window.__KB_QA_DEF = (window.KB_MANIFEST || []).find(d => d.editor === "qa");
    return missing;
  }

  /* KB_QA 特殊：register 读的是 window[def.key]，而领域清单在 KB_QA_META、
     题目在 window.KB_QA —— 让 def.key 就是 KB_QA 即可（它确实挂在 window 上）。 */

  function defOf(tableKey) { return C.store.defOf(tableKey) || window.__KB_QA_DEF; }
  function editorOf(def) { return A.editors[def.editor] || A.editors.json; }

  /* ══════════ 渲染：左侧树 ══════════ */
  function renderTree() {
    const groups = {};
    (window.KB_MANIFEST || []).forEach(def => {
      (groups[def.group] = groups[def.group] || []).push(def);
    });
    q("#afTree").innerHTML = Object.keys(groups).map(g =>
      '<div class="af-tg"><div class="af-tgh">' + esc(GROUP_LABEL[g] || g) + "</div>" +
      groups[g].map(def => {
        const cur = C.store.get(def.key);
        const n = Array.isArray(cur) ? cur.length : (cur && typeof cur === "object" ? Object.keys(cur).length : 0);
        return '<button class="af-tbtn' + (def.key === A.state.table ? " on" : "") + '" data-table="' + esc(def.key) + '">' +
          '<span>' + esc(def.label) + "</span><b>" + n + "</b></button>";
      }).join("") + "</div>").join("");
  }

  /* ══════════ 渲染：中间列表 ══════════ */
  function renderList() {
    const def = defOf(A.state.table);
    if (!def) { q("#afList").innerHTML = ""; q("#afListHead").innerHTML = ""; return; }
    const val = C.store.get(def.key);
    const ed = editorOf(def);
    let rows = ed.listRows(def, val, A.ctx());
    if (A.state.kw) rows = rows.filter(r => (r.title + " " + (r.meta || "")).toLowerCase().includes(A.state.kw.toLowerCase()));
    q("#afListHead").innerHTML =
      '<div class="af-lh-t">' + esc(def.label) + '<span class="af-lh-n">' + rows.length + " / " + ed.listRows(def, val, A.ctx()).length + "</span></div>" +
      '<input class="mini-input" id="afSearch" placeholder="搜索…" value="' + esc(A.state.kw) + '">' +
      '<button class="af-mini af-addbtn" id="afAdd">+ 新增</button>';
    q("#afList").innerHTML = rows.length
      ? rows.map(r => '<button class="af-li' + (String(r.id) === String(A.state.id) ? " on" : "") + '" data-id="' + esc(String(r.id)) + '">' +
          '<span class="af-li-t">' + esc(String(r.title || "").slice(0, 70)) + "</span>" +
          (r.meta ? '<span class="af-li-m">' + esc(String(r.meta).slice(0, 60)) + "</span>" : "") + "</button>").join("")
      : '<div class="af-empty">' + (A.state.kw ? "没匹配的条目" : "这张表还是空的，点「+ 新增」") + "</div>";
    q("#afNote").innerHTML = def.note ? "ⓘ " + esc(def.note) : "";
  }

  /* ══════════ 渲染：右侧表单 ══════════ */
  function renderForm() {
    const def = defOf(A.state.table);
    const box = q("#afForm");
    if (!def || A.state.id == null) {
      box.innerHTML = '<div class="af-empty">从中间选一条开始编辑，或点「+ 新增」</div>';
      q("#afFormHead").innerHTML = "";
      return;
    }
    const val = C.store.get(def.key);
    const ed = editorOf(def);
    const rows = ed.listRows(def, val, A.ctx());
    const row = rows.find(r => String(r.id) === String(A.state.id));
    q("#afFormHead").innerHTML =
      '<div class="af-fh-t">' + esc(row ? String(row.title).slice(0, 80) : A.state.id) + "</div>" +
      '<div class="af-fh-a">' +
      '<button class="af-btn" id="afSave">保存这一条</button>' +
      '<button class="af-btn af-ghost" id="afRevertItem">撤销本条改动</button>' +
      '<button class="af-btn af-danger" id="afDel">删除</button></div>';
    box.innerHTML = '<div class="af-form">' + ed.formHTML(def, val, A.state.id, A.ctx()) + "</div>";
  }

  function renderAll() { renderTree(); renderList(); renderForm(); renderBar(); renderQaDomainPicker(); }

  /* qa 编辑器需要知道「当前在哪个领域下新增」 */
  function renderQaDomainPicker() {
    const def = defOf(A.state.table);
    const host = q("#afQaDomains");
    if (!def || def.editor !== "qa") { host.innerHTML = ""; return; }
    const doms = (window.KB_QA_META || []);
    host.innerHTML = '<div class="af-qad">新增到领域：' + doms.map(d =>
      '<button class="af-mini' + (d.id === A.state.qaDomain ? " on" : "") + '" data-qadom="' + esc(d.id) + '">' + esc(d.name) + "</button>").join("") + "</div>";
  }

  /* ══════════ 顶栏：脏标记与操作 ══════════ */
  function renderBar() {
    const dirty = C.store.dirtyKeys();
    q("#afDirty").innerHTML = dirty.length
      ? '<b class="af-warn">' + dirty.length + " 张表有未导出的改动</b>"
      : "没有未导出的改动";
    const byFile = C.store.exportFiles(true);
    q("#afExport").disabled = !byFile.length;
  }

  /* ══════════ 校验 ══════════ */
  function validateTable(def) {
    const val = C.store.get(def.key);
    const ed = editorOf(def);
    const problems = [];
    if (def.editor === "records") {
      const known = C.store.knownIndex(["KB_CATS", "KB_DOMAINS", "KB_PROC", "KB_DIM", "KB_ITEMS", "KB_GLOSS"]);
      const seen = new Map();
      (val || []).forEach((rec, i) => {
        C.schema.validate(rec, def.fields, { known: known, optionLists: known }).forEach(e => problems.push("第 " + (i + 1) + " 条「" + C.schema.titleOf(rec, def.fields).slice(0, 24) + "」：" + e.msg));
        const ik = def.idKey || "name";
        const v = rec && rec[ik];
        if (v !== undefined && v !== "") {
          if (seen.has(v)) problems.push("第 " + (i + 1) + " 条：身份键 " + ik + "「" + v + "」与第 " + seen.get(v) + " 条重复");
          else seen.set(v, i + 1);
        }
      });
    } else if (def.editor === "map") {
      const fields = A.editors.mapFields(def);
      const known = C.store.knownIndex(["KB_ITEMS", "KB_GLOSS"]);
      Object.keys(val || {}).forEach(k => {
        const raw = val[k];
        const rec = (def.value || {}).kind === "text" ? { v: raw }
          : (def.value || {}).kind === "lines" ? { v: raw }
          : (def.value || {}).kind === "list-of-fields" ? { v: raw } : (raw || {});
        const defs = (def.value || {}).kind === "list-of-fields"
          ? [{ key: "v", label: def.label, type: "records", of: fields }] : fields;
        C.schema.validate(rec, defs, { known: known, optionLists: known }).forEach(e => problems.push("键「" + k + "」：" + e.msg));
        /* 值的引用存在性：ref 声明的（如 KB_REL 的关联条目） */
        const refTable = (def.value || {}).ref;
        if (refTable && Array.isArray(raw)) {
          const idx = C.store.knownIndex([refTable]);
          raw.forEach(x => { if (typeof x === "string" && idx[refTable] && idx[refTable].indexOf(x) < 0) problems.push("键「" + k + "」引用了不存在的条目「" + x + "」"); });
        }
      });
      if (def.refKey) {
        const idx = C.store.knownIndex([def.refKey]);
        Object.keys(val || {}).forEach(k => {
          if (idx[def.refKey] && idx[def.refKey].indexOf(k) < 0) problems.push("键「" + k + "」在 " + def.refKey + " 里不存在（可能是改名后遗留）");
        });
      }
    } else if (def.editor === "qa") {
      const doms = (window.KB_QA_META || []).map(d => d.id);
      Object.keys(val || {}).forEach(dom => {
        if (doms.indexOf(dom) < 0) problems.push("领域「" + dom + "」不在 KB_QA_META 里，该文件不会被加载");
        (val[dom] || []).forEach((it, i) => {
          const at = "「" + dom + "」第 " + (i + 1) + " 题";
          if (!it.q) problems.push(at + "：缺题干");
          if (!it.exp) problems.push(at + "：缺深度解析");
          if (!Array.isArray(it.opts) || it.opts.length < 2) problems.push(at + "：选项少于 2 项");
          else {
            if (typeof it.a !== "number" || it.a < 0 || it.a >= it.opts.length) problems.push(at + "：正确项下标越界");
            if (!Array.isArray(it.w) || it.w.length !== it.opts.length) problems.push(at + "：干扰项说明与选项长度不一致");
            else if (it.w[it.a] !== "") problems.push(at + "：正确项位置的说明应留空");
            else it.opts.forEach((o, j) => { if (j !== it.a && !it.w[j]) problems.push(at + "：选项 " + "ABCD"[j] + " 没写为什么不对"); });
          }
          const seenQ = A.__qaSeen = A.__qaSeen || new Map();
          if (it.q) {
            if (seenQ.has(it.q)) problems.push(at + "：题干与 " + seenQ.get(it.q) + " 重复");
            else seenQ.set(it.q, at);
          }
        });
      });
      A.__qaSeen = null;
    }
    return problems;
  }

  function runValidate() {
    /* 全量校验与 node content-check.js 同一套规则（core/validate.js），
       覆盖全部表契约、跨表引用与问答专项 —— 后台通过 = CLI 通过 */
    const R = C.validateAll();
    const all = R.errs.concat(R.warns.map(w => "提示：" + w));
    showProblems(all, "全站内容");
    return R;
  }

  function showProblems(list, scope) {
    const box = q("#afProblems"), body = q("#afProbBody");
    if (!list.length) { body.innerHTML = '<div class="af-ok">✓ ' + esc(scope) + " 校验通过</div>"; box.classList.add("on"); return; }
    body.innerHTML = '<div class="af-pb"><div class="af-pbh">发现 ' + list.length + " 个问题（前 60 条）</div><ul>" +
      list.slice(0, 60).map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    box.classList.add("on");
  }

  /* ══════════ 改名联动 ══════════ */
  function askRename(oldName, newName, afterSave) {
    const plan = C.store.renamePlan(oldName, newName);
    if (!plan.length) { afterSave(); return; }
    const total = plan.reduce((a, p) => a + p.hits, 0);
    const msg = "把「" + oldName + "」改名为「" + newName + "」？\n\n" +
      "以下 " + plan.length + " 张表里有 " + total + " 处按名字引用它：\n" +
      plan.map(p => "  · " + p.label + "：" + p.hits + " 处").join("\n") +
      "\n\n点「确定」= 连同这些引用一起改（推荐）\n点「取消」= 只改这一条，引用会断掉";
    if (window.confirm(msg)) {
      const n = C.store.renameApply(oldName, newName);
      afterSave();
      C.toast("已同步更新 " + n + " 处引用", "ok");
    } else {
      afterSave();
      C.toast("只改了这一条，其它表的引用需要你自行处理");
    }
  }

  /* ══════════ 保存 ══════════ */
  function saveCurrent() {
    const def = defOf(A.state.table);
    if (!def || A.state.id == null) return;
    const ed = editorOf(def);
    const val = C.store.get(def.key);
    const rowsBefore = ed.listRows(def, val, A.ctx());
    const rowBefore = rowsBefore.find(r => String(r.id) === String(A.state.id));
    const oldTitle = rowBefore ? String(rowBefore.title) : null;
    const next = ed.readForm(def, val, A.state.id, q("#afForm"), A.ctx());
    C.store.setAll(def.key, next);
    A._ctx = null;   // 选项列表可能变了（如新增分类）
    /* 身份键改了 → 提示同步引用 */
    const isNameKeyed = (def.editor === "records" && (def.idKey || "name") === "name") || (def.editor === "map" && def.refKey !== false);
    if (isNameKeyed && oldTitle != null) {
      const rowsAfter = ed.listRows(def, C.store.get(def.key), A.ctx());
      const rowAfter = rowsAfter.find(r => String(r.id) === String(A.state.id));
      if (rowAfter && String(rowAfter.title) !== oldTitle) {
        A.state.id = String(rowAfter.id);
        askRename(oldTitle, String(rowAfter.title), () => { persist(); renderAll(); });
        return;
      }
    }
    persist();
    renderAll();
    C.toast("已保存（记得导出才会写回文件）", "ok");
  }

  /* ══════════ 草稿持久化 ══════════
   * 草稿里同时存了「当时磁盘上的原始值」（base），所以能检测出一种危险情况：
   * 存草稿之后，磁盘上的数据文件被别的途径改过（手改 / 别的浏览器 / 重新导出）。
   * 这时如果照旧套用草稿，一导出就会把磁盘上的新改动静默回退。所以先比对、冲突则询问。 */
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const payload = { at: Date.now(), base: {}, tables: {} };
      C.store.keys().forEach(k => {
        if (C.store.dirty(k)) { payload.tables[k] = C.store.get(k); payload.base[k] = C.store.base(k); }
      });
      await C.storage.save(payload);
      renderBar();
    }, 260);
  }
  async function restore() {
    const d = await C.storage.load();
    if (!d || !d.tables) return { n: 0, conflicts: [] };
    /* 冲突检测：草稿记录的「当时磁盘值」与现在的磁盘值不一致 → 磁盘被改过 */
    const conflicts = [];
    Object.keys(d.tables).forEach(k => {
      if (!C.store.has(k)) return;
      if (d.base && d.base[k] !== undefined && JSON.stringify(d.base[k]) !== JSON.stringify(C.store.base(k))) conflicts.push(k);
    });
    if (conflicts.length) return { n: 0, conflicts: conflicts, draft: d };
    let n = 0;
    Object.keys(d.tables).forEach(k => { if (C.store.has(k)) { C.store.setAll(k, d.tables[k]); n++; } });
    A._ctx = null;
    return { n: n, conflicts: [] };
  }
  /* 冲突时给出明确选择，不擅自决定 */
  function showConflict(conflicts, draft) {
    const labelOf = k => { const d = C.store.defOf(k); return d ? d.label : k; };
    const box = q("#afConflict");
    box.innerHTML = '<div class="af-cf">' +
      '<div class="af-cf-h">⚠️ 发现内容冲突，需要你决定</div>' +
      '<div class="af-cf-b">本地草稿里有 <b>' + conflicts.length + '</b> 张表的未导出改动（' +
      conflicts.map(labelOf).join("、") + '），但磁盘上的数据文件在存草稿之后又被改过。<br>' +
      '如果直接套用草稿，导出时会把这些磁盘改动<b>覆盖掉</b>。</div>' +
      '<div class="af-cf-a">' +
      '<button class="af-btn af-danger" id="afCfUseDraft">用草稿（可能覆盖磁盘新改动）</button>' +
      '<button class="af-btn" id="afCfUseDisk">用磁盘数据，丢弃草稿</button>' +
      '</div></div>';
    box.style.display = "";
    q("#afCfUseDisk").onclick = async () => {
      await C.storage.clear();
      box.style.display = "none";
      C.toast("已丢弃草稿，使用磁盘数据", "ok");
      renderAll();
    };
    q("#afCfUseDraft").onclick = () => {
      let n = 0;
      Object.keys(draft.tables).forEach(k => { if (C.store.has(k)) { C.store.setAll(k, draft.tables[k]); n++; } });
      A._ctx = null;
      box.style.display = "none";
      C.toast("已套用草稿的 " + n + " 张表（注意：磁盘上的改动会在导出时被覆盖）", "err");
      renderAll();
    };
  }

  /* ══════════ 导出 / 导入 ══════════ */
  function collectFiles(onlyDirty) {
    const files = C.store.exportFiles(onlyDirty);
    C.store.splitTables(onlyDirty).forEach(k => { files.push.apply(files, C.store.splitFiles(k)); });
    return files;
  }

  function doExport() {
    const files = collectFiles(true);
    if (!files.length) { C.toast("没有改动需要导出"); return; }
    /* 导出门禁：与 CLI 同一套全量校验 —— 有错误就不导出、不 commit、不清草稿，
       避免改名取消联动之类产生的悬空引用被带进发布文件 */
    const R = C.validateAll();
    if (R.errs.length) {
      showProblems(R.errs, "导出被拦截（先修复以下错误）");
      C.toast("校验发现 " + R.errs.length + " 个错误，已阻止导出", "err");
      return;
    }
    files.forEach(f => C.download(f.file.split("/").pop(), f.text, "text/javascript"));
    C.store.commit();
    C.storage.clear();
    renderAll();
    C.toast("已导出 " + files.length + " 个文件（全量校验通过），覆盖回项目目录即可", "ok");
  }

  function doExportAll() {
    const files = collectFiles(false);
    files.forEach(f => C.download(f.file.split("/").pop(), f.text, "text/javascript"));
    C.toast("已导出全部 " + files.length + " 个数据文件", "ok");
  }

  function doImport(file) {
    const fr = new FileReader();
    fr.onload = () => {
      const txt = fr.result;
      /* 只认 window.<表名> = <JSON>; 这一种形态，拿正则剥出来再 JSON.parse —— 不用 eval */
      const m = /^\s*window\.([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);\s*$/m.exec(String(txt).replace(/^\/\*[\s\S]*?\*\/\s*/, ""));
      if (!m) { C.toast("这不是本项目的导出文件", "err"); return; }
      let v;
      try { v = JSON.parse(m[2]); } catch (e) { C.toast("文件里的 JSON 解析失败：" + e.message, "err"); return; }
      const key = m[1];
      if (!C.store.has(key)) { C.toast("不认识这张表：" + key, "err"); return; }
      C.store.setAll(key, v);
      A._ctx = null;
      persist(); renderAll();
      C.toast("已导入 " + key, "ok");
    };
    fr.readAsText(file);
  }

  /* ══════════ 事件绑定 ══════════ */
  function bind() {
    C.delegate(q("#afTree"), "click", "[data-table]", el => {
      A.state.table = el.dataset.table; A.state.id = null; A.state.kw = "";
      renderAll();
    });
    C.delegate(q("#afListHead"), "input", "#afSearch", el => { A.state.kw = el.value; renderList(); });
    C.delegate(q("#afListHead"), "click", "#afAdd", () => {
      const def = defOf(A.state.table);
      if (def && def.editor === "qa" && !A.state.qaDomain) A.state.qaDomain = ((window.KB_QA_META || [])[0] || {}).id || "";
      const r = editorOf(def).create(def, C.store.get(def.key), A.ctx());
      if (r.id == null) return;
      C.store.setAll(def.key, r.value);
      A.state.id = String(r.id); A.state.kw = "";
      persist(); renderAll();
      const first = q('#afForm [data-k], #afForm .qa-ot');
      if (first) first.focus();
    });
    C.delegate(q("#afList"), "click", "[data-id]", el => { A.state.id = el.dataset.id; renderForm(); renderList(); });
    C.delegate(q("#afQaDomains"), "click", "[data-qadom]", el => { A.state.qaDomain = el.dataset.qadom; renderQaDomainPicker(); });

    C.delegate(q("#afFormHead"), "click", "#afSave", saveCurrent);
    C.delegate(q("#afFormHead"), "click", "#afDel", () => {
      const def = defOf(A.state.table);
      if (!window.confirm("删除这一条？删完记得导出。")) return;
      C.store.setAll(def.key, editorOf(def).remove(def, C.store.get(def.key), A.state.id));
      A.state.id = null; A._ctx = null;
      persist(); renderAll();
    });
    C.delegate(q("#afFormHead"), "click", "#afRevertItem", () => {
      /* 把这张表整体退回磁盘态（粒度到表，够用且安全） */
      const def = defOf(A.state.table);
      C.store.revert(def.key);
      A._ctx = null; persist(); renderAll();
      C.toast("已撤销「" + def.label + "」的全部改动");
    });

    /* 表单内的行/选项操作与 JSON 整理 */
    C.delegate(q("#afForm"), "click", "[data-rowdel],[data-rowup],[data-rowdown],[data-addrow]", (el, e) => {
      const wrap = q("#afForm .af-form");
      if (wrap) A.fields.handleRowAction(el, wrap);
      e.preventDefault();
    });
    C.delegate(q("#afForm"), "click", "[data-jsonfmt]", el => {
      const ta = el.parentNode.querySelector("textarea");
      try { ta.value = JSON.stringify(JSON.parse(ta.value), null, 1); C.toast("已整理格式", "ok"); }
      catch (err) { C.toast("JSON 有语法错误：" + err.message, "err"); }
    });
    /* qa 的选项行操作 */
    C.delegate(q("#afForm"), "click", "[data-optdel],[data-optup],[data-optdown]", (el) => {
      const row = el.closest("[data-optrow]");
      const box = row && row.parentNode;
      if (!row || !box) return;
      if (el.hasAttribute("data-optdel")) {
        if (box.querySelectorAll("[data-optrow]").length <= 2) { C.toast("至少保留 2 个选项", "err"); return; }
        row.remove();
      } else if (el.hasAttribute("data-optup") && row.previousElementSibling) box.insertBefore(row, row.previousElementSibling);
      else if (el.hasAttribute("data-optdown") && row.nextElementSibling) box.insertBefore(row.nextElementSibling, row);
      renumberQaOptions(box);
    });
    C.delegate(q("#afForm"), "click", "[data-optadd]", () => {
      const box = q("#afForm .qa-opts");
      const n = box.querySelectorAll("[data-optrow]").length;
      if (n >= 8) { C.toast("选项最多 8 个", "err"); return; }
      box.insertAdjacentHTML("beforeend", qaOptRow(n, "", ""));
    });
    C.delegate(q("#afForm"), "change", 'input[name="qaCorrect"]', () => {
      const box = q("#afForm .qa-opts");
      const picked = Number(box.querySelector('input[name="qaCorrect"]:checked').value);
      Array.prototype.forEach.call(box.querySelectorAll("[data-optrow]"), (row, j) => {
        row.classList.toggle("is-ans", j === picked);
        const w = row.querySelector("[data-optw]");
        if (w) { w.disabled = j === picked; w.placeholder = j === picked ? "正确项：此处留空" : "为什么这个说法不对"; if (j === picked) w.value = ""; }
      });
    });
    /* 快捷键：Ctrl/Cmd+S 保存当前条 */
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (A.state.id != null) saveCurrent(); }
    });

    q("#afValidate").onclick = runValidate;
    q("#afExport").onclick = doExport;
    q("#afExportAll").onclick = doExportAll;
    q("#afDiscard").onclick = async () => {
      if (!C.store.dirtyKeys().length) { C.toast("没有改动"); return; }
      if (!window.confirm("放弃全部未导出的改动？")) return;
      C.store.revert(); await C.storage.clear(); A._ctx = null;
      renderAll(); C.toast("已放弃全部改动");
    };
    q("#afImportFile").onchange = e => { const f = e.target.files[0]; if (f) doImport(f); e.target.value = ""; };
    q("#afCloseProb").onclick = () => q("#afProblems").classList.remove("on");
  }

  function qaOptRow(j, o, w) {
    return '<div class="qa-opt" data-optrow="' + j + '">' +
      '<label class="qa-pick"><input type="radio" name="qaCorrect" value="' + j + '"><span>' + "ABCD"[j] + "</span></label>" +
      '<input class="af-in qa-ot" data-opt="' + j + '" type="text" value="' + esc(o) + '">' +
      '<textarea class="af-in af-ta qa-ot-w" data-optw="' + j + '" rows="2" placeholder="为什么这个说法不对">' + esc(w) + "</textarea>" +
      '<span class="af-rowbtns"><button type="button" class="af-mini" data-optup="' + j + '">↑</button>' +
      '<button type="button" class="af-mini" data-optdown="' + j + '">↓</button>' +
      '<button type="button" class="af-mini af-del" data-optdel="' + j + '">✕</button></span></div>';
  }
  function renumberQaOptions(box) {
    Array.prototype.forEach.call(box.querySelectorAll("[data-optrow]"), (row, j) => {
      row.dataset.optrow = j;
      const r = row.querySelector('input[name="qaCorrect"]');
      r.value = j; r.checked = row.classList.contains("is-ans");
      row.querySelector(".qa-pick span").textContent = "ABCD"[j];
      const t = row.querySelector("[data-opt]"); if (t) t.dataset.opt = j;
      const w = row.querySelector("[data-optw]"); if (w) w.dataset.optw = j;
      const up = row.querySelector("[data-optup]"); if (up) up.dataset.optup = j;
      const dn = row.querySelector("[data-optdown]"); if (dn) dn.dataset.optdown = j;
      const dl = row.querySelector("[data-optdel]"); if (dl) dl.dataset.optdel = j;
    });
  }

  /* ══════════ 启动 ══════════ */
  async function start() {
    const missing = boot();
    if (missing.length) {
      q("#afBoot").innerHTML = '<div class="af-pb"><div class="af-pbh">这些表没找到，可能 index.html 里没加载对应数据文件</div><ul>' +
        missing.map(m => "<li>" + esc(m) + "</li>").join("") + "</ul></div>";
    }
    const r = await restore();
    bind();
    const first = (window.KB_MANIFEST || [])[0];
    A.state.table = first ? first.key : null;
    renderAll();
    q("#afBackend").textContent = "草稿存于 " + C.storage.backend;
    if (r.conflicts && r.conflicts.length) showConflict(r.conflicts, r.draft);
    else if (r.n) C.toast("已恢复上次的 " + r.n + " 张表草稿");
  }

  A.start = start;
  A.validateTable = validateTable;
  A.renderAll = renderAll;
  window.addEventListener("DOMContentLoaded", start);
})(window.KBAdmin);
