/* ══════════════════════════════════════════════════════════════════════
 * admin/fields.js —— 字段控件（由 core/schema.js 的契约生成表单）
 *
 * 结构约定（读取时靠它做严格的作用域隔离）：
 *   <div class="af-f" data-field="key">        ← 一个字段
 *     <控件 data-k="key"> … </控件>            ← 标量控件的唯一落点
 *     <div class="af-body">…嵌套字段…</div>     ← record 类型
 *     <div class="af-rows"><div class="af-row">…嵌套字段…</div>…</div>  ← records 类型
 * 读取时用 :scope > 只取「直接子级」，避免把嵌套字段的值读串。
 * ══════════════════════════════════════════════════════════════════════ */
window.KBAdmin = window.KBAdmin || {};

(function (A) {
  "use strict";
  const C = window.KBCore;
  const esc = C.esc;

  /* 长文本按内容给个合适的初始高度，免得每次都要手动拉 */
  function rowsFor(v, min, per) {
    const n = String(v == null ? "" : v).length;
    return Math.max(min, Math.min(22, min + Math.floor(n / (per || 46))));
  }

  function optionsOf(f, ctx) {
    /* 选项解析统一走 schema 层，保证表单与校验用的是同一套（含 optionsFrom 动态取） */
    const vals = C.schema.optValues(f, ctx);
    const byLabel = {};
    const src = (f.optionsFrom && ctx && ctx.optionLists && ctx.optionLists[f.optionsFrom]) ? ctx.optionLists[f.optionsFrom] : (f.options || []);
    src.forEach(o => { if (typeof o !== "string") byLabel[o.v] = o.label; });
    const norm = vals.map(v => ({ v: v, label: byLabel[v] !== undefined ? byLabel[v] : v }));
    if (!f.required) norm.unshift({ v: "", label: f.emptyLabel || "（空）" });
    return norm;
  }

  /* ── 渲染 ── */
  function render(f, value, ctx) {
    const label = '<div class="af-l">' + esc(f.label || f.key) +
      (f.required ? ' <b class="af-req">*</b>' : "") +
      (f.hint ? '<span class="af-h">' + esc(f.hint) + "</span>" : "") + "</div>";
    let body = "";
    switch (f.type) {
      case "textarea":
        body = '<textarea class="af-in af-ta" data-k="' + f.key + '" rows="' + rowsFor(value, 3) + '">' + esc(value) + "</textarea>";
        break;
      case "number": {
        const bad = value !== "" && value != null && (typeof value !== "number" || !isFinite(value));
        body = '<input class="af-in af-num' + (bad ? " af-bad" : "") + '" data-k="' + f.key + '" type="text" value="' + esc(value === undefined || value === null ? "" : value) + '">';
        break;
      }
      case "bool":
        body = '<label class="af-sw"><input type="checkbox" data-k="' + f.key + '"' + (value ? " checked" : "") + '><span>是</span></label>';
        break;
      case "enum": {
        const cur = value === undefined || value === null ? "" : String(value);
        body = '<select class="af-in af-sel" data-k="' + f.key + '" data-numeric="' +
          (optionsOf(f, ctx).every(o => o.v === "" || typeof o.v === "number") ? "1" : "0") + '">' +
          optionsOf(f, ctx).map(o => '<option value="' + esc(String(o.v)) + '"' +
            (String(o.v) === cur ? " selected" : "") + ">" + esc(o.label) + "</option>").join("") + "</select>";
        break;
      }
      case "tags": {
        const v = Array.isArray(value) ? value.join("，") : "";
        body = '<input class="af-in" data-k="' + f.key + '" type="text" value="' + esc(v) + '" placeholder="逗号或顿号分隔">';
        break;
      }
      case "list":
        /* 一项一个输入框：内容里带换行也不会被拆散，且能单独增删/上下移 */
        body = '<div class="af-rows" data-rows="list">' + (Array.isArray(value) ? value : [])
          .map(x => rowOfList(f, x)).join("") + "</div>" +
          '<button type="button" class="af-add" data-addrow="list">+ 加一条</button>';
        break;
      case "records":
        body = '<div class="af-rows" data-rows="rec">' + (Array.isArray(value) ? value : [])
          .map(x => rowOfRec(f, x, ctx)).join("") + "</div>" +
          '<button type="button" class="af-add" data-addrow="rec">+ 加一项</button>';
        break;
      case "record":
        body = '<div class="af-body">' + renderFields(f.of || [], value || {}, ctx) + "</div>";
        break;
      case "json":
        body = '<textarea class="af-in af-json" data-k="' + f.key + '" data-json="1" rows="' + rowsFor(JSON.stringify(value), 4, 70) + '">' +
          esc(value === undefined ? "null" : JSON.stringify(value, null, 1)) + "</textarea>" +
          '<button type="button" class="af-mini" data-jsonfmt="1">整理格式</button>';
        break;
      default:
        body = '<input class="af-in" data-k="' + f.key + '" type="text" value="' + esc(value) + '">';
    }
    return '<div class="af-f" data-field="' + esc(f.key) + '">' + label + body + "</div>";
  }

  function rowOfList(f, x) {
    const long = String(x || "").length > 60;
    return '<div class="af-row af-row-single">' +
      (long
        ? '<textarea class="af-in af-ta" data-k="0" rows="' + rowsFor(x, 2) + '">' + esc(x) + "</textarea>"
        : '<input class="af-in" data-k="0" type="text" value="' + esc(x) + '">') +
      '<span class="af-rowbtns"><button type="button" class="af-mini" data-rowup="1" title="上移">↑</button>' +
      '<button type="button" class="af-mini" data-rowdown="1" title="下移">↓</button>' +
      '<button type="button" class="af-mini af-del" data-rowdel="1" title="删除">✕</button></span></div>';
  }

  function rowOfRec(f, x, ctx) {
    const title = C.schema.titleOf(x || {}, f.of || []);
    return '<div class="af-row af-row-rec">' +
      '<div class="af-rowhd"><span class="af-rowt">' + esc(title).slice(0, 46) + "</span>" +
      '<span class="af-rowbtns"><button type="button" class="af-mini" data-rowup="1">↑</button>' +
      '<button type="button" class="af-mini" data-rowdown="1">↓</button>' +
      '<button type="button" class="af-mini af-del" data-rowdel="1">✕</button></span></div>' +
      '<div class="af-body">' + renderFields(f.of || [], x || {}, ctx) + "</div></div>";
  }

  function renderFields(fields, rec, ctx) {
    return (fields || []).map(f => render(f, rec ? rec[f.key] : undefined, ctx)).join("");
  }

  /* ── 读取 ── */
  function readFields(fields, container) {
    const out = {};
    (fields || []).forEach(f => {
      const w = container.querySelector(':scope > .af-f[data-field="' + cssEsc(f.key) + '"]');
      out[f.key] = w ? read(f, w) : undefined;
    });
    return out;
  }
  const cssEsc = s => String(s).replace(/["\\]/g, "\\$&");

  function read(f, w) {
    const ctl = w.querySelector(':scope > [data-k]') || w.querySelector("[data-k]");
    switch (f.type) {
      case "number": {
        const raw = ctl.value.trim();
        if (raw === "") return "";
        const n = Number(raw);
        return isFinite(n) ? n : ctl.value;   // 非数字原样返回，交给校验报错
      }
      case "bool": return !!ctl.checked;
      case "enum": {
        const v = ctl.value;
        return ctl.dataset.numeric === "1" && v !== "" ? Number(v) : v;
      }
      case "tags":
        return ctl.value.split(/[，,、]/).map(s => s.trim()).filter(Boolean);
      case "list": {
        const rows = w.querySelectorAll(':scope > .af-rows > .af-row');
        return Array.prototype.map.call(rows, r => {
          const el = r.querySelector("[data-k]");
          return el ? el.value : "";
        }).filter(s => s !== "");
      }
      case "records": {
        const rows = w.querySelectorAll(':scope > .af-rows > .af-row');
        return Array.prototype.map.call(rows, r => readFields(f.of || [], r));
      }
      case "record":
        return readFields(f.of || [], w.querySelector(':scope > .af-body') || w);
      case "json": {
        try { return JSON.parse(ctl.value); }
        catch (e) { return { __jsonError: e.message, __raw: ctl.value }; }
      }
      default: return ctl.value;
    }
  }

  /* ── 行操作：新增/删除/上移/下移（DOM 层，改完由调用方重新读取） ── */
  function handleRowAction(btn, wrap) {
    const row = btn.closest(".af-row");
    const rows = row && row.parentNode;
    if (!row || !rows) return false;
    if (btn.hasAttribute("data-rowdel")) { row.remove(); return true; }
    if (btn.hasAttribute("data-rowup") && row.previousElementSibling) { rows.insertBefore(row, row.previousElementSibling); return true; }
    if (btn.hasAttribute("data-rowdown") && row.nextElementSibling) { rows.insertBefore(row.nextElementSibling, row); return true; }
    if (btn.hasAttribute("data-addrow")) {
      const kind = btn.dataset.addrow;
      const f = fieldDefOf(btn, wrap);
      if (!f) return false;
      const html = kind === "list" ? rowOfList(f, "") : rowOfRec(f, C.schema.emptyOf(f.of || []), wrap.__ctx);
      const holder = wrap.querySelector(':scope > .af-rows') || wrap.querySelector(".af-rows");
      holder.insertAdjacentHTML("beforeend", html);
      const added = holder.lastElementChild;
      const first = added && added.querySelector("input,textarea,select");
      if (first) first.focus();
      return true;
    }
    return false;
  }

  /* 从按钮回溯到它所属字段的规约（data-field + manifest 的字段表在 ctx 里） */
  function fieldDefOf(btn, wrap) {
    const fw = btn.closest(".af-f");
    if (!fw || !wrap || !wrap.__fields) return null;
    const key = fw.dataset.field;
    return wrap.__fields.find(x => x.key === key) || null;
  }

  A.fields = { render: render, renderFields: renderFields, readFields: readFields, read: read, handleRowAction: handleRowAction, optionsOf: optionsOf };
})(window.KBAdmin);
