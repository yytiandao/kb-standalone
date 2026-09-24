/* ══════════════════════════════════════════════════════════════════════
 * admin/editors.js —— 表编辑器：records / map / json / qa
 *
 * 每个编辑器提供同一组接口，admin.js 只按 def.editor 取用，不关心差异：
 *   listRows(def, value, ctx)              → [{ id, title, meta }]  中间栏列表
 *   formHTML(def, value, id, ctx)          → 表单 HTML
 *   readForm(def, value, id, box, ctx)     → 把表单读回「整张表的新值」
 *   create(def, value, ctx)                → { value, id }  新增一条后的整表值
 *   remove(def, value, id, ctx)            → 整表值（已删除）
 *
 * 约定：所有写操作都返回「新的整表值」，由 admin.js 交给 store.setAll —— 单一写入路径。
 * ══════════════════════════════════════════════════════════════════════ */
window.KBAdmin = window.KBAdmin || {};

(function (A) {
  "use strict";
  const C = window.KBCore;
  const esc = C.esc;
  const F = A.fields;

  function withCtx(box, fields, ctx) { box.__fields = fields; box.__ctx = ctx; }

  /* ══════════ records：顶层数组，每条按 fields 契约渲染 ══════════ */
  const records = {
    listRows(def, value) {
      return (value || []).map((rec, i) => ({
        id: String(i),
        title: C.schema.titleOf(rec, def.fields),
        meta: rec[def.idKey || "name"] && C.schema.titleOf(rec, def.fields) !== rec[def.idKey || "name"] ? rec[def.idKey || "name"] : ""
      }));
    },
    formHTML(def, value, id) {
      const rec = (value || [])[+id] || {};
      return F.renderFields(def.fields, rec, window.KBAdmin.ctx());
    },
    readForm(def, value, id, box, ctx) {
      withCtx(box, def.fields, ctx);
      const next = C.clone(value || []);
      const idx = +id;
      const rec = F.readFields(def.fields, box.querySelector(".af-form") || box);
      /* 清掉空字符串以外的 undefined，避免把「该字段不存在」写成 null */
      Object.keys(rec).forEach(k => { if (rec[k] === undefined) delete rec[k]; });
      if (idx >= 0 && idx < next.length) next[idx] = rec; else next.push(rec);
      return next;
    },
    create(def, value, ctx) {
      const next = C.clone(value || []);
      const rec = C.schema.emptyOf(def.fields);
      next.push(rec);
      return { value: next, id: String(next.length - 1) };
    },
    remove(def, value, id) {
      const next = C.clone(value || []);
      next.splice(+id, 1);
      return next;
    },
    /* 改名联动用：数组型表的身份键 */
    identityKey(def) { return def.idKey || "name"; }
  };

  /* ══════════ map：顶层对象，键是身份（多为条目名），值按 value 描述 ══════════ */
  const VAL_KIND = {
    text:          { fields: [{ key: "v", label: "内容", type: "textarea", required: true }] },
    lines:         { fields: [{ key: "v", label: "每行一条", type: "list", required: true, minItems: 1 }] },
    fields:        { fields: null },        // 由 def.value.fields 提供
    "list-of-fields": { fields: null },     // 由 def.value.fields 提供，值是数组
    sections:      { fields: null }         // 由 def.value.sections 生成
  };

  function mapFields(def) {
    const v = def.value || { kind: "text" };
    if (v.kind === "text") return [{ key: "v", label: "内容", type: "textarea", required: true }];
    if (v.kind === "lines") return [{ key: "v", label: "每行一条", type: "list", required: true, minItems: 1 }];
    if (v.kind === "sections") return (v.sections || []).map(s => ({ key: s.k, label: s.label, type: "list", required: true, minItems: 1 }));
    return v.fields || [];
  }
  function isListKind(def) { return (def.value || {}).kind === "list-of-fields"; }

  const map = {
    listRows(def, value) {
      return Object.keys(value || {}).map(k => ({ id: k, title: k, meta: mapMeta(value[k]) }));
    },
    formHTML(def, value, id, ctx) {
      const fields = mapFields(def);
      const raw = (value || {})[id];
      const rec = isListKind(def) ? { v: raw || [] } : (typeof raw === "string" ? { v: raw } : (raw || {}));
      const keyBox =
        '<div class="af-f af-key"><div class="af-l">键（条目名）' +
        '<span class="af-h">改名会在保存时询问是否同步更新其它表</span></div>' +
        '<input class="af-in" data-mapkey="1" type="text" value="' + esc(id) + '"' + (def.refKey === false ? "" : " readonly") + "></div>";
      return keyBox + F.renderFields(isListKind(def) ? [{ key: "v", label: def.label + "（列表）", type: "records", of: fields }] : fields,
        isListKind(def) ? { v: raw || [] } : rec, ctx);
    },
    readForm(def, value, id, box, ctx) {
      const fields = mapFields(def);
      withCtx(box, fields, ctx);
      const next = C.clone(value || {});
      const keyEl = box.querySelector("[data-mapkey]");
      const newKey = keyEl ? keyEl.value.trim() : id;
      let rec;
      if (isListKind(def)) {
        const wrap = box.querySelector('.af-f[data-field="v"]');
        rec = F.read(fields.length ? { key: "v", type: "records", of: fields } : { key: "v", type: "list" }, wrap);
      } else {
        rec = F.readFields(fields, box.querySelector(".af-form") || box);
      }
      const val = (def.value || {}).kind;
      let out;
      if (val === "text") out = rec.v;
      else if (val === "lines") out = rec.v;
      else out = rec;
      if (newKey !== id) delete next[id];
      next[newKey] = out;
      return next;
    },
    create(def, value, ctx) {
      const next = C.clone(value || {});
      let base = "新条目", k = base, n = 1;
      while (next[k] !== undefined) { k = base + " " + (++n); }
      const val = (def.value || {}).kind;
      next[k] = val === "text" ? "" : (val === "lines" || val === "sections" ? [] : (isListKind(def) ? [] : C.schema.emptyOf(mapFields(def))));
      return { value: next, id: k };
    },
    remove(def, value, id) { const next = C.clone(value || {}); delete next[id]; return next; },
    identityKey() { return null; }
  };
  let meta_ = null;
  function mapMeta(raw) {
    if (typeof raw === "string") return String(raw).slice(0, 60);
    if (Array.isArray(raw)) {
      if (raw.length && typeof raw[0] === "string") return raw.length + " 条 · " + String(raw[0]).slice(0, 44);
      if (raw.length && typeof raw[0] === "object") return raw.length + " 项";
      return raw.length + " 条";
    }
    if (raw && typeof raw === "object") return Object.keys(raw).map(k => k).slice(0, 4).join(" / ");
    return "";
  }

  /* ══════════ json：整表一个 JSON 文本框（结构过深时的兜底，仍可编辑） ══════════ */
  const json = {
    listRows(def, value) {
      const n = Array.isArray(value) ? value.length + " 项" : (value && typeof value === "object" ? Object.keys(value).length + " 键" : "—");
      return [{ id: "__table__", title: def.label + "（整表）", meta: n }];
    },
    formHTML(def, value) {
      return '<div class="af-note">本表结构较深，用 JSON 编辑。改完点「校验」；' +
        '格式不对会明确报错，不会静默写坏数据。</div>' +
        '<div class="af-f"><textarea class="af-in af-json" data-k="__json__" data-json="1" rows="' +
        Math.min(40, Math.max(14, Math.ceil(JSON.stringify(value).length / 90))) + '">' +
        esc(JSON.stringify(value, null, 1)) + "</textarea>" +
        '<button type="button" class="af-mini" data-jsonfmt="1">整理格式</button></div>';
    },
    readForm(def, value, id, box) {
      const ta = box.querySelector('[data-k="__json__"]');
      try { return JSON.parse(ta.value); }
      catch (e) { A.toast("JSON 格式错误：" + e.message, "err"); return value; }
    },
    create(def, value) { A.toast("JSON 类型的表在文本框里直接加就行"); return { value: value, id: "__table__" }; },
    remove(def, value) { A.toast("JSON 类型的表请在文本框里删"); return value; },
    identityKey() { return null; }
  };

  /* ══════════ qa：原理问答（领域 → 题目） ══════════
   * 值形如 { material: [ {q,t,lv,opts,a,exp,w} … ], … }，
   * 题目分布在 data/qa-<领域>.js，因此这里单独管一件事：保存时按领域拆分导出。 */
  const QA_FIELDS = [
    { key: "q",   label: "题干", type: "textarea", required: true, title: true },
    { key: "lv",  label: "难度", type: "enum", required: true, options: ["基础", "进阶", "易错"] },
    { key: "t",   label: "题型", type: "enum", emptyLabel: "选择题（默认）",
      options: [{ v: "tf", label: "判断题" }, { v: "calc", label: "计算题" }, { v: "scene", label: "情景题" }] },
    { key: "exp", label: "深度解析", type: "textarea", required: true, hint: "讲原理与工程含义，不要只复述答案" },
    { key: "w",   label: "干扰项说明", type: "json", hint: "与选项等长，正确项位置留空字符串" }
  ];

  const qa = {
    /* 领域清单来自 KB_QA_META，题目来自 KB_QA */
    domains(ctx) { return (ctx && ctx.qaDomains) || []; },
    listRows(def, value, ctx) {
      const out = [];
      Object.keys(value || {}).forEach(dom => {
        (value[dom] || []).forEach((q, i) => out.push({ id: dom + "|" + i, title: q.q, meta: dom + " · " + (q.lv || "") + " · " + (q.opts ? q.opts.length + " 选项" : "") }));
      });
      return out;
    },
    formHTML(def, value, id, ctx) {
      const [dom, idx] = String(id).split("|");
      const q = ((value || {})[dom] || [])[+idx] || {};
      const opts = q.opts || [];
      const w = q.w || [];
      const correct = typeof q.a === "number" ? q.a : 0;
      /* 选项 + 正确项 + 每项的「为什么不对」三列并排，比 JSON 里改 a/w 直观得多 */
      const optRows = opts.map((o, j) =>
        '<div class="qa-opt' + (j === correct ? " is-ans" : "") + '" data-optrow="' + j + '">' +
        '<label class="qa-pick"><input type="radio" name="qaCorrect" value="' + j + '"' + (j === correct ? " checked" : "") + '><span>' + "ABCD"[j] + "</span></label>" +
        '<input class="af-in qa-ot" data-opt="' + j + '" type="text" value="' + esc(o) + '">' +
        '<textarea class="af-in af-ta qa-ot-w" data-optw="' + j + '" rows="2" placeholder="' +
        (j === correct ? "正确项：此处留空" : "为什么这个说法不对") + '"' + (j === correct ? " disabled" : "") + ">" + esc(w[j] || "") + "</textarea>" +
        '<span class="af-rowbtns"><button type="button" class="af-mini" data-optup="' + j + '">↑</button>' +
        '<button type="button" class="af-mini" data-optdown="' + j + '">↓</button>' +
        '<button type="button" class="af-mini af-del" data-optdel="' + j + '">✕</button></span></div>').join("");
      return '<div class="af-note">所属领域：<b>' + esc(dom) + "</b>（题目 id 由领域+题干自动派生，无需手填）</div>" +
        F.renderFields(QA_FIELDS.filter(f => f.key !== "w"), q, ctx) +
        '<div class="af-f"><div class="af-l">选项与正确项<span class="af-h">勾选左边圆点即正确项；正确项的说明留空</span></div>' +
        '<div class="qa-opts">' + optRows + "</div>" +
        '<button type="button" class="af-add" data-optadd="1">+ 加一个选项</button></div>';
    },
    readForm(def, value, id, box, ctx) {
      withCtx(box, QA_FIELDS, ctx);
      const [dom, idx] = String(id).split("|");
      const next = C.clone(value || {});
      const arr = next[dom] || (next[dom] = []);
      const base = arr[+idx] || {};
      const rec = F.readFields(QA_FIELDS.filter(f => f.key !== "w"), box.querySelector(".af-form") || box);
      const opts = [], w = [];
      Array.prototype.forEach.call(box.querySelectorAll("[data-opt]"), el => { opts.push(el.value); });
      Array.prototype.forEach.call(box.querySelectorAll("[data-optw]"), el => { w.push(el.value); });
      const picked = box.querySelector('input[name="qaCorrect"]:checked');
      const a = picked ? Number(picked.value) : 0;
      /* 正确项位置强制留空 —— 与 qa-check.js 的规则一致，后台先把住 */
      w[a] = "";
      const out = { q: rec.q, opts: opts, a: a, exp: rec.exp, w: w };
      if (rec.lv) out.lv = rec.lv;
      if (rec.t) out.t = rec.t;
      /* 保持键序稳定，导出 diff 才干净 */
      const ordered = { q: out.q };
      if (out.t) ordered.t = out.t;
      ordered.lv = out.lv; ordered.opts = out.opts; ordered.a = out.a; ordered.exp = out.exp; ordered.w = out.w;
      if (+idx >= 0 && +idx < arr.length) arr[+idx] = ordered; else arr.push(ordered);
      return next;
    },
    create(def, value, ctx) {
      const doms = (ctx && ctx.qaDomains) || [];
      const dom = (A.state.qaDomain && (value || {})[A.state.qaDomain]) ? A.state.qaDomain : (doms[0] && doms[0].id);
      if (!dom) { A.toast("先在左侧选一个问答领域", "err"); return { value: value, id: null }; }
      const next = C.clone(value || {});
      const arr = next[dom] || (next[dom] = []);
      arr.push({ q: "", lv: "基础", opts: ["", "", "", ""], a: 0, exp: "", w: ["", "", "", ""] });
      return { value: next, id: dom + "|" + (arr.length - 1) };
    },
    remove(def, value, id) {
      const [dom, idx] = String(id).split("|");
      const next = C.clone(value || {});
      if (next[dom]) next[dom].splice(+idx, 1);
      return next;
    },
    identityKey() { return null; },
    /* 导出时按领域拆文件（与 data/qa-<id>.js 一一对应） */
    exportSplit(value) { return Object.keys(value || {}).map(dom => ({ file: "data/qa-" + dom + ".js", dom: dom, arr: value[dom] })); }
  };

  A.editors = { records: records, map: map, json: json, qa: qa, QA_FIELDS: QA_FIELDS, mapFields: mapFields };
  A.TABLE_KEY = "KB_QA";   // 原理问答整表以 KB_QA 名义注册（键是领域 id）
})(window.KBAdmin);
