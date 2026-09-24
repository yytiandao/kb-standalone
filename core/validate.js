/* ============================================================
 * core/validate.js —— 全量内容校验核心（框架层，后台与 CLI 共用）
 *
 * 这是「同一套规则」的唯一来源：
 *   · node content-check.js   （CLI 总检，加载本文件后调用 validateAll）
 *   · admin.html 的校验按钮    （对工作副本调用 validateAll）
 *   · admin.html 的导出门禁    （导出前强制 validateAll，有错误不导出）
 *   · node qa-check.js        （问答专项，复用 validateQa 与 qaId）
 *
 * 前置条件：调用前 data/manifest.js 已加载（window.KB_MANIFEST），
 * 且所有表已通过 C.store.register(def) 登记到 store（含当前工作副本）。
 * Node 里由 content-check.js 在 vm 沙箱中完成同样的加载。
 * ============================================================ */
window.KBCore = window.KBCore || {};

(function (C) {
  "use strict";

  const LV_OK = ['基础', '进阶', '易错'];
  const T_OK = ['choice', 'tf', 'calc', 'scene'];
  const EXP_MIN = 40;          // 解析低于此长度给「可能过短」提示，不判错

  /* 与 app.js 的 qaId() 必须保持一致：FNV-1a 取 32 位后转 36 进制 */
  function qaId(domainId, q) {
    let h = 2166136261;
    const str = domainId + '|' + q;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return domainId + '-' + (h >>> 0).toString(36);
  }

  /* ── 问答领域内逐题规则 ──
   * questions: 题目数组；domainId/at 前缀用于错误定位；
   * allQ / allId: 跨领域累计的重复索引（调用方在多个领域间复用）。
   * 返回 { errs, warns }（字符串数组）。 */
  function validateQa(questions, domainId, atOf, allQ, allId) {
    const errs = [], warns = [];
    (questions || []).forEach((it, i) => {
      const at = atOf(i);
      const tag = it && it.q ? at + '「' + String(it.q).slice(0, 24) + '…」' : at;
      if (!it || typeof it !== 'object') { errs.push(at + ' 不是对象'); return; }
      if (typeof it.q !== 'string' || !it.q.trim()) errs.push(tag + ' 缺题干 q');
      if (typeof it.exp !== 'string' || !it.exp.trim()) errs.push(tag + ' 缺深度解析 exp');
      else if (it.exp.trim().length < EXP_MIN) warns.push(tag + ' 的 exp 只有 ' + it.exp.trim().length + ' 字，可能过短（讲原理而不是复述答案）');
      if (!Array.isArray(it.opts) || it.opts.length < 2) errs.push(tag + ' 的 opts 必须是至少 2 项的数组');
      else {
        const seenOpt = new Set();
        it.opts.forEach((o, j) => {
          if (typeof o !== 'string' || !o.trim()) errs.push(tag + ' 的 opts[' + j + '] 为空');
          else if (seenOpt.has(o)) errs.push(tag + ' 的选项重复: ' + o);
          seenOpt.add(o);
        });
      }
      if (typeof it.a !== 'number' || !Number.isInteger(it.a)) errs.push(tag + ' 的答案下标 a 必须是整数');
      else if (Array.isArray(it.opts) && (it.a < 0 || it.a >= it.opts.length)) errs.push(tag + ' 的答案下标 a=' + it.a + ' 越界（opts 只有 ' + (it.opts || []).length + ' 项）');
      if (LV_OK.indexOf(it.lv) < 0) errs.push(tag + ' 的 lv 必须是 ' + LV_OK.join(' / ') + '，当前是 ' + JSON.stringify(it.lv));
      const t = it.t === undefined ? 'choice' : it.t;
      if (T_OK.indexOf(t) < 0) errs.push(tag + ' 的 t 必须是 ' + T_OK.join(' / ') + '，当前是 ' + JSON.stringify(it.t));
      if (!Array.isArray(it.w)) errs.push(tag + ' 缺干扰项说明 w（应为与 opts 等长的数组）');
      else if (Array.isArray(it.opts)) {
        if (it.w.length !== it.opts.length) errs.push(tag + ' 的 w 长度 ' + it.w.length + ' ≠ opts 长度 ' + it.opts.length);
        else if (!(typeof it.a === 'number' && it.a >= 0 && it.a < it.opts.length)) { /* a 越界已单独报错 */ }
        else {
          if (it.w[it.a] !== '') errs.push(tag + ' 的正确项位置 w[' + it.a + '] 应留空字符串，当前是 ' + JSON.stringify(String(it.w[it.a]).slice(0, 20)));
          it.opts.forEach((o, j) => {
            if (j === it.a) return;
            if (typeof it.w[j] !== 'string' || !it.w[j].trim()) errs.push(tag + ' 的选项 ' + j + '「' + String(o).slice(0, 16) + '」没写为什么不对（w[' + j + '] 为空）');
          });
        }
      }
      if (typeof it.q === 'string') {
        if (allQ.has(it.q)) errs.push(tag + ' 的题干与 ' + allQ.get(it.q) + ' 重复');
        else allQ.set(it.q, tag);
        const id = qaId(domainId, it.q);
        if (allId.has(id)) errs.push(tag + ' 的 id 与 ' + allId.get(id) + ' 重复');
        else allId.set(id, tag);
      }
    });
    return { errs: errs, warns: warns };
  }

  /* ── KB_QA_META 自身 ── */
  function validateQaMeta(meta, errs, warns) {
    const ids = new Set();
    (meta || []).forEach((m, i) => {
      if (!m.id) errs.push('KB_QA_META[' + i + '] 缺 id');
      if (!m.name) errs.push('KB_QA_META[' + i + '] (' + m.id + ') 缺 name');
      if (!m.icon) warns.push('KB_QA_META[' + i + '] (' + m.id + ') 缺 icon，标签会没有图标');
      if (ids.has(m.id)) errs.push('KB_QA_META 中 id 重复: ' + m.id);
      ids.add(m.id);
    });
    return ids;
  }

  /* ── 全量校验 ──
   * 对 store 里已登记的全部表跑一遍（表契约 + 跨表引用 + 问答专项）。
   * 返回 { errs, warns, counts } —— counts 供输出统计用。 */
  function validateAll() {
    const errs = [], warns = [], counts = {};
    const MANIFEST = window.KB_MANIFEST || [];
    const known = C.store.knownIndex(MANIFEST.map(d => d.key));

    /* ① 逐表契约 */
    MANIFEST.forEach(def => {
      const val = C.store.get(def.key);
      if (val === undefined) return;
      const n = def.editor === 'qa' ? Object.keys(val || {}).reduce((a, d) => a + (val[d] || []).length, 0)
                                    : (Array.isArray(val) ? val.length : Object.keys(val || {}).length);
      counts[def.key] = n;
      const label = def.label || def.key;

      if (def.editor === 'records') {
        const ik = def.idKey || 'name';
        /* 身份键的唯一性只在字段显式声明 unique:true 时检查 ——
           像更新日志按日期分组，「日期」是身份键但天然会重复 */
        const ikField = (def.fields || []).find(f => f.key === ik);
        const mustBeUnique = !!(ikField && ikField.unique);
        const seen = new Map();
        (val || []).forEach((rec, i) => {
          C.schema.validate(rec, def.fields, { known: known, optionLists: known }).forEach(e => errs.push(label + ' 第 ' + (i + 1) + ' 条：' + e.msg));
          if (!mustBeUnique) return;
          const v = rec && rec[ik];
          if (v !== undefined && v !== '') {
            if (seen.has(v)) errs.push(label + '：身份键 ' + ik + '「' + v + '」重复（第 ' + seen.get(v) + ' 与第 ' + (i + 1) + ' 条）');
            else seen.set(v, i + 1);
          }
        });
      }

      if (def.editor === 'map') {
        const kind = (def.value || {}).kind;
        Object.keys(val || {}).forEach(k => {
          const raw = val[k];
          if (kind === 'text') { if (typeof raw !== 'string') errs.push(label + ' 键「' + k + '」应为文本'); }
          else if (kind === 'lines') {
            if (!Array.isArray(raw) || !raw.length) errs.push(label + ' 键「' + k + '」应为非空数组');
            else raw.forEach((x, i) => { if (typeof x !== 'string' || !x.trim()) errs.push(label + ' 键「' + k + '」第 ' + (i + 1) + ' 项为空'); });
          } else if (kind === 'sections') {
            (def.value.sections || []).forEach(sec => {
              if (!Array.isArray(raw[sec.k]) || !raw[sec.k].length) errs.push(label + ' 键「' + k + '」的「' + sec.label + '」缺失或为空');
            });
          }
        });
        if (def.refKey) {
          const idx = known[def.refKey] || [];
          Object.keys(val || {}).forEach(k => { if (idx.indexOf(k) < 0) errs.push(label + ' 的键「' + k + '」在 ' + def.refKey + ' 里不存在'); });
        }
      }

      if (def.editor === 'qa') {
        const meta = window.KB_QA_META || [];
        const doms = validateQaMeta(meta, errs, warns);
        Object.keys(val || {}).forEach(dom => {
          if (!doms.has(dom)) errs.push('原理问答领域「' + dom + '」不在 KB_QA_META 里（该文件不会被页面加载）');
        });
        const allQ = new Map(), allId = new Map();
        doms.forEach(dom => {
          if (!Array.isArray(val[dom])) { errs.push('原理问答缺领域数据: ' + dom); return; }
          const r = validateQa(val[dom], dom, i => '『' + dom + '』第 ' + (i + 1) + ' 题', allQ, allId);
          r.errs.forEach(x => errs.push(x));
          r.warns.forEach(x => warns.push(x));
        });
        /* 清单里的题数 n：导航角标在首屏用它显示真实题数（题目本体按需加载） */
        meta.forEach(m => {
          const real = (val[m.id] || []).length;
          if (m.n === undefined || m.n === null) errs.push('『' + (m.name || m.id) + '』的题目数 n 缺失（data/qa-meta.js）');
          else if (m.n !== real) errs.push('『' + (m.name || m.id) + '』的题目数 n = ' + m.n + '，实际有 ' + real + ' 题（改题目后请同步 data/qa-meta.js 里的 n）');
        });
      }
    });

    /* ② 跨表引用完整性 */
    const itemNames = new Set((C.store.get('KB_ITEMS') || []).map(x => x.name));
    const glossKeys = new Set((C.store.get('KB_GLOSS') || []).map(x => x.en));

    [['KB_DEEP', '深度解析'], ['KB_NUM', '关键数值'], ['KB_MEMO', '一句话记忆'], ['KB_TASK', '动手练习'], ['KB_IMG', '参考图'], ['KB_USAGE', '应用场景覆盖']].forEach(([k, label]) => {
      if (!C.store.has(k)) return;
      Object.keys(C.store.get(k)).forEach(n => { if (!itemNames.has(n)) errs.push(label + ' 的键「' + n + '」不是 KB_ITEMS 里的条目'); });
    });
    if (C.store.has('KB_REL')) {
      Object.keys(C.store.get('KB_REL')).forEach(n => {
        if (!itemNames.has(n)) errs.push('关联条目 的键「' + n + '」不是 KB_ITEMS 里的条目');
        (C.store.get('KB_REL')[n] || []).forEach(v => { if (!itemNames.has(v)) errs.push('关联条目「' + n + '」指向的「' + v + '」不存在'); });
      });
    }
    if (C.store.has('KB_GLOSS_USE')) {
      Object.keys(C.store.get('KB_GLOSS_USE')).forEach(k => { if (!glossKeys.has(k)) errs.push('术语实际用法 的键「' + k + '」不在 KB_GLOSS 里'); });
    }
    if (C.store.has('KB_ITEM_PROC')) {
      Object.keys(C.store.get('KB_ITEM_PROC')).forEach(k => { if (!itemNames.has(k)) errs.push('条目→工艺指派 的键「' + k + '」不是 KB_ITEMS 里的条目'); });
      const procs = (C.store.get('KB_PROC') || []).map(p => p.id);
      const dims = (C.store.get('KB_DIM') || []).map(d => d.id);
      Object.entries(C.store.get('KB_ITEM_PROC')).forEach(([k, v]) => {
        if (v && v.proc && v.proc !== 'common' && procs.indexOf(v.proc) < 0) errs.push('条目→工艺指派「' + k + '」的工艺 ' + v.proc + ' 不存在');
        if (v && v.dim && dims.indexOf(v.dim) < 0) errs.push('条目→工艺指派「' + k + '」的维度 ' + v.dim + ' 不存在');
      });
    }
    /* 工艺与维度归属现在写在条目上（2026-09 结构细化），逐条校验取值合法 */
    {
      const procIds = (C.store.get('KB_PROC') || []).map(p => p.id).concat(['common']);
      const dimIds = (C.store.get('KB_DIM') || []).map(d => d.id);
      let todoN = 0;
      (C.store.get('KB_ITEMS') || []).forEach(it => {
        if (procIds.indexOf(it.proc) < 0) errs.push('知识点「' + it.name + '」的工艺 ' + JSON.stringify(it.proc) + ' 不存在');
        const dims = Array.isArray(it.dims) ? it.dims : [];
        if (!dims.length) errs.push('知识点「' + it.name + '」没有维度归属（dims 为空）');
        dims.forEach(d => { if (dimIds.indexOf(d) < 0) errs.push('知识点「' + it.name + '」的维度 ' + d + ' 不存在'); });
        if (it.todo) todoN++;
      });
      if (todoN) warns.push('有 ' + todoN + ' 条标了「待定」，需要后续核实：' +
        (C.store.get('KB_ITEMS') || []).filter(x => x.todo).slice(0, 5).map(x => x.name).join('、') + (todoN > 5 ? ' …' : ''));
    }
    /* 实战宝典条目的工艺归属（procs 数组，可为空 = 跨工艺通用内容） */
    [['KB_MISTAKE', '设计避坑', 't'], ['KB_TROUBLE', '缺陷排查', 's']].forEach(([k, label, titleKey]) => {
      if (!C.store.has(k)) return;
      const procIds = (C.store.get('KB_PROC') || []).map(p => p.id).concat(['common']);
      (C.store.get(k) || []).forEach(g => (g.items || []).forEach(it => {
        const ps = it.procs || [];
        if (!ps.length) return;
        ps.forEach(p => { if (procIds.indexOf(p) < 0) errs.push(label + '「' + (it[titleKey] || '').slice(0, 20) + '」的工艺 ' + p + ' 不存在'); });
      }));
    });

    /* 分类 → 领域的归属 */
    const catIds = new Set((C.store.get('KB_CATS') || []).map(c => c.id));
    (C.store.get('KB_DOMAINS') || []).forEach(d => {
      (d.subs || []).forEach(sub => { if (!catIds.has(sub)) errs.push('领域「' + d.name + '」包含的分类 ' + sub + ' 不存在'); });
    });
    (C.store.get('KB_ITEMS') || []).forEach(it => { if (!catIds.has(it.cat)) errs.push('条目「' + it.name + '」的分类 ' + it.cat + ' 不存在'); });

    return { errs: errs, warns: warns, counts: counts };
  }

  C.qaId = qaId;
  C.validateQa = validateQa;
  C.validateQaMeta = validateQaMeta;
  C.validateAll = validateAll;
})(window.KBCore);
