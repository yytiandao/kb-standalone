/* ============================================================
 * core/schema.js —— 字段契约与校验（框架层）
 *
 * 后台的表单完全由这里的字段描述生成，因此：
 *   · 加一张内容表 → 在 data/manifest.js 写一条 fields 声明，后台自动出现编辑界面
 *   · 校验规则与表单控件同源，不会出现「界面允许填、校验却报错」的错位
 *
 * 字段描述（field）：
 *   { key:"name", label:"名称", type:"text", required:true, hint:"给维护者看的说明",
 *     options:[...], of:{...}, max:80, unique:true, ref:"KB_ITEMS" }
 *
 * type 取值：
 *   text      单行文本
 *   textarea  多行文本（长解析、说明）
 *   number    数字
 *   bool      开关
 *   enum      单选（options 为字符串数组，或 [{v,label}]）
 *   tags      字符串数组（一行一个，或逗号分隔），适合 abilities / subs
 *   list      字符串数组，长文本用（深度解析的 p/k/e/f/s 小节）
 *   record    单层子对象（of 描述其字段）
 *   records   子对象数组（of 描述其字段）
 *   json      任意结构，用 JSON 文本框编辑（深层嵌套时兜底）
 * ============================================================ */
window.KBCore = window.KBCore || {};

(function (C) {
  "use strict";

  const LONG_TYPES = { textarea: 1, list: 1, json: 1 };

  /* 字段的空值 —— 新建记录时按类型给合理的初始值 */
  function emptyOf(fields) {
    const o = {};
    (fields || []).forEach(f => {
      switch (f.type) {
        case "number": o[f.key] = f.def != null ? f.def : 0; break;
        case "bool": o[f.key] = f.def != null ? f.def : false; break;
        case "enum": o[f.key] = f.def != null ? f.def : (optValues(f)[0] || ""); break;
        case "tags": case "list": o[f.key] = f.def ? C.clone(f.def) : []; break;
        case "records": o[f.key] = f.def ? C.clone(f.def) : []; break;
        case "record": o[f.key] = f.def ? C.clone(f.def) : emptyOf(f.of || []); break;
        case "json": o[f.key] = f.def != null ? C.clone(f.def) : null; break;
        default: o[f.key] = f.def != null ? f.def : "";
      }
    });
    return o;
  }

  /* 枚举选项：optionsFrom 指向另一张表时从 optionLists 动态取。
     放在 schema 层，保证「表单允许填的」与「校验认可的」永远是同一套选项。 */
  function optValues(f, ctx) {
    let opts = f.options || [];
    if (f.optionsFrom && ctx && ctx.optionLists && ctx.optionLists[f.optionsFrom]) {
      opts = ctx.optionLists[f.optionsFrom];
    }
    return opts.map(o => (typeof o === "string" ? o : o.v));
  }
  function optLabel(f, v, ctx) {
    const opts = (f.optionsFrom && ctx && ctx.optionLists && ctx.optionLists[f.optionsFrom]) ? ctx.optionLists[f.optionsFrom] : (f.options || []);
    for (const o of opts) if (typeof o !== "string" && o.v === v) return o.label;
    return v;
  }

  /* 校验一条记录。返回 [{key, msg}]，空数组表示通过。
     opts.known = { 表名: 该表已有值的集合 }，用于 ref 类型的存在性检查 */
  function validate(rec, fields, opts) {
    const out = [];
    const known = (opts && opts.known) || {};
    (fields || []).forEach(f => {
      const v = rec ? rec[f.key] : undefined;
      const miss = (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length));
      if (f.required && miss) { out.push({ key: f.key, msg: (f.label || f.key) + " 必填" }); return; }
      if (miss) return;
      switch (f.type) {
        case "text": case "textarea":
          if (typeof v !== "string") out.push({ key: f.key, msg: (f.label || f.key) + " 应为文本" });
          else if (f.max && v.length > f.max) out.push({ key: f.key, msg: (f.label || f.key) + " 超过 " + f.max + " 字（当前 " + v.length + "）" });
          break;
        case "number":
          if (typeof v !== "number" || !isFinite(v)) out.push({ key: f.key, msg: (f.label || f.key) + " 应为数字" });
          break;
        case "bool":
          if (typeof v !== "boolean") out.push({ key: f.key, msg: (f.label || f.key) + " 应为真/假" });
          break;
        case "enum":
          if (optValues(f, opts).indexOf(v) < 0) out.push({ key: f.key, msg: (f.label || f.key) + " 取值不在允许范围：" + v });
          break;
        case "tags": case "list":
          if (!Array.isArray(v)) out.push({ key: f.key, msg: (f.label || f.key) + " 应为字符串数组" });
          else {
            const bad = v.filter(x => typeof x !== "string");
            if (bad.length) out.push({ key: f.key, msg: (f.label || f.key) + " 含非文本项 " + bad.length + " 处" });
            if (f.minItems && v.length < f.minItems) out.push({ key: f.key, msg: (f.label || f.key) + " 至少 " + f.minItems + " 项" });
          }
          break;
        case "records":
          if (!Array.isArray(v)) out.push({ key: f.key, msg: (f.label || f.key) + " 应为数组" });
          else v.forEach((sub, i) => {
            validate(sub, f.of || [], opts).forEach(e => out.push({ key: f.key + "." + i + "." + e.key, msg: "第 " + (i + 1) + " 项：" + e.msg }));
          });
          break;
        case "record":
          if (typeof v !== "object") out.push({ key: f.key, msg: (f.label || f.key) + " 应为对象" });
          else validate(v, f.of || [], opts).forEach(e => out.push({ key: f.key + "." + e.key, msg: e.msg }));
          break;
        case "json":
          break;   // 结构自由，只保证能序列化
      }
      /* 引用存在性：填的值必须在目标表里真实存在（改名断链就靠它拦住） */
      if (f.ref && known[f.ref] && typeof v === "string" && known[f.ref].indexOf(v) < 0) {
        out.push({ key: f.key, msg: (f.label || f.key) + " 引用的「" + v + "」在 " + f.ref + " 中不存在" });
      }
      if (f.refList && known[f.refList] && Array.isArray(v)) {
        v.forEach(x => { if (typeof x === "string" && known[f.refList].indexOf(x) < 0) out.push({ key: f.key, msg: (f.label || f.key) + " 关联的「" + x + "」不存在" }); });
      }
    });
    return out;
  }

  /* 一条记录的显示标题：优先用 titleKey，否则取第一个非空文本字段 */
  function titleOf(rec, fields) {
    const tf = (fields || []).find(f => f.title) || (fields || []).find(f => f.type === "text");
    if (tf && rec && rec[tf.key]) return String(rec[tf.key]);
    return (fields || []).filter(f => f.type === "text" || f.type === "number")
      .map(f => rec && rec[f.key]).filter(Boolean).slice(0, 2).join(" · ") || "(未命名)";
  }

  /* 记录是否与关键词匹配（后台列表搜索用）：把所有字段拼成一段文本 */
  function matches(rec, kw) {
    if (!kw) return true;
    const s = kw.toLowerCase();
    return String(rec == null ? "" : JSON.stringify(rec)).toLowerCase().indexOf(s) >= 0;
  }

  C.schema = {
    emptyOf: emptyOf, validate: validate, titleOf: titleOf, matches: matches,
    optValues: optValues, optLabel: optLabel, LONG_TYPES: LONG_TYPES
  };
})(window.KBCore);
