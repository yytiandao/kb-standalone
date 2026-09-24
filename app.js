/* ============================================================
 * app.js —— 页面主逻辑（原 index.html 内联脚本抽出）
 * 与全部数据脚本一同以 defer 加载：并行下载、按序执行、DOM 就绪后运行
 *
 * 数据层已整合为 data/ 一表一文件（2026-09）：
 *   · 原先「多文件 + 运行时合并」的 PLUS 批次、学习地图归位、同义词并入，
 *     全部在整合时烘焙进了 data/*.js，这里的合并 IIFE 随之移除；
 *   · 原先「内容通用化」的运行时改写层（kb-generic-*.js）也一并烘焙，
 *     并顺手修复了它改坏 KB_REL 外键造成的 14 条悬空引用。
 *   内容增删改请用 admin.html（后台），或直接手改 data/ 下的文件。
 * ============================================================ */

const DC = {
  material:     {c:"#d97706", s:"#b45309", w:"#fff7ed"},
  manufacturing:{c:"#1d4ed8", s:"#1e3a8a", w:"#eff6ff"},
  mold:         {c:"#0891b2", s:"#0e7490", w:"#ecfeff"},
  design:       {c:"#2563eb", s:"#1d4ed8", w:"#eff4ff"},
  drawing:      {c:"#64748b", s:"#475569", w:"#f8fafc"},
  surface:      {c:"#db2777", s:"#be185d", w:"#fdf2f8"},
  optic:        {c:"#ea580c", s:"#c2410c", w:"#fff7ed"},
  thermal:      {c:"#dc2626", s:"#b91c1c", w:"#fef2f2"},
  safety:       {c:"#059669", s:"#047857", w:"#ecfdf5"},
  test:         {c:"#0d9488", s:"#0f766e", w:"#f0fdfa"},
  pack:         {c:"#0369a1", s:"#075985", w:"#f0f9ff"},
  cost:         {c:"#ca8a04", s:"#a16207", w:"#fefce8"},
  joining:   {c:"#a21caf", s:"#86198f", w:"#fdf4ff"},
  mech:      {c:"#4f46e5", s:"#4338ca", w:"#eef2ff"},
  strength:  {c:"#be123c", s:"#9f1239", w:"#fff1f2"},
  seal:      {c:"#0e7490", s:"#155e75", w:"#ecfeff"},
  env:       {c:"#166534", s:"#14532d", w:"#f0fdf4"},
  ergo:      {c:"#65a30d", s:"#4d7c0f", w:"#f7fee7"},
  elec:      {c:"#7e22ce", s:"#6b21a8", w:"#faf5ff"},
  quality:   {c:"#6d28d9", s:"#5b21b6", w:"#f5f3ff"},
  flow:      {c:"#78716c", s:"#57534e", w:"#fafaf9"},
};
function dc(id){ return DC[id] || {c:"#2563eb", s:"#1d4ed8", w:"#eff4ff"}; }

const kw = document.getElementById("kw");
const lvFilter = document.getElementById("lvFilter");
const backBtn = document.getElementById("backBtn");
const homeView = document.getElementById("homeView");
const stepView = document.getElementById("stepView");
const domainView = document.getElementById("domainView");
const searchView = document.getElementById("searchView");
const domainsEl = document.getElementById("domains");
const homeStatsEl = document.getElementById("homeStats");
const domainHeadEl = document.getElementById("domainHead");
const abListEl = document.getElementById("abList");
const chipsEl = document.getElementById("chips");
const tbody = document.getElementById("tbody");
const statsEl = document.getElementById("stats");
const emptyEl = document.getElementById("empty");
const searchTbody = document.getElementById("searchTbody");
const searchStatsEl = document.getElementById("searchStats");
const searchEmptyEl = document.getElementById("searchEmpty");

// ── 新模块元素 ──
const navbar = document.getElementById("navbar");
const quickView = document.getElementById("quickView");
const checkView = document.getElementById("checkView");
const caseView = document.getElementById("caseView");
const glossView = document.getElementById("glossView");
const compareView = document.getElementById("compareView");
const fieldView = document.getElementById("fieldView");
const galleryView = document.getElementById("galleryView");
const selectView = document.getElementById("selectView");
const formulaView = document.getElementById("formulaView");
const tplView = document.getElementById("tplView");
const favView = document.getElementById("favView");
const procView = document.getElementById("procView");
const qaView = document.getElementById("qaView");
const KB_VIEWS = [homeView, domainView, searchView, procView];
const MOD_VIEWS = {quick:quickView, check:checkView, case:caseView, gloss:glossView,
                   field:fieldView, gallery:galleryView,
                   select:selectView, formula:formulaView,
                   tpl:tplView, fav:favView, compare:compareView,
                   step:stepView, qa:qaView};

let activeModule = "kb";
let activeQuick = (window.KB_QUICK && KB_QUICK[0] ? KB_QUICK[0].id : "");
let activeCase  = (window.KB_CASES && KB_CASES[0] ? KB_CASES[0].id : "");
let activeChk   = (window.KB_CHECKS && KB_CHECKS[0] ? KB_CHECKS[0].id : "");
let activeField = "mistake";
let glCat = "全部";
let activeSel   = (window.KB_SELECT && KB_SELECT[0] ? KB_SELECT[0].id : "");
let activeFm    = (window.KB_FORMULA && KB_FORMULA[0] ? KB_FORMULA[0].cat : "");

let activeDomain = null;
let activeSub = "all";
let browseAll = false;
let currentList = null;   // 详情面板上/下一条所依据的列表
let activeTpl = (window.KB_TEMPLATE && KB_TEMPLATE[0] ? KB_TEMPLATE[0].id : "");
let favTab = "fav";
let activeQa  = "all";    // 原理问答：当前领域（all | 12 个领域 id）
let qaLev     = "";       // 原理问答：难度筛选（"" | 基础 | 进阶 | 易错）
let curDetail = null;     // 当前详情面板打开的知识点

const CAT_NAME = Object.fromEntries(KB_CATS.map(c=>[c.id,c.name]));
const CAT_DOMAIN = {};
KB_DOMAINS.forEach(d=>d.subs.forEach(s=>CAT_DOMAIN[s]=d));

/* ══════════ 工艺分类框架（数据见 data/proc.js）══════════
 * 知识第一级轴 = 工艺（KB_PROC），每种工艺内部按五维（KB_DIM）组织。
 * 条目的工艺与维度归属直接写在条目上（见下方 itemProcOf / itemDimsOf）。
 * 注意：procView 的元素引用在上方视图常量区声明（KB_VIEWS 需要它）。 */
const PROC_DC = { inj:"manufacturing", sheet:"design", diecast:"mold", extrude:"thermal", post:"surface", proto:"cost", assy:"test", hw:"drawing", glass:"optic", elec:"safety", common:"safety" };
const PROC_SHORT = { inj:"塑料", sheet:"钣金", diecast:"压铸", extrude:"挤压", post:"后加工", proto:"打样", assy:"装配", hw:"五金", glass:"玻璃", elec:"电子", common:"通用" };
const LS_PROC = "kb-proc-v1";
let activeProc = lsGet(LS_PROC, "all");     // all | inj | sheet | diecast | extrude | common
let activeDim = "all";                      // 五维筛选（工艺页内）
function procOf(id){ return (window.KB_PROC || []).find(p=>p.id===id); }
/* ══════════ 工艺 / 维度归属（条目自带，内联在 KB_ITEMS 上）══════════
 * 2026-09 结构细化：原先 proc/dim 靠在 data/proc.js 的侧表（KB_ITEM_PROC，仅覆盖 24 条）
 * 加一张「分类→维度」默认表推导，导致「一个分类只能属于一个维度」、且条目本身不带分类。
 * 现在每条自带 proc（单值）与 dims（多值数组），分类精确到条目、可多值、后台可直接编辑。
 * KB_CAT_DIMS 退化为「新建条目时的预填建议」，不再是渲染真值。 */
function itemProcOf(it){ return it.proc || "inj"; }
/* 维度返回数组：一个条目可以同时是「材料特性」与「选材约束」 */
function itemDimsOf(it){
  if(Array.isArray(it.dims) && it.dims.length) return it.dims;
  return [it.dim || "design"];          // 兼容旧字段
}
function itemDimOf(it){ return itemDimsOf(it)[0]; }   // 单值场景（列表排序/标签）取首个
function catDimsOf(cat){ return (window.KB_CAT_DIMS || {})[cat] || (window.KB_CAT_DIM ? [window.KB_CAT_DIM[cat]] : []) || []; }
function procItems(id){ return KB_ITEMS.filter(it=>itemProcOf(it)===id); }
function dimName(id){ const d = (window.KB_DIM || []).find(x=>x.id===id); return d ? d.name : id; }
/* 某工艺下某维度的条目（多值匹配） */
function procItemsInDim(id, dim){
  return procItems(id).filter(it => dim === "all" || itemDimsOf(it).indexOf(dim) >= 0);
}
/* 「应用场景/注意事项」通用化覆盖表（kb-usage-plus.js）：有改写用改写，无则用原文 */
function usageOf(it){ const v = (window.KB_USAGE || {})[it.name]; return v || it.usage || ""; }
/* 标准清单索引：标准号 → { name, note }，供知识点详情里的「相关标准」引用时带出名称。
   条目上的 std 只存标准号（不重复存名称），名称统一维护在 KB_STD 里一份。
   ⚠️ 匹配时忽略年份版本（条目写 GB/T 5237.2、清单写 GB/T 5237.2-2017 也要能对上），
   两种写法混用的现实是长期存在的，不能只做全等匹配。 */
let _stdIdx = null;
/* 标准号归一化（只用于查名称，不改变显示）：
   去掉年份版本、去空格、GB/T 与 GB 视为同一编号 —— 这三种写法在库里长期混用 */
function _stdKey(s){
  return String(s)
    .replace(/-\d{4}$/, "").replace(/:\d{4}$/, "")
    .replace(/\/\s*T\b/gi, "")
    .replace(/\s+/g, "")
    .trim().toUpperCase();
}
function stdIndex(){
  if(_stdIdx) return _stdIdx;
  _stdIdx = {};
  (window.KB_STD || []).forEach(g => (g.items || []).forEach(s => {
    if(!s || !s.code) return;
    _stdIdx[String(s.code).trim()] = s;          // 原样一份
    const k = _stdKey(s.code);
    if(k && !_stdIdx[k]) _stdIdx[k] = s;         // 去掉年份的宽松键（先到先得，避免互相覆盖）
  }));
  return _stdIdx;
}
/* 查标准名称：先全等，再去掉年份 */
function stdLookup(code){
  const idx = stdIndex();
  return idx[String(code).trim()] || idx[_stdKey(code)] || null;
}
function setProc(id, dim){
  if(!procOf(id) && id !== "all") id = "all";
  activeProc = id; activeDim = dim || "all";
  activeDomain = null; activeSub = "all"; browseAll = false; kw.value = "";
  lsSet(LS_PROC, id);
  renderAll();
}
function syncProcTabs(){
  const row = document.getElementById("procRow");
  if(row) row.querySelectorAll("[data-proc]").forEach(b=>b.classList.toggle("active", b.dataset.proc === activeProc));
}
/* 工艺页底部的「相关实战宝典」分区 ----------
 * 实战宝典的避坑/排查与知识点是两种不同的内容结构（前者是「错做法/后果/正做法/自查」四栏），
 * 混排会让点开后的样子不一致，所以单独分区，只给出入口与条数。
 * 归属同样写在数据上（每条 Field 项自带 procs 数组），不在渲染层猜。 */
function procFieldBlock(procId, dimCnt){
  /* procs 含 common 表示「适用于所有工艺」，所以在任何工艺页都应出现 */
  const rel = it => { const ps = it.procs || []; return ps.indexOf(procId) >= 0 || ps.indexOf("common") >= 0; };
  const groupsOf = (tbl) => {
    const out = [];
    (window[tbl] || []).forEach(g => {
      const hit = (g.items || []).filter(rel).length;
      if (hit) out.push({ id: g.id, name: g.name, n: hit });
    });
    return out;
  };
  const mis = groupsOf("KB_MISTAKE", "mistake");
  const trb = groupsOf("KB_TROUBLE", "trouble");
  const total = mis.concat(trb).reduce((a, g) => a + g.n, 0);
  /* 缺陷/约束维度缺内容时，明确提示宝典里有没有可看的，而不是留一个干巴巴的 0 */
  const holes = (window.KB_DIM || []).filter(d => !dimCnt[d.id]).map(d => d.name);
  if (!total) {
    return holes.length
      ? `<div class="card"><div class="empty">本工艺的「${holes.join(" / ")}」维度还没有内容，实战宝典里也暂无对应条目 —— 这是明确的内容缺口，不是数据出错。</div></div>`
      : "";
  }
  const chips = (arr, label) => arr.length
    ? `<div class="pf-row"><span class="pf-k">${label}</span>${arr.map(g =>
        `<button class="rel-chip" data-fieldjump="${label === "设计避坑" ? "mistake" : "trouble"}" data-fgroup="${esc(g.id)}">${esc(g.name)} ${g.n} 条 →</button>`).join("")}</div>`
    : "";
  /* 「缺陷」维度下把相关避坑/排查条目直接内联进来（标题 + 一句要害），不再只有分组入口 ——
     五维里 defect 最薄（多为单条知识点里的小节），而这些「错做法→后果→正做法→自查」条目
     天然就是缺陷知识。数据仍以宝典为单一来源，这里只是渲染层联动，不复制内容。 */
  let inline = "";
  if (activeDim === "defect") {
    const CAP = 12;
    const rows = [];
    const push = (tbl, kind, titleKey, descKey) => (window[tbl] || []).forEach(g =>
      (g.items || []).forEach(it => { if (rel(it)) rows.push({ g, it, kind, titleKey, descKey }); }));
    push("KB_MISTAKE", "mistake", "t", "bad");
    push("KB_TROUBLE", "trouble", "s", "c");
    if (rows.length) {
      inline = `<div class="pf-inl-h">本维度相关实战条目（避坑 / 排查，共 ${rows.length} 条${rows.length > CAP ? `，下面列前 ${CAP} 条` : ""}）</div>`
        + rows.slice(0, CAP).map(r => {
          const desc = Array.isArray(r.it[r.descKey]) ? (r.it[r.descKey][0] || "") : (r.it[r.descKey] || "");
          return `<button class="pf-item" data-fieldjump="${r.kind}" data-fgroup="${esc(r.g.id)}">
            <span class="pf-it-t"><i class="pf-it-tag">${r.kind === "mistake" ? "避坑" : "排查"}</i>${esc(r.it[r.titleKey] || "")}</span>
            <span class="pf-it-d">${esc(String(desc).slice(0, 64))}${String(desc).length > 64 ? "…" : ""}</span>
          </button>`;
        }).join("")
        + (rows.length > CAP
          ? `<button class="rel-chip pf-more" data-fieldjump="mistake">查看实战宝典全部 ${rows.length} 条 →</button>`
          : "");
    }
  }
  return `<div class="card pf-card">
    <h3><svg class=ic aria-hidden=true><use href=#i-alert /></svg>本工艺相关的实战宝典 <span style="font-size:11px;color:var(--sub);font-weight:normal">共 ${total} 条 · 点进去直达对应分类</span></h3>
    ${chips(mis, "设计避坑")}
    ${chips(trb, "缺陷排查")}
    ${inline}
    ${holes.length ? `<div class="pf-hole">缺口：${holes.join(" / ")} 维度暂无知识点</div>` : ""}
  </div>`;
}
/* 列表表格是「限高 + 内部滚动」的容器，换工艺 / 换维度 / 改筛选时要把内部滚动也归零，
   否则新列表会停在上一份列表的滚动位置（表现为一进来就在中间几行）。 */
function resetTableScroll(){
  document.querySelectorAll(".tbl-scroll").forEach(el => { el.scrollTop = 0; });
}
function renderProc(){
  const p = procOf(activeProc); if(!p) return;
  resetTableScroll();
  document.getElementById("procIcon").innerHTML = p.icon;
  document.getElementById("procName").textContent = p.name;
  document.getElementById("procDesc").innerHTML = `<b>${esc(p.short)}</b> — ${esc(p.desc)}`;
  const all = procItems(p.id);
  /* 维度计数按多值统计：一个条目归属多个维度时会被各自计入，
     所以各维度之和可能大于条目总数（界面下方注明了这一点）。 */
  const dimCnt = {};
  (window.KB_DIM || []).forEach(d=>dimCnt[d.id] = all.filter(it=>itemDimsOf(it).indexOf(d.id) >= 0).length);
  const sumDim = (window.KB_DIM||[]).reduce((a,d)=>a+dimCnt[d.id], 0);
  document.getElementById("procMeta").innerHTML = `
    <div class="stat-grid stat-grid-wide" style="margin:10px 0 2px">
      <div class="stat-item"><b>${all.length}</b><span>知识点</span></div>
      <div class="stat-item"><b>${all.filter(it=>it.lv===1).length}</b><span>核心必会</span></div>
      <div class="stat-item" style="flex:2 1 200px; text-align:left; padding-left:14px"><b style="font-size:var(--fs-sm)">${esc(p.scenes)}</b><span>典型场景</span></div>
      <div class="stat-item" style="flex:2 1 220px; text-align:left; padding-left:14px"><b style="font-size:var(--fs-sm)">${esc(p.products)}</b><span>典型产品</span></div>
      <div class="stat-item" style="flex:2 1 260px; text-align:left; padding-left:14px"><b style="font-size:var(--fs-sm)">${esc(p.cost)}</b><span>成本量级</span></div>
    </div>`;
  document.getElementById("procDimTabs").innerHTML =
    `<button class="qv-tab${activeDim==="all" ? " active" : ""}" data-dim="all">全部 ${all.length}</button>` +
    (window.KB_DIM || []).map(d=>`<button class="qv-tab${activeDim===d.id ? " active" : ""}" data-dim="${d.id}">${esc(d.name)} ${dimCnt[d.id]}</button>`).join("");
  const list = procItemsInDim(p.id, activeDim);
  document.getElementById("procStats").innerHTML =
    `<span class="tip">🔧 <b>${esc(p.name)}</b>按五维组织：${(window.KB_DIM||[]).map(d=>`<span style="color:${dimCnt[d.id]?"inherit":"var(--danger)"}">${esc(d.name)} ${dimCnt[d.id]}</span>`).join(" · ")}`
    + `　·　一个条目可同时属于多个维度，故合计 ${sumDim} > 条目数 ${all.length}`
    + (activeProc==="inj" ? "。通用知识按首页「知识领域」卡片（21 个领域）导航，保持不变。" : "") + `</span>`;
  /* 实战宝典里与「缺陷 / 约束」相关的独立内容：单独分区给出入口，不与知识点混排 */
  document.getElementById("procField").innerHTML = procFieldBlock(p.id, dimCnt);
  const tb = document.getElementById("procTbody");
  const emptyEl = document.getElementById("procEmpty");
  if(!list.length){
    tb.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = `<b>${esc(dimName(activeDim))}</b> 维度暂无条目 —— 分类框架已就绪，内容按批次补充中（新增条目写入 kb-proc-${activeProc}.js 即自动出现在此）。`
      + (activeProc === "inj" && activeDim === "defect" ? `<br>💡 塑料的缺陷知识目前集中在：每条知识点详情的「常见错误与避坑」一节，以及「实战宝典 → 设计避坑 / 缺陷排查」。` : "");
  }else{
    emptyEl.style.display = "none";
    currentList = list.map(x=>x.name);
    tb.innerHTML = list.map((it,i)=>{
      const col = dc(PROC_DC[p.id] || "design");
      return rowHTML(it, i, "", `<span class="cat-tag">${PROC_SHORT[p.id]||""} · ${esc(dimName(itemDimOf(it)))}</span>`, `style="--tcw:${col.w};--tcs:${col.s}"`);
    }).join("");
  }
}
document.getElementById("procRow").addEventListener("click", e=>{
  const b = e.target.closest("[data-proc]"); if(!b) return;
  if(b.dataset.proc === activeProc){ setProc("all"); return; }   // 再点一次回到全部
  setProc(b.dataset.proc);
});
document.getElementById("procDimTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-dim]"); if(!b) return;
  activeDim = b.dataset.dim;
  renderProc();
});

/* ── 本机存储：主题 / 收藏 / 笔记 / 模板草稿 ── */
const LS_THEME = "kb-theme-v1", LS_FAV = "kb-fav-v1", LS_NOTE = "kb-note-v1", LS_TPL = "kb-tpl-v1";
const LS_RECENT = "kb-recent-v1", LS_SEARCH = "kb-search-v1";
function lsGet(k, dft){ try{ const v = JSON.parse(localStorage.getItem(k) || "null"); return v === null ? dft : v; }catch(e){ return dft; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

let theme = lsGet(LS_THEME, "light");
let favs = lsGet(LS_FAV, {});          // { 条目名: 收藏时间戳 }
let notes = lsGet(LS_NOTE, {});        // { 条目名: 文本 }
/* 「还没搞懂」的标记：和收藏分开 —— 收藏是留着用，这个是还没弄明白 */
const LS_DOUBT = "kb-doubt-v1";
let doubts = lsGet(LS_DOUBT, {});      // { 条目名: 时间戳 }
let tplDraft = lsGet(LS_TPL, {});      // { "模板id|块序号|行|列": "填写内容" }
let recents = lsGet(LS_RECENT, []);    // [ { n:条目名, t:时间戳 } ]  最多 30 条
let searchHist = lsGet(LS_SEARCH, []); // [ 关键词 ]  最多 12 条
function favOn(n){ return !!favs[n]; }
function favCount(){ return Object.keys(favs).length; }
function noteCount(){ return Object.values(notes).filter(x => x && x.trim()).length; }
function doubtCount(){ return Object.keys(doubts).length; }
function doubtOn(name){ return !!doubts[name]; }
function pushRecent(name){
  if(!name) return;
  recents = recents.filter(x => x.n !== name);
  recents.unshift({ n: name, t: Date.now() });
  if(recents.length > 30) recents = recents.slice(0, 30);
  lsSet(LS_RECENT, recents);
}
function pushSearchHist(q){
  q = (q || "").trim();
  if(q.length < 2) return;
  searchHist = searchHist.filter(x => x !== q);
  searchHist.unshift(q);
  if(searchHist.length > 12) searchHist = searchHist.slice(0, 12);
  lsSet(LS_SEARCH, searchHist);
  renderSearchHist();
}
function applyTheme(){
  document.documentElement.setAttribute("data-theme", theme);
  const b = document.getElementById("themeBtn");
  if(b) b.innerHTML = theme === "dark"
    ? '<svg class=ic aria-hidden=true><use href=#i-sun /></svg>'
    : '<svg class=ic aria-hidden=true><use href=#i-moon /></svg>';
  /* 3D 预览的画布不受 CSS 变量影响，需要主动通知重绘 */
  if(typeof window.KB_STEP_THEME === "function") window.KB_STEP_THEME(theme === "dark");
}
applyTheme();

const LV_TXT = {1:"核心必会",2:"进阶掌握",3:"了解即可"};
const LV_ORDER = {1:0, 2:1, 3:2};

function esc(s){return (s==null?"":String(s)).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
/* 高亮：支持一次高亮多个词（同义词扩展后的结果） */
function hlm(text, terms){
  const s = (text == null ? "" : String(text));
  const list = [...new Set((terms || []).filter(t => t && String(t).trim()).map(String))]
    .sort((a, b) => b.length - a.length);
  if(!list.length) return esc(s);
  let re;
  try{ re = new RegExp("(" + list.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi"); }
  catch(e){ return esc(s); }
  return s.split(re).map((part, i) => (i % 2 ? "<mark>" + esc(part) + "</mark>" : esc(part))).join("");
}
/* 对已是 HTML 的片段做高亮（避开标签内部） */
function markInHTML(html, terms){
  if(html == null) return "";
  const list = [...new Set((terms || []).filter(t => t && String(t).trim().length >= 2).map(String))]
    .sort((a, b) => b.length - a.length);
  if(!list.length) return String(html);
  let re;
  try{ re = new RegExp("(" + list.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![^<]*>)", "gi"); }
  catch(e){ return String(html); }
  return String(html).replace(re, "<mark>$1</mark>");
}
function hl(text, q){ return hlm(text, Array.isArray(q) ? q : (q ? [q] : [])); }

/* 同义词扩展：把用户输入扩展成一组等价词（含术语词典的英文↔中文） */
function synExpand(q){
  const s = (q || "").trim();
  if(!s) return [];
  const lq = s.toLowerCase();
  const out = new Set([s]);
  const groups = window.KB_SYN || [];
  for(const g of groups){
    if(out.size > 26) break;
    let hitG = false;
    for(const t0 of g){
      const lt = String(t0).toLowerCase();
      if(lt.length < 2) continue;
      if(lt === lq || (lt.length >= 3 && lq.length >= 3 && (lt.includes(lq) || lq.includes(lt)))){ hitG = true; break; }
    }
    if(hitG) g.forEach(t => { if(String(t).trim().length >= 1) out.add(String(t)); });
  }
  return [...out];
}
/* 用扩展词做「是否命中」判断 */
function makeHit(terms){
  const list = terms.map(t => t.toLowerCase()).filter(Boolean);
  return s => { const t = (s == null ? "" : String(s)).toLowerCase(); return list.some(x => t.includes(x)); };
}
function refreshBadges(){
  const f = document.getElementById("nbFav"); if(f) f.textContent = favCount() + " 条";
}
function domainItems(d){ return KB_ITEMS.filter(it=>d.subs.includes(it.cat)); }
function sortByLv(list){ return [...list].sort((a,b)=> LV_ORDER[a.lv]-LV_ORDER[b.lv]); }

// 图片路径工具：主图缩略图（列表用 3.5KB） / 参考图缩略图（图库用，约为原图一半）
function thumbOf(p){
  if(!p || p.indexOf("images/") !== 0 || p.indexOf("images/ref/") === 0 || p.indexOf("images/thumb/") === 0) return p || "";
  return "images/thumb/" + p.slice(7).replace(/\.(jpe?g|png)$/i, ".jpg");
}
function refThumbOf(p){
  if(!p || p.indexOf("images/ref/") !== 0) return p || "";
  return p.replace("images/ref/", "images/ref/thumb/").replace(/\.(jpe?g|png)$/i, ".jpg");
}

// 平台配色
const PLAT = {
  "B站":    {cls:"bili",    label:"B站",    enc: kw => "https://search.bilibili.com/all?keyword=" + encodeURIComponent(kw)},
  "YouTube":{cls:"yt",      label:"YouTube",enc: kw => "https://www.youtube.com/results?search_query=" + encodeURIComponent(kw)},
  "腾讯视频":{cls:"qqv",    label:"腾讯视频",enc: kw => "https://v.qq.com/search.html?query=" + encodeURIComponent(kw)},
  "百度":   {cls:"bh",      label:"百度",   enc: kw => "https://haokan.baidu.com/haokan/search?query=" + encodeURIComponent(kw)},
};

// 深度解析小节定义与渲染
const DEEP_DEF = {
  p:{t:"<svg class=ic aria-hidden=true><use href=#i-compass /></svg>核心原理",          c:"#2563eb", bg:"#eff4ff"},
  k:{t:"<svg class=ic aria-hidden=true><use href=#i-ruler /></svg>关键参数与公式",     c:"#0f766e", bg:"#f0fdfa"},
  e:{t:"<svg class=ic aria-hidden=true><use href=#i-settings /></svg>实战经验值",        c:"#059669", bg:"#ecfdf5"},
  f:{t:"<svg class=ic aria-hidden=true><use href=#i-alert /></svg>常见错误与避坑",     c:"#dc2626", bg:"#fef2f2"},
  s:{t:"<svg class=ic aria-hidden=true><use href=#i-book /></svg>相关标准与术语",     c:"#d97706", bg:"#fffbeb"}
};
/* ══════════════ 三句话速览：把「要点 + 关键数值 + 实操提醒」前置 ══════════════
   内容全部来自已有数据（points / KB_DEEP 的 k、e、f），不新增未经核实的信息 ——
   知识库的可信度比字数重要。 */
function renderBrief(it){
  const sec = document.getElementById("dpBriefSec"), box = document.getElementById("dpBrief");
  if(!sec || !box) return;
  const d = (window.KB_DEEP || {})[it.name] || {};
  const clip = (s, n) => {
    s = String(s || "").trim();
    return s.length > n ? s.slice(0, n).replace(/[，,、；;]$/, "") + "…" : s;
  };
  const rows = [];
  /* 01 取「原理」而非 points —— points 在下方「核心要点」已有，重复展示没有信息增量 */
  const p0 = (Array.isArray(d.p) && d.p[0]);
  if(p0) rows.push({ k: "核心原理", t: clip(String(p0).replace(/^[^:：]{1,10}[：:]s*/, ""), 96) });
  const k0 = (Array.isArray(d.k) && d.k[0]);
  if(k0) rows.push({ k: "关键数值", t: clip(k0, 96) });
  const e0 = (Array.isArray(d.e) && d.e[0]) || (Array.isArray(d.f) && d.f[0]);
  if(e0) rows.push({ k: "实操提醒", t: clip(e0, 96) });
  if(rows.length < 2){ sec.style.display = "none"; return; }
  sec.style.display = "";
  box.innerHTML = rows.map((r, i) =>
    "<div class=\"bf-item\"><span class=\"bf-n\">" + String(i + 1).padStart(2, "0") + "</span><div>"
    + "<span class=\"bf-k\">" + esc(r.k) + "</span>" + esc(r.t) + "</div></div>").join("");
}
function renderDeep(it){
  const sec = document.getElementById("dpDeepSec"), box = document.getElementById("dpDeep");
  const d = it.deep || (window.KB_DEEP || {})[it.name];
  if(!d){ sec.style.display = "none"; return; }
  const parts = Object.keys(DEEP_DEF).filter(k=>d[k] && (Array.isArray(d[k])? d[k].filter(x=>x&&String(x).trim()).length>0 : String(d[k]).trim()));
  if(!parts.length){ sec.style.display = "none"; return; }
  sec.style.display = "";
  box.innerHTML = parts.map(k=>{
    const def = DEEP_DEF[k];
    const arr = Array.isArray(d[k]) ? d[k] : [d[k]];
    const lis = arr.filter(x=>x && String(x).trim()).map(x=>{
      const s = String(x).trim();
      const m = s.match(/^([^:：]{1,10})[：:]\s*([\s\S]+)$/);
      const inner = m
        ? `<span class="tag" style="--d-c:${def.c};--d-bg:${def.bg}">${esc(m[1])}</span>${esc(m[2])}`
        : esc(s);
      return `<li>${inner}</li>`;
    }).join("");
    return `<div class="d-item"><h5 style="--d-c:${def.c};--d-bg:${def.bg}">${def.t}</h5><ul>${lis}</ul></div>`;
  }).join("");
}

// 经验数值 + 关联知识点
function renderNumRel(it){
  const nSec = document.getElementById("dpNumSec"), nBox = document.getElementById("dpNum");
  const arr = (window.KB_NUM || {})[it.name];
  if(arr && arr.length){
    nSec.style.display = "";
    nBox.innerHTML = arr.map((s,i)=>`<div class="n-item"><span class="ni">${String(i+1).padStart(2,"0")}</span><span>${esc(s)}</span></div>`).join("");
  }else{
    nSec.style.display = "none";
  }
  const rSec = document.getElementById("dpRelSec"), rBox = document.getElementById("dpRel");
  const rel = ((window.KB_REL || {})[it.name] || []).filter(n=>KB_ITEMS.some(x=>x.name===n));
  if(rel.length){
    rSec.style.display = "";
    rBox.innerHTML = rel.map(n=>`<button class="rel-chip" data-rel="${esc(n)}">${esc(n)} →</button>`).join("");
  }else{
    rSec.style.display = "none";
  }
  // 相关标准与手册（标准号会去 KB_STD 的标准清单里取名称）
  const sSec = document.getElementById("dpStdSec"), sBox = document.getElementById("dpStd");
  const stds = Array.isArray(it.std) ? it.std.filter(Boolean) : [];
  if(sSec && sBox && stds.length){
    sSec.style.display = "";
    sBox.innerHTML = stds.map(s => {
      const key = String(s).trim();
      const hit = stdLookup(key);
      const code = `<span class="std-code">${esc(key)}</span>`;
      return hit
        ? `<li>${code}<b>${esc(hit.name)}</b>${hit.note ? `<div class="std-note">${esc(hit.note)}</div>` : ""}</li>`
        : `<li>${code}</li>`;
    }).join("");
  }else if(sSec){
    sSec.style.display = "none";
  }
  // 动手练习
  const tSec = document.getElementById("dpTaskSec"), tBox = document.getElementById("dpTask");
  const taskRaw = (window.KB_TASK || {})[it.name];
  if(taskRaw){
    const task = normTask(taskRaw);
    tSec.style.display = "";
    tBox.innerHTML = `<div class="task-box">
      <div class="tb-t">${esc(task.t)}</div>
      <div class="tb-d">${esc(task.d)}</div>
      <ul class="tb-k">${(task.k||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    </div>`;
  }else{
    tSec.style.display = "none";
  }
}
/* KB_TASK 历史上出现过三种写法：{t,d,k} 对象、纯字符串、字符串数组。
 * 后两批新增用了字符串/数组，旧渲染层读 task.t 得到 undefined → esc() 返回空串，
 * 结果是「动手练习」区块显示成一个空框（不报错，所以一直没被发现）。
 * 这里统一归一化成 {t,d,k}，并把「验收：」之后的部分自动拆成验收点。 */
function normTask(x){
  const split = s => {
    const str = String(s == null ? "" : s).trim();
    const i = str.search(/验收[：:]/);
    if(i < 0) return { d: str, k: [] };
    const rest = str.slice(i).replace(/^验收[：:]\s*/, "");
    const parts = rest.split(/\s*(?=[\u2460-\u2473])|\s+(?=\d[)）])/)
      .map(t => t.replace(/^[\u2460-\u2473]\s*/, "").trim()).filter(Boolean);
    return { d: str.slice(0, i).trim(), k: parts.length ? parts : [rest] };
  };
  if(typeof x === "string"){ const r = split(x); return { t: "动手练习", d: r.d, k: r.k }; }
  if(Array.isArray(x)) return { t: "动手练习", d: "逐项完成，每项都要留下可验证的结果（数据 / 图纸 / 结论）：", k: x.map(s => String(s).trim()) };
  return { t: x.t || "动手练习", d: x.d || "", k: x.k || [] };
}
function openItemByName(name){
  const it = KB_ITEMS.find(x=>x.name===name);
  if(!it) return;
  openDetail(it);                 // 面板回到顶部由 openDetail 统一处理
}

// 详情面板
function openDetail(it){
  const d = CAT_DOMAIN[it.cat], col = dc(d.id);
  const panel = document.getElementById("detailPanel");
  panel.style.setProperty("--dp-c", col.c);
  panel.style.setProperty("--dp-s", col.s);
  document.getElementById("dpLv").textContent = LV_TXT[it.lv];
  document.getElementById("dpLv").className = "lv-mini lv" + it.lv;
  document.getElementById("dpDom").innerHTML = `${d.icon} <b>${esc(d.name)}</b> · ${esc(CAT_NAME[it.cat])}`;
  document.getElementById("dpName").textContent = it.name;
  document.getElementById("dpExtra").textContent = `共 ${(it.videos||[]).length} 个视频源 · ${it.img? "已配置示意图" : "暂未配图"}`;
  document.getElementById("dpPoints").textContent = it.points;
  document.getElementById("dpUsage").textContent = usageOf(it);
  // 一句话记忆
  const memo = (window.KB_MEMO || {})[it.name];
  const memoSec = document.getElementById("dpMemoSec");
  if(memo){ memoSec.style.display = ""; document.getElementById("dpMemo").textContent = memo; }
  else { memoSec.style.display = "none"; }
  renderBrief(it);
  renderDeep(it);
  renderNumRel(it);
  /* 「待定」说明：内容里有无法核实的部分（如供应商模具能力、牌号实测值）时，
     条目上带 todo 字段。这里显式提示，别让读者把待定值当成已确认结论。 */
  const todoEl = document.getElementById("dpTodo");
  if(todoEl){
    if(it.todo){ todoEl.style.display = ""; todoEl.innerHTML =
      `<svg class=ic aria-hidden=true><use href=#i-alert /></svg><div><b>本条含待核实内容</b>：${esc(it.todo)}</div>`; }
    else todoEl.style.display = "none";
  }
  // 视频列表
  document.getElementById("dpVideos").innerHTML = (it.videos||[]).map(v => {
    const cfg = PLAT[v.p] || {cls:"other", label:v.p};
    return `<a class="vid-card" href="${esc(v.u)}" target="_blank" rel="noopener">
      <div class="vid-logo ${cfg.cls}">${esc(cfg.label.slice(0,2))}</div>
      <div class="vid-info">
        <div class="vt">${esc(v.t)}</div>
        <div class="vp"><span>${esc(v.p)}</span><span>·</span><span>${esc(v.u.length > 60 ? v.u.slice(0,60)+"…" : v.u)}</span></div>
      </div>
      <span class="vid-arrow">›</span>
    </a>`;
  }).join("") || '<div style="font-size:13px;color:var(--sub);padding:10px 0">暂未配置视频链接</div>';
  // 图片区
  const imgEl = document.getElementById("dpImg");
  if(it.img){
    imgEl.innerHTML = `<img src="${esc(it.img)}" alt="${esc(it.name)}" loading="lazy" decoding="async">`;
  }else{
    imgEl.innerHTML = `<div class="ph"><b><svg class=ic aria-hidden=true><use href=#i-camera /></svg> 暂无示意图</b>可通过下方按钮搜索或让 AI 生成</div>`;
  }
  const kwTxt = (it.imgKw || it.name).split("/").map(s=>s.trim()).filter(Boolean);
  document.getElementById("dpKw").textContent = kwTxt.join(" · ");
  document.getElementById("dpImgBtns").innerHTML = `
    <a href="https://pixabay.com/zh/images/search/${encodeURIComponent(it.name)}/" target="_blank" rel="noopener"><svg class=ic aria-hidden=true><use href=#i-search /></svg>Pixabay 搜图</a>
    <a href="https://www.pexels.com/zh-cn/search/${encodeURIComponent(it.name)}/" target="_blank" rel="noopener"><svg class=ic aria-hidden=true><use href=#i-search /></svg>Pexels 搜图</a>
    <a href="https://huaban.com/search/?q=${encodeURIComponent(it.name)}" target="_blank" rel="noopener"><svg class=ic aria-hidden=true><use href=#i-search /></svg>花瓣 搜图</a>
    <button class="ai" id="aiGenBtn"><svg class=ic aria-hidden=true><use href=#i-cpu /></svg>AI 提示词</button>`;
  document.getElementById("aiGenBtn").onclick = () => {
    document.getElementById("aiPromptText").textContent = it.imgAi || `工程示意图：${it.name}。线条简洁、白底、轴侧视角，关键部件引出标注。`;
    document.getElementById("aiModal").classList.add("open");
  };
  // 参考图集
  renderRef(it);
  dpNavUpdate(it);
  updateAnchors();
  // 收藏 / 笔记 / 打印
  curDetail = it;
  pushRecent(it.name);
  renderDpActions(it);
  const ta = document.getElementById("dpNote");
  if(ta){
    ta.value = notes[it.name] || "";
    ta.oninput = ()=>{
      notes[it.name] = ta.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(()=>{ lsSet(LS_NOTE, notes); refreshBadges(); }, 500);
      const nj = document.getElementById("dpNoteJump");
      // ⚠️ 这里必须用 innerHTML：图标是 <svg> 标签，用 textContent 会把源码当文字显示出来
      if(nj) nj.innerHTML = ta.value.trim() ? `<svg class=ic aria-hidden=true><use href=#i-edit /></svg>笔记（${ta.value.trim().length} 字）` : "<svg class=ic aria-hidden=true><use href=#i-edit /></svg>写笔记";
    };
    ta.onblur = ()=>{ lsSet(LS_NOTE, notes); refreshBadges(); renderDpActions(it); };
  }
  document.body.classList.add("detail-open");
  /* 每次打开都回到面板顶部：面板是复用的同一个滚动容器，不清的话打开新条目会停在
     上一条的滚动位置（列表里点行、点缩略图都走 openDetail，之前只有 openItemByName 清了） */
  const dpb = document.querySelector(".dp-body");
  if(dpb) dpb.scrollTop = 0;
}
let noteTimer = null;

// 详情面板：上一条 / 下一条
function dpNavUpdate(it){
  const names = (currentList && currentList.length) ? currentList : KB_ITEMS.map(x=>x.name);
  const i = names.indexOf(it.name);
  const prev = i > 0 ? names[i-1] : null;
  const next = (i >= 0 && i < names.length-1) ? names[i+1] : null;
  const bp = document.getElementById("dpPrev"), bn = document.getElementById("dpNext");
  bp.disabled = !prev; bn.disabled = !next;
  bp.textContent = prev ? "‹ " + (prev.length>9? prev.slice(0,9)+"…" : prev) : "‹ 上一条";
  bn.textContent = next ? (next.length>9? next.slice(0,9)+"…" : next) + " ›" : "下一条 ›";
  bp.onclick = prev ? ()=>openItemByName(prev) : null;
  bn.onclick = next ? ()=>openItemByName(next) : null;
}

// 详情面板：区块快速跳转
const DP_ANCHORS = [
  {id:"secPoints", t:"<svg class=ic aria-hidden=true><use href=#i-pin /></svg>要点"}, {id:"secUsage", t:"<svg class=ic aria-hidden=true><use href=#i-bulb /></svg>应用"},
  {id:"dpNumSec", t:"<svg class=ic aria-hidden=true><use href=#i-hash /></svg>数值"},  {id:"dpDeepSec", t:"<svg class=ic aria-hidden=true><use href=#i-book-open /></svg>深度"},
  {id:"dpRelSec", t:"<svg class=ic aria-hidden=true><use href=#i-link /></svg>关联"},  {id:"dpStdSec", t:"<svg class=ic aria-hidden=true><use href=#i-award /></svg>标准"},
  {id:"dpTaskSec", t:"<svg class=ic aria-hidden=true><use href=#i-edit /></svg>练习"},  {id:"secVideos", t:"<svg class=ic aria-hidden=true><use href=#i-play /></svg>视频"},
  {id:"dpRefSec", t:"<svg class=ic aria-hidden=true><use href=#i-camera /></svg>图集"},  {id:"secNote", t:"<svg class=ic aria-hidden=true><use href=#i-file-text /></svg>笔记"}
];
function updateAnchors(){
  const box = document.getElementById("dpAnchors");
  const vis = DP_ANCHORS.filter(a=>{
    const el = document.getElementById(a.id);
    return el && el.style.display !== "none" && el.textContent.trim().length > 2;
  });
  box.innerHTML = vis.map(a=>`<button data-sec="${a.id}">${a.t}</button>`).join("");
  box.style.display = vis.length ? "" : "none";
}

// 参考图集渲染
function refCount(name){ const a=(window.KB_IMG||{})[name]; return a? a.length : 0; }
function renderRef(it){
  const sec = document.getElementById("dpRefSec"), grid = document.getElementById("dpRefGrid"), cnt = document.getElementById("dpRefCount");
  const arr = (window.KB_IMG || {})[it.name] || [];
  if(!arr.length){ sec.style.display = "none"; return; }
  sec.style.display = "";
  cnt.textContent = arr.length + " 张";
  grid.innerHTML = arr.map(x=>`<div class="ref-card" data-ref="${esc(x.f)}" data-cap="${esc(x.t)}" data-src="${esc(x.s||"")}">
    <div class="rc-img"><img src="${esc(x.f)}" alt="${esc(x.t)}" loading="lazy" decoding="async"></div>
    <div class="rc-cap">${esc(x.t)}</div>
    <div class="rc-src">来源：${esc(x.s||"—")}</div>
  </div>`).join("");
}

function closeDetail(){
  document.body.classList.remove("detail-open");
}
document.getElementById("dpClose").onclick = closeDetail;
document.getElementById("detailBackdrop").onclick = closeDetail;
document.addEventListener("keydown", e => {
  if(e.key === "Escape"){
    const im = document.getElementById("imgModal");
    const am = document.getElementById("aiModal");
    if(im && im.classList.contains("open")) im.classList.remove("open");
    else if(am && am.classList.contains("open")) am.classList.remove("open");
    else if(document.body.classList.contains("detail-open")) closeDetail();
    /* 搜索视图下按 Esc：先关搜索历史，再按一次清空关键词退回上一屏（通行习惯） */
    else if(searchView && searchView.style.display !== "none"){
      const hist = document.getElementById("searchHist");
      if(hist && hist.classList.contains("on")) hideSearchHist();   // 下拉靠 .on 类控制，不看 offsetParent
      else { kw.value = ""; browseAll = false; renderAll(); }
    }
  }
});

// 首页
function renderHome(){
  const total = KB_ITEMS.length;
  const core = KB_ITEMS.filter(it=>it.lv===1).length;
  homeStatsEl.innerHTML =
    `<div class="hs"><b>${KB_DOMAINS.length}</b><span>领域</span></div>` +
    `<div class="hs"><b>${total}</b><span>知识点</span></div>` +
    `<div class="hs"><b>${core}</b><span>核心必会</span></div>` +
    `<div class="hs"><b>${Object.values(window.KB_IMG||{}).reduce((a,v)=>a+v.length,0)}</b><span>参考图</span></div>` +
    `<div class="hs"><b>${(window.KB_QUICK||[]).length}</b><span>速查表</span></div>` +
    `<div class="hs"><b>${(window.KB_GLOSS||[]).length}</b><span>术语</span></div>`;

  // ── 内容总览 ──
  const ovCount = (fn,arr)=>arr.reduce(fn,0);
  const OVERVIEW = [
    {n:total, l:"知识点", mod:"kb"},
    {n:ovCount((a,b)=>a+b.length, Object.values(window.KB_IMG||{})), l:"参考图", mod:"gallery"},
    {n:KB_QUICK.length, l:"速查表", mod:"quick"},
    {n:ovCount((a,c)=>a+c.groups.reduce((x,g)=>x+g.items.length,0), KB_CHECKS), l:"检查项", mod:"check"},
    {n:KB_CASES.length, l:"整机案例", mod:"case"},
    {n:KB_GLOSS.length, l:"术语", mod:"gloss"},
    {n:ovCount((a,x)=>a+x.items.length, KB_TROUBLE), l:"缺陷排查", mod:"field", f:"trouble"},
    {n:ovCount((a,x)=>a+x.items.length, (window.KB_MISTAKE||[])), l:"设计避坑", mod:"field", f:"mistake"},
    {n:ovCount((a,x)=>a+x.items.length, KB_INTERVIEW), l:"面试题", mod:"field", f:"interview"},
    {n:ovCount((a,x)=>a+x.items.length, KB_STD), l:"标准", mod:"field", f:"std"},
    {n:(window.KB_SELECT||[]).length, l:"选型决策树", mod:"select"},
    {n:ovCount((a,g)=>a+(g.items||[]).length,(window.KB_FORMULA||[])) + ovCount((a,g)=>a+(g.items||[]).length,(window.KB_UNIT||[])), l:"公式与单位", mod:"formula"},
    {n:Object.keys(window.KB_DOMAIN_GUIDE||{}).length, l:"领域导读", mod:"kb"},
    {n:(window.KB_TEMPLATE||[]).length, l:"实战模板", mod:"tpl"},
    {n:favCount(), l:"我的收藏", mod:"fav"}
  ];
  document.getElementById("panelOverview").innerHTML = `
    <h3><svg class=ic aria-hidden=true><use href=#i-box /></svg>内容总览</h3>
    <div class="pdesc">点任意数字直接进入对应模块</div>
    <div class="stat-grid">${OVERVIEW.map(o=>`
      <div class="stat-item" data-mod="${o.mod}" ${o.f?`data-field="${o.f}"`:""}>
        <b>${o.n}</b><span>${o.l}</span></div>`).join("")}</div>`;
  document.getElementById("panelOverview").querySelectorAll(".stat-item").forEach(el=>{
    el.onclick = ()=>{
      activeModule = el.dataset.mod;
      if(el.dataset.field) activeField = el.dataset.field;
      if(activeModule === "kb"){ browseAll=false; activeDomain=null; }
      renderAll();
      window.scrollTo({top:0, behavior:"smooth"});
    };
  });

  domainsEl.innerHTML = KB_DOMAINS.map(d=>{
    const items = domainItems(d);
    const n1 = items.filter(it=>it.lv===1).length, n2 = items.filter(it=>it.lv===2).length, n3 = items.filter(it=>it.lv===3).length;
    const col = dc(d.id);
    return `
    <div class="d-card" data-id="${esc(d.id)}" style="--dc:${col.c};--dcs:${col.s};--dcw:${col.w}">
      <div class="d-top">
        <div class="d-ic">${d.icon}</div>
        <div>
          <div class="d-nm">${esc(d.name)}</div>
          <div class="d-ct">${items.length} 个知识点 · ${d.subs.length} 个子类</div>
        </div>
      </div>
      <div class="d-tag">${esc(d.tagline)}</div>
      <div class="d-marks">
        <span class="d-mk mk1">核心 ${n1}</span>
        <span class="d-mk mk2">进阶 ${n2}</span>
        <span class="d-mk mk3">了解 ${n3}</span>
      </div>
      <div class="d-bar-txt"><span>点击进入领域详情</span><span>${esc(d.name)} →</span></div>
    </div>`;
  }).join("");
  domainsEl.querySelectorAll(".d-card").forEach(c=>{
    c.onclick = ()=>{ activeDomain = c.dataset.id; activeSub = "all"; browseAll = false; openDomain(); };
  });
  renderProcCards();
  renderRecent();
  renderChangelog();
  renderHomeQuick();
}

/* 首页「按工艺查阅」卡片：点击进入工艺页（inj 卡同时承载知识领域入口提示） */
function renderProcCards(){
  const host = document.getElementById("procCards");
  if(!host) return;
  host.innerHTML = (window.KB_PROC || []).map(p=>{
    const n = procItems(p.id).length;
    const col = dc(PROC_DC[p.id] || "design");
    /* 这里原先还有一个环形图和一条进度条，两者都取自 min(100, 条数) ——
       把「条数」直接当百分比用，既没有分母、超过 100 条还会饱和，
       同一张卡上等于把条数重复画了三遍，所以去掉（条数仍显示在标题下）。 */
    return `
    <div class="d-card" data-procgo="${p.id}" style="--dc:${col.c};--dcs:${col.s};--dcw:${col.w}">
      <div class="d-top">
        <div class="d-ic">${p.icon}</div>
        <div>
          <div class="d-nm">${esc(p.name)}</div>
          <div class="d-ct">${esc(p.short)} · ${n} 条</div>
        </div>
      </div>
      <div class="d-tag">${esc(p.desc).slice(0, 64)}…</div>
      <div class="d-marks">
        <span class="d-mk mk1">五维组织</span><span class="d-mk mk2">可检索</span><span class="d-mk mk3">可对比</span>
      </div>
      <div class="d-bar-txt"><span>${esc(p.scenes)}</span><span>进入工艺页 →</span></div>
    </div>`;
  }).join("");
  host.querySelectorAll(".d-card").forEach(c=>{
    c.onclick = ()=>{ activeModule = "kb"; setProc(c.dataset.procgo); };
  });
}

/* ══════════════ 首页：更新日志（可折叠，默认收起） ══════════════ */
let chlogOpen = false;          // 默认收起，展开状态会保留
function renderChangelog(){
  const box = document.getElementById("panelChangelog"); if(!box) return;
  const all = window.KB_CHANGELOG || [];
  if(!all.length){ box.innerHTML = ""; return; }
  const LIMIT = 3;                       // 展开后只展示最近 3 条
  const list = all.slice(0, LIMIT);
  const rest = all.length - list.length;
  const latest = all[0];
  box.classList.toggle("open", chlogOpen);
  box.innerHTML = `
    <div class="clog-bar" id="clogBar">
      <span class="clog-t"><svg class=ic aria-hidden=true><use href=#i-refresh /></svg>最近更新</span>
      <span class="clog-h"><b>${esc(latest.d)}</b> ${esc(latest.t)}</span>
      <span class="clog-cnt">共 ${all.length} 条</span>
      <span class="clog-tg" id="clogToggle">${chlogOpen ? "收起 ▲" : "展开 ▼"}</span>
    </div>
    <div class="clog-body" id="clogBody">
      <div class="chlog">${list.map(l=>`
        <div class="cl-item">
          <div class="cl-head"><b>${esc(l.d)}</b><span>${esc(l.t)}</span></div>
          <ul>${(l.items || []).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
        </div>`).join("")}</div>
      ${rest > 0 ? `<div class="clog-more">另有 ${rest} 条更早记录</div>` : ""}
    </div>`;
  const bar = document.getElementById("clogBar");
  if(bar) bar.onclick = ()=>{
    chlogOpen = !chlogOpen;
    box.classList.toggle("open", chlogOpen);
    const tg = document.getElementById("clogToggle");
    if(tg) tg.textContent = chlogOpen ? "收起 ▲" : "展开 ▼";
  };
}

// 领域详情
/* ══════════════ 领域导读卡 ══════════════ */
let guideOpen = true;
function renderDomainGuide(d){
  const el = document.getElementById("domGuide");
  const g = (window.KB_DOMAIN_GUIDE || {})[d.id];
  if(!g){ el.innerHTML = ""; return; }
  const mapHtml = (g.map||[]).map(gr=>`
    <div class="dg-map-g">
      <div class="dg-map-t">${esc(gr.g)}</div>
      <div class="dg-map-i">${(gr.items||[]).map(n=>`<button class="rel-chip sm" data-rel="${esc(n)}">${esc(n)}</button>`).join("")}</div>
    </div>`).join("");
  el.innerHTML = `
    <div class="dg-box${guideOpen?" open":""}" id="dgBox">
      <div class="dg-bar" id="dgBar">
        <span class="dg-bar-t"><svg class=ic aria-hidden=true><use href=#i-book-open /></svg>领域导读</span>
        <span class="dg-bar-h">${esc(g.pos)}</span>
        <span class="dg-toggle" id="dgToggle">${guideOpen?"收起 ▲":"展开 ▼"}</span>
      </div>
      <div class="dg-body" id="dgBody">
        <div class="dg-sec">
          <div class="dg-h"><svg class=ic aria-hidden=true><use href=#i-target /></svg>这个领域解决什么问题</div>
          <div class="dg-p">${esc(g.pos)}</div>
          <div class="dg-p sub">${esc(g.why)}</div>
        </div>
        <div class="dg-sec">
          <div class="dg-h"><svg class=ic aria-hidden=true><use href=#i-map /></svg>核心概念地图<span class="dg-note">点任意概念直接打开</span></div>
          <div class="dg-map">${mapHtml}</div>
        </div>
        <div class="dg-sec">
          <div class="dg-h"><svg class=ic aria-hidden=true><use href=#i-link /></svg>在整机开发链条中的位置</div>
          <div class="dg-p">${esc(g.link)}</div>
        </div>
        <div class="dg-sec">
          <div class="dg-h"><svg class=ic aria-hidden=true><use href=#i-alert /></svg>常见误区 Top${(g.myth||[]).length}</div>
          <ul class="dg-myth">${(g.myth||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
        </div>
        <div class="dg-tip">💡 <b>学习建议：</b>${esc(g.tips)}</div>
      </div>
    </div>`;
  document.getElementById("dgToggle").onclick = ()=>{
    guideOpen = !guideOpen;
    document.getElementById("dgBox").classList.toggle("open", guideOpen);
    document.getElementById("dgToggle").textContent = guideOpen ? "收起 ▲" : "展开 ▼";
  };
  document.getElementById("dgBar").onclick = (e)=>{ if(e.target.id!=="dgToggle") document.getElementById("dgToggle").click(); };
}

function openDomain(){
  const d = KB_DOMAINS.find(x=>x.id===activeDomain);
  const col = dc(d.id);
  const root = domainView.style;
  domainView.style.setProperty("--dc", col.c);
  domainView.style.setProperty("--dcs", col.s);
  domainView.style.setProperty("--dcw", col.w);
  domainHeadEl.innerHTML = `
    <div class="ic">${d.icon}</div>
    <div>
      <h2>${esc(d.name)} <span class="cnt">${domainItems(d).length} 条</span></h2>
      <div class="tg">${esc(d.tagline)} · ${d.subs.length} 个子类</div>
    </div>`;
  abListEl.innerHTML = d.abilities.map(a=>`<li>${esc(a)}</li>`).join("");
  renderDomainGuide(d);
  buildChips(d);
  renderDomain();
  lvFilter.style.display=""; backBtn.style.display="";
  homeView.style.display="none"; domainView.style.display=""; searchView.style.display="none";
}
function buildChips(d){
  const items = domainItems(d);
  const subs = [{id:"all", name:`全部 ${items.length}`}].concat(
    d.subs.map(s=>({id:s, name:`${CAT_NAME[s]} ${items.filter(it=>it.cat===s).length}`}))
  );
  chipsEl.innerHTML = subs.map(s=>`<span class="chip${s.id===activeSub?" active":""}" data-id="${esc(s.id)}">${esc(s.name)}</span>`).join("");
  chipsEl.querySelectorAll(".chip").forEach(ch=>{
    ch.onclick = ()=>{ activeSub = ch.dataset.id; buildChips(d); renderDomain(); };
  });
}
/* 从深度解析里抽一句「一句话结论」，显示在知识点列表行里 */
function deepLead(name){
  const d = (window.KB_DEEP || {})[name];
  if(!d) return "";
  const src = (Array.isArray(d.p) && d.p.length) ? String(d.p[0]) : "";
  if(!src) return "";
  /* 取到第一个句末标点为止；过长再截 */
  const m = src.match(/^[\s\S]{6,90}?[。；;]/);
  let t = m ? m[0] : src;
  if(t.length > 78) t = t.slice(0, 78).replace(/[，,、]$/, "") + "…";
  return t;
}
function rowHTML(it, i, q, catLabel, catStyle){
  const rc = refCount(it.name);
  const imgCell = (it.img
    ? `<button class="img-btn" data-img="${esc(it.img)}" data-name="${esc(it.name)}"><img src="${esc(thumbOf(it.img))}" alt="" loading="lazy" decoding="async" width="36" height="36"></button>`
    : `<button class="img-btn none" data-name="${esc(it.name)}">＋ 配图</button>`) + (rc ? `<span class="ref-mini" title="另有 ${rc} 张参考图，点开行查看">＋${rc}</span>` : "");
  const videos = it.videos || [];
  const vidCell = videos.slice(0,2).map(v=>{
    const c = (v.p === "YouTube") ? "yt" : "";
    return `<span class="vid-mini ${c}"><i>${v.p.replace("B站","B站").slice(0,1)}</i>${videos.length>2? videos.length : (v.p === 'B站' ? 'B站' : 'YT')}</span>`;
  }).join("");
  const vSum = videos.length ? `<span class="vid-mini${videos.some(v=>v.p==='YouTube')?' yt':''}" style="border-radius:9px;">▶ ${videos.length}</span>` : `<span class="img-btn none" style="padding:2px 8px;">＋</span>`;
  return `
  <tr data-name="${esc(it.name)}">
    <td style="color:var(--sub); font-size:12px">${String(i+1).padStart(3,"0")}</td>
    <td><span class="cat-tag"${catStyle}>${catLabel}</span></td>
    <td class="name">${hl(it.name, q)}${doubtOn(it.name) ? `<svg class="ic doubt-ic" aria-hidden=true title="标了疑问"><use href=#i-alert /></svg>` : ""}</td>
    <td><span class="lv lv${it.lv}">${LV_TXT[it.lv]}</span></td>
    <td>${imgCell}</td>
    <td>${vSum}</td>
        <td>${hl(it.points, q)}${(()=>{ const L = deepLead(it.name); return L ? `<div class=td-lead><svg class=ic aria-hidden=true><use href=#i-compass /></svg><span>${hl(L, q)}</span></div>` : ""; })()}</td>
    <td>${hl(usageOf(it), q)}</td>
  </tr>`;
}
function renderDomain(){
  const d = KB_DOMAINS.find(x=>x.id===activeDomain);
  resetTableScroll();
  const col = dc(d.id);
  const q = kw.value.trim();
  const lv = lvFilter.value;
  let list = domainItems(d).filter(it=>{
    if(activeSub!=="all" && it.cat!==activeSub) return false;
    if(lv && String(it.lv)!==lv) return false;
    if(q){
      const hay = (it.name+it.points+usageOf(it)+CAT_NAME[it.cat]).toLowerCase();
      if(!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  list = sortByLv(list);
  const lv1=list.filter(x=>x.lv===1).length, lv2=list.filter(x=>x.lv===2).length, lv3=list.filter(x=>x.lv===3).length;
  statsEl.innerHTML =
    `共 <b>${list.length}</b> 条 &nbsp;|&nbsp;` +
    `<span class="lv lv1 pill">核心 ${lv1}</span><span class="lv lv2 pill">进阶 ${lv2}</span><span class="lv lv3 pill">了解 ${lv3}</span>`;
  if(!list.length){ tbody.innerHTML=""; emptyEl.style.display="block"; return; }
  emptyEl.style.display="none";
  currentList = list.map(x=>x.name);
  tbody.innerHTML = list.map((it,i)=>{
    const cs = `style="--tcw:${col.w};--tcs:${col.s}"`;
    return rowHTML(it, i, q, CAT_NAME[it.cat], cs);
  }).join("");
}

// 全局浏览 / 搜索
const HOT_KW = ["脱模斜度","卡扣设计","公差与配合","散热设计","安规认证","成本估算","表面处理","光学设计"];
function noHitHTML(q){
  const s = String(q || "").trim();
  if(!s) return "当前筛选条件下没有知识点，换个条件试试～";
  const head = s.slice(0, 2);
  const cands = [];
  const push = n => { if(n && cands.length < 8 && cands.indexOf(n) < 0) cands.push(n); };
  KB_ITEMS.forEach(it=>{
    if(cands.length >= 8) return;
    if(it.name.includes(head) || (it.points||"").includes(head) || usageOf(it).includes(head)) push(it.name);
  });
  if(cands.length < 3){
    const c0 = s[0];
    KB_ITEMS.forEach(it=>{ if(cands.length < 8 && it.name.includes(c0)) push(it.name); });
  }
  const chips = cands.length ? cands : HOT_KW;
  return `<div class="se-tip"><b>没有找到与「${esc(s)}」匹配的知识点</b><br>${
    cands.length ? "试试这些相近的条目：" : "换个说法试试，或者点下面的常用关键词："}</div>
    <div class="se-chips">${chips.map(c => `<button class="se-chip" data-sekw="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
}

function renderSearch(){
  resetTableScroll();
  const q = kw.value.trim();
  const terms = synExpand(q);
  const hitQ = makeHit(terms);
  const lv = lvFilter.value;
  let list = KB_ITEMS.filter(it=>{
    if(lv && String(it.lv)!==lv) return false;
    if(q){
      const hay = (it.name+it.points+usageOf(it)+CAT_NAME[it.cat]).toLowerCase();
      if(!hitQ(hay)) return false;
    }
    return true;
  });
  list = sortByLv(list);
  const extra = q && terms.length > 1 ? `　·　已自动扩展同义词 <b>${terms.length-1}</b> 个（${esc(terms.slice(1, 6).join("、"))}${terms.length > 6 ? "…" : ""}）` : "";
  searchStatsEl.innerHTML = q
    ? `全局搜索「${esc(q)}」：共 <b>${list.length}</b> 条${extra}`
    : `${browseAll && lvFilter.value==="1" ? "<svg class=ic aria-hidden=true><use href=#i-flame /></svg>核心必会总览" : "<svg class=ic aria-hidden=true><use href=#i-book /></svg>全部知识点"}：共 <b>${list.length}</b> 条（按优先级排序）`;
  /* 无结果时连表头一起收起 —— 否则会留一个空表格（序号/领域/优先级…）在那儿发愣 */
  const searchCard = document.getElementById("searchCard");
  if(!list.length){
    searchTbody.innerHTML="";
    if(searchCard) searchCard.style.display = "none";
    searchEmptyEl.style.display="block"; searchEmptyEl.innerHTML = noHitHTML(q);
  }
  else {
    if(searchCard) searchCard.style.display = "";
    searchEmptyEl.style.display="none";
    currentList = list.map(x=>x.name);
    searchTbody.innerHTML = list.map((it,i)=>{
      const d = CAT_DOMAIN[it.cat], col = dc(d.id);
      const pr = itemProcOf(it);
      const tag = pr !== "inj" ? `<b style="color:${dc(PROC_DC[pr]||"design").c}; font-weight:700;">[${PROC_SHORT[pr]||pr}]</b> ` : "";
      return rowHTML(it, i, terms.length > 1 ? terms : q, `${tag}${d.icon} ${d.name}`, `style="--tcw:${col.w};--tcs:${col.s}"`);
    }).join("");
  }
  renderGlobalSearch(q);
}

// ── 全站搜索：把术语 / 标准 / 排查 / 面试 / 速查 / 题库 一起搜出来 ──
function renderGlobalSearch(q){
  const box = document.getElementById("gsGroups");
  if(!q){ box.innerHTML = ""; return; }
  const terms = synExpand(q);
  const hit = makeHit(terms);
  const groups = [];

  // 术语词典
  const gloss = KB_GLOSS.filter(g=>hit(g.en)||hit(g.cn)||hit(g.d)||hit(g.c));
  if(gloss.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-book-open /></svg>", name:"术语词典", n:gloss.length, jump:"gloss",
    items: gloss.map(g=>({t:g.en, d:`<b>${esc(g.cn)}</b> — ${esc(g.d)}`}))});

  // 标准清单
  const std = [];
  KB_STD.forEach(g=>g.items.forEach(x=>{ if(hit(x.code)||hit(x.name)||hit(x.note)) std.push({t:x.code, d:`${esc(x.name)} — ${esc(x.note)}`}); }));
  if(std.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-clipboard /></svg>", name:"标准清单", n:std.length, jump:"field", f:"std", items: std});

  // 缺陷排查
  const tr = [];
  KB_TROUBLE.forEach(g=>g.items.forEach(x=>{
    if(hit(x.s)||hit(x.c.join(" "))||hit(x.f.join(" "))||hit(x.v))
      tr.push({t:x.s, d:`原因：${x.c.slice(0,2).map(esc).join("；")}　对策：${esc(x.f[0])}`});
  }));
  if(tr.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-search /></svg>", name:"缺陷排查", n:tr.length, jump:"field", f:"trouble", items: tr});

  // 面试题
  const iv = [];
  KB_INTERVIEW.forEach(g=>g.items.forEach(x=>{
    if(hit(x.q)||hit(x.a.join(" "))) iv.push({t:x.q, d:`${esc(x.cat)} · ${esc(x.tag)}　${esc(x.a[0])}`});
  }));
  if(iv.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-briefcase /></svg>", name:"面试题库", n:iv.length, jump:"field", f:"interview", items: iv});

  // 速查手册
  const qk = [];
  KB_QUICK.forEach(t=>t.rows.forEach(r=>{
    if(hit(r.join(" "))) qk.push({t:t.name, d:r.slice(0,3).map(esc).join("　|　")});
  }));
  if(qk.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-table /></svg>", name:"速查手册", n:qk.length, jump:"quick", items: qk.slice(0,8)});

  // 整机案例
  const cs = [];
  KB_CASES.forEach(c=>{
    const hay = [c.name,c.tagline,c.issues.map(x=>x.t+x.d).join(" "),c.composition.map(x=>x.part+x.material+x.note).join(" ")].join(" ");
    if(hit(hay)) cs.push({t:c.name, d:esc(c.tagline)});
  });
  if(cs.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-puzzle /></svg>", name:"整机案例", n:cs.length, jump:"case", items: cs});

  // 一句话记忆
  const mm = [];
  Object.entries(window.KB_MEMO||{}).forEach(([k,v])=>{
    if(hit(k)||hit(v)) mm.push({t:k, d:`<b>${esc(v)}</b>`, openName:k});
  });
  if(mm.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-pin /></svg>", name:"一句话记忆", n:mm.length, jump:"kb", items: mm.slice(0,8)});

  // 设计避坑
  const mk = [];
  (window.KB_MISTAKE||[]).forEach(g=>g.items.forEach(x=>{
    if(hit(x.t)||hit(x.bad)||hit(x.cost)||hit(x.good)||hit(x.how))
      mk.push({t:x.t, d:`<b>✗</b> ${esc(x.bad)}　<b>✓</b> ${esc(x.good)}`});
  }));
  if(mk.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-alert /></svg>", name:"设计避坑", n:mk.length, jump:"field", f:"mistake", items: mk});

  // 选型决策
  const sl = [];
  (window.KB_SELECT||[]).forEach(t=>{
    if(hit(t.name)||hit(t.desc)) sl.push({t:t.name, d:esc(t.desc), jumpSel:t.id});
    Object.values(t.nodes||{}).forEach(nd=>{
      if(nd.r && (hit(nd.r.title)||hit((nd.r.why||[]).join(" "))||hit((nd.r.avoid||[]).join(" "))||hit(nd.r.note)))
        sl.push({t:nd.r.title, d:`选型结论 · ${esc(t.name)}　${esc(nd.r.note)}`, jumpSel:t.id});
      else if(nd.q && hit(nd.q)) sl.push({t:nd.q, d:`决策问题 · ${esc(t.name)}`, jumpSel:t.id});
    });
  });
  if(sl.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-sliders /></svg>", name:"选型决策", n:sl.length, jump:"select", items: sl.slice(0,8)});

  // 公式与单位
  const fg = [];
  (window.KB_FORMULA||[]).forEach(g=>(g.items||[]).forEach(x=>{
    if(hit(x.name)||hit(x.expr)||hit(x.unit)||hit(x.when)||hit(x.eg)||hit((x.vars||[]).map(v=>v.s+" "+v.d).join(" ")))
      fg.push({t:x.name, d:`<code>${esc(x.expr)}</code>　${esc(x.when).slice(0,70)}`, jumpFm:g.cat});
  }));
  (window.KB_UNIT||[]).forEach(g=>(g.items||[]).forEach(x=>{
    if(hit(x.a)||hit(x.b)||hit(x.note)) fg.push({t:x.a, d:`= ${esc(x.b)}　${esc(x.note||"")}`, jumpFm:"__unit"});
  }));
  if(fg.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-ruler /></svg>", name:"公式与单位", n:fg.length, jump:"formula", items: fg.slice(0,8)});

  // 领域导读
  const dg = [];
  Object.entries(window.KB_DOMAIN_GUIDE||{}).forEach(([id,g])=>{
    const d = KB_DOMAINS.find(x=>x.id===id); if(!d) return;
    if(hit(d.name)||hit(g.pos)||hit(g.why)||hit((g.myth||[]).join(" "))||hit(g.tips)){
      const m = (g.myth||[]).find(x=>hit(x));
      dg.push({t:`${d.name} · 领域导读`, d:m?`常见误区：${esc(m)}`:esc(g.pos), jumpDom:id});
    }
  });
  if(dg.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-book-open /></svg>", name:"领域导读", n:dg.length, jump:"kb", items: dg});

  // 检查清单（开模前评审 / 试模 / 量产转产… 共 114 项）
  const ck = [];
  (window.KB_CHECKS||[]).forEach(c=>(c.groups||[]).forEach(g=>(g.items||[]).forEach(x=>{
    if(hit(x.t)||hit(x.d)) ck.push({t:x.t, d:`<b>${esc(c.name)}</b> · ${esc(g.t)}　${esc(x.d)}`, jumpChk:c.id});
  })));
  if(ck.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-check-square /></svg>", name:"检查清单", n:ck.length, jump:"check", items: ck.slice(0,8)});

  // 实战模板（NPI 流程 / DFM 检讨表… 含表单字段）
  const tp = [];
  (window.KB_TEMPLATE||[]).forEach(t=>{
    if(hit(t.name)||hit(t.desc)||hit(t.note)) tp.push({t:t.name, d:`<b>${esc(t.name)}</b>　${esc(t.desc)}`, jumpTpl:t.id});
    (t.blocks||[]).forEach(b=>(b.fields||[]).forEach(f=>{
      if(hit(f.l)||hit(f.ph)) tp.push({t:f.l, d:`<b>${esc(t.name)}</b> · 表单字段　${esc(f.ph)}`, jumpTpl:t.id});
    }));
  });
  if(tp.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-file-text /></svg>", name:"实战模板", n:tp.length, jump:"tpl", items: tp.slice(0,8)});

  // 原理问答（原题库内容，现为阅读型知识；命中题干/答案/解析/干扰辨析任一即算）
  const qa = [];
  qaMeta().forEach(m=>{
    qaQuestions(m.id).forEach(q=>{
      if(!(hit(q.q) || hit(q.opts[q.a]) || hit(q.exp) || hit((q.w||[]).join(" ")))) return;
      qa.push({t:q.q, d:`<b>${esc(m.name)}</b> · 答案 ${esc(q.opts[q.a])}　${esc((q.exp||"").slice(0,70))}`, pid:qaId(m.id, q.q)});
    });
  });
  if(qa.length) groups.push({icon:"<svg class=ic aria-hidden=true><use href=#i-compass /></svg>", name:"原理问答", n:qa.length, jump:"qa", items: qa.slice(0,8)});

  if(!groups.length){ box.innerHTML = ""; return; }
  const LIMIT = 6;
  const attr = (g,x)=>`data-jump="${g.jump}" ${g.f?`data-field="${g.f}"`:""}` +
    (x && x.pid?` data-quiz="${x.pid}"`:"") +
    (x && x.jumpSel?` data-sel="${x.jumpSel}"`:"") +
    (x && x.jumpFm?` data-fm="${esc(x.jumpFm)}"`:"") +
    (x && x.openName?` data-open="${esc(x.openName)}"`:"") +
    (x && x.jumpDom?` data-dom="${x.jumpDom}"`:"") +
    (x && x.jumpChk?` data-chk="${esc(x.jumpChk)}"`:"") +
    (x && x.jumpTpl?` data-tpl="${esc(x.jumpTpl)}"`:"");
  box.innerHTML = groups.map(g=>`
    <div class="gs-group">
      <div class="gs-head" ${attr(g)}>
        <h4>${g.icon} ${esc(g.name)}</h4><span class="gsc">${g.n} 条命中</span>
        <span class="gsj">进入模块查看全部 →</span>
      </div>
      <div class="gs-body">
        ${g.items.slice(0,LIMIT).map(x=>`<div class="gs-item" ${attr(g,x)}>
          <div class="gs-t">${hlm(String(x.t).slice(0,30), terms)}</div><div class="gs-d">${markInHTML(String(x.d).slice(0,110), terms)}</div></div>`).join("")}
        ${g.n>LIMIT?`<div class="gs-more">还有 ${g.n-LIMIT} 条，点上方标题进入模块查看全部</div>`:""}
      </div>
    </div>`).join("");
}

/* ══════════════ 模块一：速查手册 ══════════════ */
function renderQuick(){
  const q = (document.getElementById("qvSearch").value||"").trim().toLowerCase();
  document.getElementById("qvTabs").innerHTML = KB_QUICK.map(t=>
    `<button class="qv-tab${t.id===activeQuick?" active":""}" data-qv="${t.id}">${t.icon} ${esc(t.name)}</button>`).join("");
  const t = KB_QUICK.find(x=>x.id===activeQuick) || KB_QUICK[0];
  const EXTRA = (window.KB_QUICK_ADD||{})[t.id] || [];
  const totalN = t.rows.length + EXTRA.length;
  let rows = t.rows.map(r=>({r, add:false})).concat(EXTRA.map(r=>({r, add:true})));
  if(q) rows = rows.filter(x=> x.r.join(" ").replace(/&[a-z]+;/g,"").toLowerCase().includes(q));
  const table = rows.length ? `
    <div class="tbl-hint"><svg class=ic aria-hidden=true><use href=#i-target /></svg>窄屏可左右滑动看全部 ${t.cols.length} 列，首列会固定</div>
    <div class="table-card"><div class="tbl-scroll">
      <table class="mini">
        <thead><tr>${t.cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(x=>`<tr class="${x.add?"add":""}">${x.r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div></div>` : `<div class="card"><div class="empty">没有匹配的数据行，换个关键词试试～</div></div>`;
  document.getElementById("qvBody").innerHTML = `
    <div class="card">
      <h3>${t.icon} ${esc(t.name)}</h3>
      <div class="qv-desc">${esc(t.desc)} · 共 ${totalN} 行${EXTRA.length?`（其中本轮补充 ${EXTRA.length} 行，表中以浅底标出）`:""}${q?` · 筛出 ${rows.length} 行`:""}</div>
    </div>
    ${table}
    ${t.note?`<div class="qv-note">⚠️ ${esc(t.note)}</div>`:""}`;
}

/* ══════════════ 模块二：检查清单 ══════════════ */
const CHK_KEY = "kb-check-v2";
let chkState = {};
try{ chkState = JSON.parse(localStorage.getItem(CHK_KEY) || "{}"); }catch(e){ chkState = {}; }
function chkOn(id,g,i){ return !!chkState[id+"|"+g+"|"+i]; }
function chkSet(id,g,i,v){
  const k = id+"|"+g+"|"+i;
  if(v) chkState[k]=1; else delete chkState[k];
  try{ localStorage.setItem(CHK_KEY, JSON.stringify(chkState)); }catch(e){}
}
function chkCount(cl){
  let total=0, on=0;
  cl.groups.forEach((g,gi)=>g.items.forEach((it,ii)=>{ total++; if(chkOn(cl.id,gi,ii)) on++; }));
  return {total, on};
}
function renderChecks(){
  document.getElementById("chkSum").innerHTML = KB_CHECKS.map(c=>{
    const {total,on} = chkCount(c);
    const pct = total? Math.round(on/total*100):0;
    return `<div class="cs${c.id===activeChk?" on":""}" data-chk="${c.id}">
      <b>${c.icon} ${esc(c.name)}</b>
      <div class="csp"><span>已勾选 ${on} / ${total}</span><span>${pct}%</span></div>
      <div class="chk-bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join("");
  const c = KB_CHECKS.find(x=>x.id===activeChk) || KB_CHECKS[0];
  const {total,on} = chkCount(c);
  document.getElementById("chkBody").innerHTML = `
    <div class="chk-card">
      <div class="chk-head">
        <div>
          <h3>${c.icon} ${esc(c.name)}</h3>
          <div class="cd">${esc(c.desc)}</div>
        </div>
        <div style="margin-left:auto; font-size:12px; color:var(--sub);">
          已勾选 <b style="color:#059669; font-size:15px;">${on}</b> / ${total} 项
        </div>
      </div>
      ${c.groups.map((g,gi)=>`
        <div class="chk-grp">
          <h4>${esc(g.t)}</h4>
          ${g.items.map((it,ii)=>{
            const onx = chkOn(c.id,gi,ii);
            return `<div class="chk-item${onx?" on":""}" data-ck="${esc(c.id)}|${gi}|${ii}">
              <div class="bx">✓</div>
              <div><div class="ct">${esc(it.t)}</div><div class="cd2">${esc(it.d)}</div></div>
            </div>`;
          }).join("")}
        </div>`).join("")}
      <div style="height:18px"></div>
    </div>`;
}

/* ══════════════ 模块三：整机案例 ══════════════ */
function renderCases(){
  document.getElementById("caseTabs").innerHTML = KB_CASES.map(c=>
    `<button class="qv-tab${c.id===activeCase?" active":""}" data-case="${c.id}">${c.icon} ${esc(c.name)}</button>`).join("");
  const c = KB_CASES.find(x=>x.id===activeCase) || KB_CASES[0];
  document.getElementById("caseBody").innerHTML = `
    <div class="case-hero">
      <h2>${c.icon} ${esc(c.name)}</h2>
      <p>${esc(c.tagline)}</p>
      <div class="case-meta">${c.meta.map(m=>`<div class="cm"><b>${esc(m.k)}</b><span>${esc(m.v)}</span></div>`).join("")}</div>
    </div>
    <div class="card">
      <h3><svg class=ic aria-hidden=true><use href=#i-layers /></svg>结构构成与选材</h3>
      <div class="tbl-scroll"><table class="mini">
        <thead><tr><th style="width:150px">部件</th><th style="width:190px">材料</th><th style="width:130px">工艺</th><th>设计要点</th></tr></thead>
        <tbody>${c.composition.map(x=>`<tr><td>${esc(x.part)}</td><td>${esc(x.material)}</td><td>${esc(x.process)}</td><td>${esc(x.note)}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h3><svg class=ic aria-hidden=true><use href=#i-ruler /></svg>关键设计参数</h3>
      ${c.specs.map(s=>`<div class="spec-grp"><h5>${esc(s.t)}</h5><ul>${s.items.map(i=>`<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}
    </div>
    <div class="card">
      <h3><svg class=ic aria-hidden=true><use href=#i-calculator /></svg>开发流程与工艺路线</h3>
      ${c.steps.map((s,i)=>`<div class="step"><div class="sn">${i+1}</div><div class="st2"><b>${esc(s.t)}</b> — ${esc(s.d)}</div></div>`).join("")}
    </div>
    <div class="card">
      <h3><svg class=ic aria-hidden=true><use href=#i-alert /></svg>常见问题与对策</h3>
      ${c.issues.map(s=>`<div class="iss"><div class="iq">${esc(s.t)}</div><div class="ia">${esc(s.d)}</div></div>`).join("")}
    </div>
    ${((window.KB_CASE_DFM||{})[c.id]||[]).length?`<div class="card">
      <h3><svg class=ic aria-hidden=true><use href=#i-search /></svg>DFM 检讨记录</h3>
      <div class="qv-desc">开模前评审与试模检讨的真实过程：模具厂/工艺提出的问题 → 怎么处理 → 结果是什么</div>
      ${((window.KB_CASE_DFM||{})[c.id]||[]).map((x,i)=>`<div class="dfm-item">
        <div class="dfm-q"><span class="dfm-no">Q${i+1}</span><span>${esc(x.q)}</span></div>
        <div class="dfm-row"><span class="dfm-k">改法</span><span class="dfm-v">${esc(x.a)}</span></div>
        <div class="dfm-row res"><span class="dfm-k">结果</span><span class="dfm-v">${esc(x.r)}</span></div>
      </div>`).join("")}
    </div>`:""}
    <div class="card">
      <h3><svg class=ic aria-hidden=true><use href=#i-tag /></svg>成本构成估算</h3>
      <table class="mini">
        <thead><tr><th style="width:260px">成本项</th><th>估算区间</th></tr></thead>
        <tbody>${c.cost.map(x=>`<tr><td>${esc(x.k)}</td><td>${esc(x.v)}</td></tr>`).join("")}</tbody>
      </table>
      <div class="qv-note">${esc(c.costNote)}</div>
    </div>`;
}

/* ══════════════ 模块四：术语词典 ══════════════ */
function renderGloss(){
  const cats = ["全部"].concat([...new Set(KB_GLOSS.map(g=>g.c))]);
  document.getElementById("glChips").innerHTML = cats.map(c=>
    `<button class="qv-tab${c===glCat?" active":""}" data-gl="${esc(c)}">${esc(c)}${c==="全部"?` ${KB_GLOSS.length}`:""}</button>`).join("");
  const q = (document.getElementById("glSearch").value||"").trim().toLowerCase();
  const list = KB_GLOSS.filter(g=>{
    if(glCat!=="全部" && g.c!==glCat) return false;
    if(q && !(g.en+" "+g.cn+" "+g.d+" "+g.c+" "+((window.KB_GLOSS_USE||{})[g.en]||"")).toLowerCase().includes(q)) return false;
    return true;
  });
  document.getElementById("glCount").textContent = KB_GLOSS.length + " 个术语";
  document.getElementById("glBody").innerHTML = list.length ? list.map(g=>{
    const u = (window.KB_GLOSS_USE||{})[g.en];
    return `
    <div class="gl-card">
      <div class="gl-en">${esc(g.en)}<span class="gl-tag">${esc(g.c)}</span></div>
      <div class="gl-cn">${esc(g.cn)}</div>
      <div class="gl-d">${esc(g.d)}</div>
      ${u?`<div class="gl-u"><span class="gl-u-k">实际用法</span>${esc(u)}</div>`:""}
    </div>`;
  }).join("") : `<div class="empty" style="grid-column:1/-1">没有匹配的术语，换个关键词试试～</div>`;
}

/* ══════════════ 模块五：学习路径 ══════════════ */
/* 30 天路径的完成记录：{"周序|天序": 1} */

/* ══════════════ 原理问答：数据读取 ══════════════
 * 内容在 kb-qa-<领域id>.js，每题自包含（q/opts/a/exp/w/lv/t），没有旁表。
 * 领域清单（id/name/icon/顺序）在 kb-qa.js 的 KB_QA_META，随页面立即加载，
 * 所以标签能先渲染出来，再逐步填充题目。字段契约见 kb-qa.js 顶部注释。 */
const QA_LEV = ["基础", "进阶", "易错"];
const QA_TYPE = { choice:"选择题", tf:"判断题", calc:"计算题", scene:"情景题" };
function qaMeta(){ return window.KB_QA_META || []; }
function qaQuestions(id){ return (window.KB_QA || {})[id] || []; }
function qaTypeOf(q){ return q.t || "choice"; }
/* 每题 id 由「领域id + 题干」派生，与位置无关：中间插题、调顺序都不会错位，
   也不会打断已发出的分享链接。qa-check.js 用同一算法做重名检测。 */
function qaId(domainId, q){
  let h = 2166136261;
  const str = domainId + "|" + q;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return domainId + "-" + (h >>> 0).toString(36);
}
/* 题目总数。题目本体是按需加载的（396KB 不进首屏），所以：
   · 题目还没到位 → 用领域清单里的 n 求和，角标在首屏就显示真实数字；
   · 题目到位后 → 按实际题目数算。
   两个数由 content-check.js 保证一致，所以不会出现前后不一致的跳变。 */
function qaTotalCount(){
  const meta = qaMeta();
  const loaded = meta.reduce((a,m)=>a + qaQuestions(m.id).length, 0);
  return loaded || meta.reduce((a,m)=>a + (m.n || 0), 0);
}

/* ══════════ 按需加载：非首屏模块的数据脚本 ══════════
 * 全站 50 个立即加载脚本 + 2 组按需数据，有 520KB 是「首页完全用不到、进对应模块才需要」的：
 *   · 原理问答 12 个文件（396KB）：每领域一个自包含文件，进该模块时一次拉齐
 *   · STEP 成本评估 2 个文件（124KB）：自带几何解析引擎，只在打开该模块时用
 * 它们改为「进模块时兜底等待」，首屏传输随之下降约四分之一。
 *
 * 顺序无关：每个 kb-qa-<id>.js 只写自己的 window.KB_QA[<id>]，互不覆盖，
 * 所以加领域/加文件时可以随便排。async=false 只为让执行顺序可预期。
 * ⚠️ 为什么只拆这两组：其余数据（选型 / 公式 / 模板 / 案例 / 术语…）被首页统计数字与
 *    全站搜索直接读取，拆出去会让首页显示 0、搜索结果缺分组，得不偿失。
 * ════════════════════════════════════════════════════ */
const LAZY_MODS = {
  step: ["data/step.js","kb-step-view.js"],
  qa: ["data/qa-material.js","data/qa-manufacturing.js","data/qa-mold.js","data/qa-design.js",
       "data/qa-drawing.js","data/qa-surface.js","data/qa-optic.js","data/qa-thermal.js",
       "data/qa-safety.js","data/qa-test.js","data/qa-pack.js","data/qa-cost.js"],
};
/* 一个数据集可以被多个模块id共用。kb-qa.js（领域清单）是立即加载的，
   所以「原理问答」能先把 13 个标签画出来，题目数据到位后 renderAll 自动补齐。 */
const MOD_DATA = { qa:"qa", step:"step" };
const _scriptP = {};    // src → Promise（同一文件只加载一次）
const _dataDone = {};   // 数据集 → 是否已就绪

function loadScript(src){
  if(!_scriptP[src]) _scriptP[src] = new Promise(function(res){
    const s = document.createElement("script");
    s.src = src;
    s.async = false;                 // 保序：见文件头说明
    s.onload = function(){ res(true); };
    s.onerror = function(){ res(false); };   // 失败也 resolve，避免界面卡在加载态
    document.head.appendChild(s);
  });
  return _scriptP[src];
}
function dataReady(mod){ const k = MOD_DATA[mod]; return !k || !!_dataDone[k]; }
function ensureData(mod){
  const k = MOD_DATA[mod];
  if(!k || _dataDone[k]) return Promise.resolve(true);
  if(_pending[k]) return _pending[k];
  showLazyNote(true);
  _pending[k] = Promise.all(LAZY_MODS[k].map(loadScript)).then(function(){
    _dataDone[k] = true;
    delete _pending[k];
    showLazyNote(false);
    if(k === "qa") afterQaData();
    return true;
  });
  return _pending[k];
}
const _pending = {};
function showLazyNote(on){
  let el = document.getElementById("lazyNote");
  if(on){
    if(!el){
      el = document.createElement("div");
      el.id = "lazyNote";
      el.className = "lazy-note";
      el.textContent = "正在加载原理问答数据…";
      document.body.appendChild(el);
    }
    el.style.display = "";
  }else if(el){ el.style.display = "none"; }
}
/* 原理问答数据到位后补做依赖它的收尾：角标数字与首页统计 */
function afterQaData(){
  try{ refreshBadges(); }catch(e){}
  try{ initBadges(); }catch(e){}       // 问答总数角标（懒加载到位后校正）
  try{ syncCounts(); }catch(e){}       // 文案里的总数
  try{ renderHome(); }catch(e){}       // 首页「内容总览」
}


/* ══════════════ 模块八：工程计算器 ══════════════ */
function nfmt(n, d){
  if(!isFinite(n)) return "—";
  if(Math.abs(n) >= 10000) return Math.round(n).toLocaleString("zh-CN");
  d = (d === undefined) ? 2 : d;
  let s = n.toFixed(d);
  if(s.indexOf(".") >= 0) s = s.replace(/0+$/,"").replace(/\.$/,"");
  return s;
}
const CALCS = [
{id:"shrink", icon:"<svg class=ic aria-hidden=true><use href=#i-ruler /></svg>", name:"收缩率换算", desc:"由成品尺寸反推模具型腔尺寸，是尺寸不超差的第一步",
 fields:[{k:"dim", l:"成品尺寸 (mm)", v:100}, {k:"sr", l:"材料收缩率 (%)", v:0.6}],
 formula:"模具尺寸 = 成品尺寸 ÷ (1 − 收缩率)　·　非结晶塑料 0.3-0.8%，结晶塑料 1.0-2.5%",
 calc:v=>{ const m = v.dim/(1-v.sr/100); return {
   main:{l:"模具型腔尺寸", val:nfmt(m,3), u:"mm"},
   extra:[{k:"相比成品需做大", v:nfmt(m-v.dim,3)+" mm"}, {k:"放大比例", v:nfmt(v.sr,2)+" %"},
          {k:"提示", v:"精密件需在成型 24h 后复测（后收缩）"}]};}},
{id:"clamp", icon:"<svg class=ic aria-hidden=true><use href=#i-gauge /></svg>", name:"锁模力估算", desc:"选注塑机吨位的快速估算，避免飞边或欠注",
 fields:[{k:"area", l:"制品投影面积 (cm²)", v:100}, {k:"coef", l:"材料系数 (t/cm²)", v:0.4}],
 formula:"锁模力 = 投影面积 × 材料系数　·　系数参考：ABS/PC 0.3-0.4，PP 0.3-0.5，流动性差取上限",
 calc:v=>{ const f = v.area*v.coef; return {
   main:{l:"所需锁模力", val:nfmt(f,1), u:"t"},
   extra:[{k:"建议机型吨位（含 20% 余量）", v:nfmt(f*1.2,0)+" t"},
          {k:"注意", v:"投影面积含流道；深腔件系数取大值"}]};}},
{id:"cavity", icon:"<svg class=ic aria-hidden=true><use href=#i-hash /></svg>", name:"模穴数计算", desc:"按年需求量反推合理模穴数，避免开大模或产能不够",
 fields:[{k:"annual", l:"年需求量 (件)", v:600000}, {k:"days", l:"年工作天数 (天)", v:300}, {k:"daily", l:"单机日产能 (件/天)", v:2000}],
 formula:"模穴数 = 年需求量 ÷ (年工作天数 × 单机日产能)，向上取整",
 calc:v=>{ const need = v.annual/((v.days||1)*(v.daily||1)); const cav = Math.max(1, Math.ceil(need)); return {
   main:{l:"建议模穴数", val:cav, u:"穴"},
   extra:[{k:"理论需求", v:nfmt(need,2)+" 穴"}, {k:"日产能需求", v:nfmt(v.annual/Math.max(v.days,1),0)+" 件/天"},
          {k:"提示", v:"模穴数每翻倍，模具费约增 40-60%，效率增约 80%"}]};}},
{id:"amort", icon:"<svg class=ic aria-hidden=true><use href=#i-coins /></svg>", name:"模具摊销计算", desc:"判断模具成本对单价的影响，决定是否谈阶梯价",
 fields:[{k:"mold", l:"模具总价 (元)", v:60000}, {k:"qty", l:"订单量 (件)", v:100000}],
 formula:"单件摊销 = 模具总价 ÷ 订单量　·　摊销高于料价 20% 就要重新评估模穴数或谈阶梯价",
 calc:v=>{ const per = v.mold/(v.qty||1); return {
   main:{l:"单件模具摊销", val:nfmt(per,3), u:"元/件"},
   extra:[{k:"订单量翻倍后的摊销", v:nfmt(per/2,3)+" 元/件"},
          {k:"订单量减半后的摊销", v:nfmt(per*2,3)+" 元/件"}]};}},
{id:"tj", icon:"<svg class=ic aria-hidden=true><use href=#i-flame /></svg>", name:"LED 结温估算", desc:"判断散热方案是否够用，Tj 越低 LED 寿命越长",
 fields:[{k:"ta", l:"环境温度 Ta (℃)", v:25}, {k:"p", l:"LED 功耗 P (W)", v:3},
         {k:"rjc", l:"结壳热阻 Rθjc (℃/W)", v:5}, {k:"rcs", l:"界面热阻 Rθcs (℃/W)", v:1},
         {k:"rsa", l:"散热器热阻 Rθsa (℃/W)", v:4}],
 formula:"Tj = Ta + P × (Rθjc + Rθcs + Rθsa)　·　目标 Tj < 85℃ 良好，< 105℃ 可用，每升 10℃ 寿命约减半",
 calc:v=>{ const r = v.rjc+v.rcs+v.rsa; const tj = v.ta + v.p*r;
   const judge = tj < 85 ? "✅ 良好" : tj < 105 ? "⚠️ 可用，建议优化" : "❌ 超标，必须加强散热";
   return { main:{l:"估算结温 Tj", val:nfmt(tj,1), u:"℃"},
   extra:[{k:"总热阻 ΣRθ", v:nfmt(r,2)+" ℃/W"}, {k:"按功耗分摊的温升", v:nfmt(v.p*r,1)+" ℃"},
          {k:"判定", v:judge}, {k:"最大热阻环节", v:["结壳","界面","散热器"][[v.rjc,v.rcs,v.rsa].indexOf(Math.max(v.rjc,v.rcs,v.rsa))]}]};}},
{id:"cost", icon:"<svg class=ic aria-hidden=true><use href=#i-tag /></svg>", name:"塑料件成本估算", desc:"料工费 + 良率 + 表面处理，估算单件落地成本",
 fields:[{k:"w", l:"单件重量 (g)", v:50}, {k:"price", l:"料价 (元/kg)", v:18}, {k:"loss", l:"材料损耗 (%)", v:4},
         {k:"rate", l:"机时费 (元/h)", v:60}, {k:"cycle", l:"成型周期 (s)", v:30}, {k:"cav", l:"模穴数", v:2},
         {k:"yield", l:"良率 (%)", v:95}, {k:"extra", l:"表处+包装 (元)", v:1.5}],
 formula:"单件成本 = (材料费 + 加工费) ÷ 良率 + 表面处理与包装费　·　材料费 = 重量 × 单价 ÷ 1000 × (1+损耗)",
 calc:v=>{ const mat = v.w*v.price/1000*(1+v.loss/100);
   const mach = v.rate*v.cycle/3600/Math.max(v.cav,1);
   const total = (mat+mach)/((v.yield||1)/100) + v.extra;
   return { main:{l:"单件估算成本", val:nfmt(total,3), u:"元"},
   extra:[{k:"材料费", v:nfmt(mat,3)+" 元"}, {k:"加工费（按模穴分摊）", v:nfmt(mach,3)+" 元"},
          {k:"良率损失", v:nfmt((mat+mach)*(100/(v.yield||1)-1),3)+" 元"},
          {k:"表处 + 包装", v:nfmt(v.extra,3)+" 元"},
          {k:"材料费占比", v:nfmt(total?mat/total*100:0,1)+" %"}]};}},
{id:"drop", icon:"<svg class=ic aria-hidden=true><use href=#i-box /></svg>", name:"跌落缓冲厚度估算", desc:"由跌落高度与产品脆值估算缓冲材料所需厚度（简化估算）",
 fields:[{k:"h", l:"跌落高度 (mm)", v:1000}, {k:"g", l:"产品脆值 (G)", v:50}, {k:"c", l:"缓冲材料系数 C", v:3}],
 formula:"缓冲厚度 ≈ C × 跌落高度 × 脆值 ÷ 10000　·　C 参考：EPE 珍珠棉 2.5-4，EVA 2-3.5。实际需按材料动态缓冲曲线选型",
 calc:v=>{ const t = v.c*v.h*v.g/10000; return {
   main:{l:"建议缓冲厚度", val:nfmt(t,1), u:"mm"},
   extra:[{k:"脆值参考", v:"电子件 40-60G、结构件 60-100G"},
          {k:"注意", v:"按角跌姿态校核，四角缓冲需加厚"}]};}},
{id:"tol", icon:"<svg class=ic aria-hidden=true><use href=#i-layers /></svg>", name:"公差叠加分析", desc:"对比最坏情况法与统计法，判断装配是否可靠",
 fields:[{k:"t1", l:"公差 1 (±mm)", v:0.1}, {k:"t2", l:"公差 2 (±mm)", v:0.1},
         {k:"t3", l:"公差 3 (±mm)", v:0.15}, {k:"t4", l:"公差 4 (±mm)", v:0.1}, {k:"t5", l:"公差 5 (±mm)", v:0.2}],
 formula:"最坏情况法 WC = Σ公差（保守）；统计法 RSS = √(Σ公差²)（更贴近实际）",
 calc:v=>{ const arr = [v.t1,v.t2,v.t3,v.t4,v.t5];
   const wc = arr.reduce((a,b)=>a+b,0);
   const rss = Math.sqrt(arr.reduce((a,b)=>a+b*b,0));
   return { main:{l:"最坏情况法总公差", val:"±"+nfmt(wc,3), u:"mm"},
   extra:[{k:"统计法（RSS）总公差", v:"±"+nfmt(rss,3)+" mm"},
          {k:"差值", v:nfmt(wc-rss,3)+" mm"},
          {k:"建议预留装配间隙", v:"≥ "+nfmt(wc,3)+" mm（取保守值）"}]};}},
{id:"snap", icon:"<svg class=ic aria-hidden=true><use href=#i-snap /></svg>", name:"卡扣应变校核", desc:"算出卡扣的最大应变，判断会不会装一次就断",
 fields:[{k:"t", l:"卡扣厚度 t (mm)", v:1.5}, {k:"y", l:"扣入量 / 挠度 y (mm)", v:1},
         {k:"L", l:"悬臂有效长度 L (mm)", v:12}, {k:"allow", l:"材料允许应变 (%)", v:1.5}],
 formula:"ε = 1.5 · t · y / L²　·　允许应变参考：ABS 约 1.5%、PC 约 2.0%、PP 约 3.0%、POM 约 2.5%（已含安全系数）",
 calc:v=>{ const eps = 1.5*v.t*v.y/(Math.max(v.L,0.001)*Math.max(v.L,0.001))*100;
   const ratio = v.allow ? eps/v.allow : 0;
   const verdict = !isFinite(eps) ? "参数有误" : ratio<=0.7 ? "✅ 安全（有余量）" : ratio<=1 ? "⚠️ 接近上限，建议留更多余量" : "❌ 超出允许应变，易断裂";
   return { main:{l:"卡扣最大应变 ε", val:nfmt(eps,2), u:"%"},
   extra:[{k:"材料允许应变", v:nfmt(v.allow,2)+" %"},
          {k:"安全裕度（允许/实际）", v:nfmt(ratio?1/ratio:0,2)+" 倍"},
          {k:"判定", v:verdict},
          {k:"调优方向", v:"加长 L 最有效（应变与 L² 成反比），其次减小 y 或 t"}]};}},
{id:"lux", icon:"<svg class=ic aria-hidden=true><use href=#i-bulb /></svg>", name:"照度与光效换算", desc:"由光通量估算照射面平均照度，并核算整灯光效",
 fields:[{k:"flux", l:"总光通量 Φ (lm)", v:800}, {k:"area", l:"照射面积 (m²)", v:6},
         {k:"cu", l:"利用系数 CU (0-1)", v:0.7}, {k:"mf", l:"维护系数 MF (0-1)", v:0.8},
         {k:"pw", l:"输入功率 (W)", v:10}],
 formula:"E = Φ · CU · MF / A　·　光效 η = Φ / P　·　CU 常见 0.5-0.8，MF 常见 0.7-0.9",
 calc:v=>{ const E = v.flux*v.cu*v.mf/Math.max(v.area,0.0001);
   const eff = v.flux/Math.max(v.pw,0.0001);
   const lvl = eff>=120 ? "优秀" : eff>=100 ? "良好" : eff>=80 ? "一般，可优化光学件或驱动" : "偏低，损耗过大";
   return { main:{l:"平均照度 E", val:nfmt(E,1), u:"lx"},
   extra:[{k:"整灯光效 η", v:nfmt(eff,1)+" lm/W（"+lvl+"）"},
          {k:"阅读场景（需 ≥300 lx）", v:E>=300 ? "✅ 达标" : "❌ 不足，需提高光通量或缩小面积"},
          {k:"注意", v:"整灯光效通常比单颗 LED 低 20%-40%，损失在扩散件、透镜与驱动上"}]};}},
{id:"stack", icon:"<svg class=ic aria-hidden=true><use href=#i-stack /></svg>", name:"包装堆码强度", desc:"按堆码层数与仓储条件反推纸箱所需抗压强度",
 fields:[{k:"w", l:"单箱重量 (kg)", v:8}, {k:"n", l:"堆码层数", v:6}, {k:"k", l:"安全系数", v:2}],
 formula:"BCT ≥ (n − 1) × W × K　·　K 取 1.6-3.0（仓储越久、湿度越高取越大；纸箱长期堆码强度会衰减到 50%-60%）",
 calc:v=>{ const need = Math.max(v.n-1,0)*v.w*v.k;
   return { main:{l:"所需纸箱抗压强度 BCT", val:nfmt(need,1), u:"kgf"},
   extra:[{k:"理论承重（不含安全系数）", v:nfmt(Math.max(v.n-1,0)*v.w,1)+" kgf"},
          {k:"折合牛顿", v:nfmt(need*9.807,0)+" N"},
          {k:"堆高参考（单箱按 300mm 估）", v:nfmt((v.n-1)*0.3,1)+" m"},
          {k:"提示", v:"按最底层箱子计算；仓储超过 30 天建议 K 取 2.5 以上"}]};}},
{id:"pilot", icon:"<svg class=ic aria-hidden=true><use href=#i-screw /></svg>", name:"自攻螺丝底孔", desc:"算出底孔、柱外径与柱壁厚，避免滑牙或撑裂",
 fields:[{k:"d", l:"螺丝外径 d (mm)", v:3}, {k:"kf", l:"底孔系数 (0.78-0.82)", v:0.8},
         {k:"len", l:"螺丝旋入长度 (mm)", v:6}],
 formula:"底孔 ≈ d × 0.8　·　柱外径 ≈ d × 2（保证柱壁厚 ≥1.0mm）　·　内孔深 ≥ 旋入长度 + 0.5mm",
 calc:v=>{ const hole = v.d*v.kf, boss = v.d*2, wall = (boss-hole)/2;
   const warn = wall < 1 ? "⚠️ 柱壁厚不足 1.0mm，建议加粗柱外径" : "✅ 柱壁厚充足";
   return { main:{l:"底孔直径", val:nfmt(hole,2), u:"mm"},
   extra:[{k:"建议柱外径", v:nfmt(boss,2)+" mm"},
          {k:"实际柱壁厚", v:nfmt(wall,2)+" mm（"+warn+"）"},
          {k:"建议内孔深度", v:nfmt(v.len+0.5,1)+" mm 以上"},
          {k:"根部", v:"加 R0.25-0.5 圆角或加强筋，抗裂能力明显提升"}]};}},
{id:"cool", icon:"<svg class=ic aria-hidden=true><use href=#i-snow /></svg>", name:"注塑冷却时间", desc:"理论冷却时间估算，判断周期是否还有压缩空间",
 fields:[{k:"T", l:"制品壁厚 T (mm)", v:2}, {k:"a", l:"热扩散系数 α (mm²/s)", v:0.09},
         {k:"tm", l:"熔体温度 (℃)", v:230}, {k:"tw", l:"模具温度 (℃)", v:60}, {k:"te", l:"顶出温度 (℃)", v:90}],
 formula:"t = { T² / (π² · α) } · ln{ (4/π) · (Tm − Tw) / (Te − Tw) }　·　α 参考：ABS 约 0.09、PC 约 0.10、PP 约 0.08 mm²/s",
 calc:v=>{ const ok = (v.te > v.tw) && (v.tm > v.te);
   const base = v.T*v.T/(Math.PI*Math.PI*Math.max(v.a,0.0001));
   const ratio = (4/Math.PI)*(v.tm-v.tw)/Math.max(v.te-v.tw,0.0001);
   const tc = ok ? base*Math.log(ratio) : NaN;
   const ex = [];
   if(!ok){ ex.push({k:"参数不成立", v:"需满足：熔体温度 > 顶出温度 > 模具温度"}); }
   else{
     ex.push({k:"壁厚加倍后", v:nfmt(tc*4,2)+" s（厚度是平方关系）"});
     ex.push({k:"冷却时间占比", v:"实际周期中冷却常占 50%-70%"});
   }
   ex.push({k:"提示", v:"缩短周期的优先手段是减薄壁厚与优化水路，而不是一味降温"});
   return { main:{l:"理论冷却时间", val:nfmt(tc,2), u:"s"}, extra:ex };}}
];
/* ══════════════ 我的常用（首页快捷入口） ══════════════ */
const MOD_LABEL = {
  kb: "知识库", select: "选型决策",
  formula: "公式速查", quick: "速查手册", check: "检查清单", tpl: "实战模板", case: "整机案例",
  gloss: "术语词典", gallery: "参考图库", field: "实战宝典", compare: "知识点对比",
  step: "STEP成本评估", fav: "我的收藏", qa: "原理问答"
};
/* 模块描述。⚠️ 带数字的一律现算（所以这里存的是函数，不是写死的字符串）——
   数量会变，写死必然过期，而且会和导航角标的数字对不上。 */
const reCnt = (arr) => (arr || []).reduce((a, g) => a + ((g && g.items) || []).length, 0);
const MOD_DESC = {
  step: () => "传 STEP，算体积 / 重量 / 模具费 / 单件成本",
  quick: () => `${(window.KB_QUICK||[]).length} 张速查表：塑料 / 公差 / 螺丝 / 安规`,
  check: () => "开模前逐项核对，别漏项",
  formula: () => `${reCnt(window.KB_FORMULA)} 个公式 · ${reCnt(window.KB_UNIT)} 项单位换算`,
  case: () => `${(window.KB_CASES||[]).length} 款整机案例，看别人怎么做`,
  select: () => "选型决策树，纠结时走一遍",
  gallery: () => `${Object.values(window.KB_IMG||{}).reduce((a,v)=>a+v.length,0)} 张实景参考图`,
  field: () => `避坑 ${reCnt(window.KB_MISTAKE)} 例 · 缺陷排查 ${reCnt(window.KB_TROUBLE)} 条 · 面试题 ${reCnt(window.KB_INTERVIEW)} 条 · 标准 ${reCnt(window.KB_STD)} 项`,
  compare: () => "任选两条知识点并排看",
  gloss: () => `${(window.KB_GLOSS||[]).length} 条术语，跟供应商对得上话`,
  tpl: () => `${(window.KB_TEMPLATE||[]).length} 份实战模板，直接改着用`,
  kb: () => "知识点全库",
  fav: () => "收藏与笔记",
  qa: () => "一问一答，讲透原理与常见误区"
};
/* 取模块描述（兼容取不到的情况） */
function modDesc(id){
  const d = MOD_DESC[id];
  if (!d) return "";
  try { return typeof d === "function" ? d() : d; } catch(e){ return ""; }
}
const HQ_DEFAULT = ["step", "quick", "check", "formula"];
let hqEdit = false;

function switchMod(id){
  const b = document.querySelector('.nav-tab[data-mod="' + id + '"]');
  if (b) b.click();
}

function renderHomeQuick(){
  const host = document.getElementById("homeQuick");
  if (!host) return;
  const w = window.KB_WS;
  let list = w ? w.shortList() : [];
  list = list.filter(id => MOD_LABEL[id]);          // 只显示仍存在的模块
  const usingDefault = !list.length;
  if (usingDefault) list = HQ_DEFAULT.slice();

  host.innerHTML =
    '<div class="hq-h"><b>我的常用</b>'
    + '<span>' + (usingDefault ? "先放了几个最常用的，点「编辑」换成你自己的" : "点「编辑」可以增减") + '</span>'
    + '<button class="hq-edit" id="hqEdit">' + (hqEdit ? "完成" : "编辑") + '</button></div>'
    + '<div class="hq-grid">'
    + list.map(id =>
        '<button class="hq-item" data-mod="' + id + '">'
        + '<b>' + esc(MOD_LABEL[id] || id) + '</b>'
        + '<span>' + esc(modDesc(id)) + '</span></button>').join("")
    + '</div>'
    + (hqEdit
      ? '<div class="hq-pick">'
        + Object.keys(MOD_LABEL).map(id =>
            '<label class="hq-pick-i"><input type="checkbox" data-hqp="' + id + '"'
            + (list.indexOf(id) >= 0 ? " checked" : "") + '><span>' + esc(MOD_LABEL[id]) + '</span></label>').join("")
        + '<div class="hq-pick-t">最多钉 8 个；不选就恢复默认</div></div>'
      : "");

  Array.prototype.forEach.call(host.querySelectorAll(".hq-item"), b => {
    b.onclick = () => switchMod(b.dataset.mod);
  });
  const ebtn = document.getElementById("hqEdit");
  if (ebtn) ebtn.onclick = () => { hqEdit = !hqEdit; renderHomeQuick(); };
  Array.prototype.forEach.call(host.querySelectorAll("[data-hqp]"), c => {
    c.onchange = () => {
      if (!w) return;
      let cur = w.shortList();
      if (!cur.length) cur = list.slice();   // 首次钉选：以当前显示的默认集合为起点
      const i = cur.indexOf(c.dataset.hqp);
      if (i >= 0) cur.splice(i, 1); else if (cur.length < 8) cur.push(c.dataset.hqp);
      else { c.checked = false; return; }
      w.shortSet(cur); renderHomeQuick();
    };
  });
}

/* ══════════════ 模块九：实战宝典 ══════════════ */
function renderField(){
  const MIS = window.KB_MISTAKE || [];
  const misN = MIS.reduce((a,x)=>a+x.items.length,0);
  const TABS = [
    {id:"mistake", n:"<svg class=ic aria-hidden=true><use href=#i-alert /></svg>设计避坑", c:misN+" 个"},
    {id:"trouble", n:"<svg class=ic aria-hidden=true><use href=#i-search /></svg>缺陷排查", c:KB_TROUBLE.reduce((a,x)=>a+x.items.length,0)+" 条"},
    {id:"interview", n:"<svg class=ic aria-hidden=true><use href=#i-briefcase /></svg>面试题库", c:KB_INTERVIEW.reduce((a,x)=>a+x.items.length,0)+" 题"},
    {id:"std", n:"<svg class=ic aria-hidden=true><use href=#i-clipboard /></svg>标准清单", c:KB_STD.reduce((a,x)=>a+x.items.length,0)+" 项"}
  ];
  document.getElementById("fieldTabs").innerHTML = TABS.map(t=>
    `<button class="qv-tab${t.id===activeField?" active":""}" data-field="${t.id}">${t.n} <span style="opacity:.65">${t.c}</span></button>`).join("");
  const box = document.getElementById("fieldBody");
  const q = (document.getElementById("fieldSearch").value||"").trim().toLowerCase();
  const hit = s => (s==null?"":String(s)).toLowerCase().includes(q);
  const noHit = `<div class="card"><div class="empty">没有匹配的内容，换个关键词试试～</div></div>`;
  if(activeField === "mistake"){
    const groups = MIS.map(g=>({g, items: g.items.filter(x=>!q || hit(x.t)||hit(x.bad)||hit(x.cost)||hit(x.good)||hit(x.how)||hit((x.ref||[]).join(" ")))}))
                      .filter(x=>x.items.length);
    box.innerHTML = groups.length ? `
      <div class="card">
        <h3><svg class=ic aria-hidden=true><use href=#i-alert /></svg>开模前评审：设计阶段的坑</h3>
        <div class="qv-desc">这里的每一条都是<strong>在设计阶段就能避免</strong>的错误。和「缺陷排查」的区别：排查表对付的是量产后出现的现象，这里防的是还没开模就埋下的隐患。</div>
        <div class="mk-key">
          <span><b class="mk-b">错误做法</b></span>
          <span><b class="mk-c">后果</b></span>
          <span><b class="mk-g">正确做法</b></span>
          <span><b class="mk-h">怎么自查</b></span>
        </div>
      </div>` + groups.map(({g,items})=>`
      <div class="card" data-fgroup="${esc(g.id)}">
        <h3>${g.icon} ${esc(g.name)} <span style="font-size:11px;color:var(--sub);font-weight:normal">${esc(g.desc)}${q?`　·　筛出 ${items.length} 个`:""}</span></h3>
        ${items.map(it=>`
          <div class="mk-item">
            <div class="mk-t">${esc(it.t)}</div>
            <div class="mk-row"><span class="mk-k mk-b">✗ 错误做法</span><div class="mk-v">${esc(it.bad)}</div></div>
            <div class="mk-row"><span class="mk-k mk-c">⚠ 后果</span><div class="mk-v">${esc(it.cost)}</div></div>
            <div class="mk-row"><span class="mk-k mk-g">✓ 正确做法</span><div class="mk-v">${esc(it.good)}</div></div>
            <div class="mk-row"><span class="mk-k mk-h"><svg class=ic aria-hidden=true><use href=#i-search /></svg>怎么自查</span><div class="mk-v">${esc(it.how)}</div></div>
            ${(it.ref||[]).length?`<div class="mk-rel">关联：${it.ref.map(n=>`<button class="rel-chip" data-rel="${esc(n)}">${esc(n)} →</button>`).join("")}</div>`:""}
          </div>`).join("")}
      </div>`).join("") : noHit;
  }else if(activeField === "trouble"){
    const groups = KB_TROUBLE.map(g=>({g, items: g.items.filter(x=>!q || hit(x.s)||hit(x.c.join(" "))||hit(x.f.join(" "))||hit(x.v))}))
                            .filter(x=>x.items.length);
    box.innerHTML = groups.length ? groups.map(({g,items})=>`
      <div class="card" data-fgroup="${esc(g.id)}">
        <h3>${g.icon} ${esc(g.name)}</h3>
        <div class="qv-desc">${esc(g.desc)}${q?`　·　筛出 ${items.length} 条`:""}</div>
        ${items.map(it=>`
          <div class="tr-item">
            <div class="tr-sym"><svg class=ic aria-hidden=true><use href=#i-alert /></svg>${esc(it.s)}</div>
            <div class="tr-bd">
              <div class="tr-row"><div class="trk">可能原因</div><div class="trv">${it.c.map(esc).join("；")}</div></div>
              <div class="tr-row fix"><div class="trk">对策</div><div class="trv">${it.f.map((x,i)=>(i+1)+". "+esc(x)).join("　")}</div></div>
              <div class="tr-row"><div class="trk">怎么验证</div><div class="trv">${esc(it.v)}</div></div>
            </div>
          </div>`).join("")}
      </div>`).join("") : noHit;
  }else if(activeField === "interview"){
    const groups = KB_INTERVIEW.map(g=>({g, items: g.items.filter(x=>!q || hit(x.q)||hit(x.a.join(" "))||hit(x.cat)||hit(x.tag))}))
                              .filter(x=>x.items.length);
    box.innerHTML = groups.length ? groups.map(({g,items})=>`
      <div class="card">
        <h3>${g.icon} ${esc(g.cat)}${q?` <span style="font-size:11px;color:var(--sub);font-weight:normal">筛出 ${items.length} 题</span>`:""}</h3>
        ${items.map(it=>{
          const cls = it.tag==="核心" ? "" : (it.tag==="加分" ? "plus" : "mid");
          return `<div class="iv-item">
            <div class="iv-q"><span class="iv-tag ${cls}">${esc(it.tag)}</span><span>${esc(it.q)}</span></div>
            <ul class="iv-a">${it.a.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
          </div>`;
        }).join("")}
      </div>`).join("") : noHit;
  }else{
    const groups = KB_STD.map(g=>({g, items: g.items.filter(x=>!q || hit(x.code)||hit(x.name)||hit(x.note))}))
                         .filter(x=>x.items.length);
    const total = groups.reduce((a,x)=>a+x.items.length,0);
    box.innerHTML = groups.length ? groups.map(({g,items})=>`
      <div class="card">
        <h3>${g.icon} ${esc(g.cat)}</h3>
        <div class="tbl-scroll"><table class="mini std-tbl">
          <thead><tr><th style="width:225px">标准号</th><th style="width:270px">名称</th><th>说明 / 用途</th></tr></thead>
          <tbody>${items.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${esc(x.note)}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>`).join("") + (q?`<div class="qv-stat" style="font-size:12px;color:var(--sub);margin-top:4px;">共筛出 ${total} 项标准</div>`:"") : noHit;
  }
}

/* ══════════════ 原理问答（题库内容的阅读化改造） ══════════════
 * 原「自测题库」把同一批内容当考题用；这里剥掉答题机制（选项/判分/进度），
 * 只留「问题 → 答案 → 深度解析 → 其他说法为什么不对」，当作原理手册读。
 * 数据：kb-qa.js 提供领域清单，kb-qa-<领域id>.js 提供题目（按需加载），
 * 每题自包含 exp/w/lv/t，没有旁表、没有位置索引。加内容见 kb-qa.js 顶部注释。 */
/* 答案行：判断题只给结论（"正确/错误"），选择题补一个字母位牌 */
function qaAnswerHTML(q){
  const ans = esc(q.opts[q.a]);
  if(qaTypeOf(q) === "tf") return `<div class="qa-a"><b>答案</b><span class="qa-t">${ans}</span></div>`;
  return `<div class="qa-a"><b>答案</b><span class="qa-l">${"ABCD"[q.a]}</span><span class="qa-t">${ans}</span></div>`;
}
function qaCardHTML(domainId, idx, q){
  const lv = q.lv || "", tp = qaTypeOf(q);
  const lvIdx = QA_LEV.indexOf(lv);
  /* 判断题也走这条：它的 w 就是「为什么这个说法不对」，往往正是最该记住的一句 */
  let why = "";
  if(Array.isArray(q.w)){
    const rows = q.opts.map((o,j)=> (j !== q.a && q.w[j])
      ? `<div class="qw-row"><span class="qw-l">${"ABCD"[j]}</span><span class="qw-o">${esc(o)}</span><span class="qw-w">${esc(q.w[j])}</span></div>` : "").join("");
    if(rows) why = `<div class="q-why"><div class="qw-t">其他说法为什么不对</div>${rows}</div>`;
  }
  /* 解析与干扰辨析都缺时才不渲染折叠块（当前 432 题都有，属兜底） */
  const exp = (q.exp || why)
    ? `<div class="q-exps open"><div class="q-exp"><b>深度解析</b> — ${esc(q.exp)}</div>${why}`
      + `<button class="qr-exp" data-qexp="1">收起解析</button></div>`
    : "";
  return `<div class="quiz-q" data-qa="${esc(qaId(domainId, q.q))}">
    <div class="qq-title"><div class="qq-no">${idx+1}</div>
      <div class="qq-main">${esc(q.q)}</div>
      <div class="qq-tags">${lv?`<span class="qq-lv l-${lvIdx}">${esc(lv)}</span>`:""}${
        tp!=="choice"?`<span class="qq-tp">${esc(QA_TYPE[tp]||tp)}</span>`:""}</div>
    </div>
    ${qaAnswerHTML(q)}
    ${exp}
  </div>`;
}
function renderQa(){
  const META = qaMeta();
  if(!META.length){
    document.getElementById("qaTabs").innerHTML = "";
    document.getElementById("qaCount").textContent = "";
    document.getElementById("qaBody").innerHTML = `<div class="card"><div class="empty">正在加载…</div></div>`;
    return;
  }
  const total = qaTotalCount();
  /* 领域 tab：全部 + 各领域（领域名与图标来自 kb-qa.js，立即加载即可用；
     题目本身按需加载，未到位时该领域标签显示 0，到位后自动补齐） */
  document.getElementById("qaTabs").innerHTML =
    `<button class="qv-tab${activeQa==="all" ? " active" : ""}" data-qa-dom="all">全部 ${total}</button>` +
    META.map(m=>`<button class="qv-tab${m.id===activeQa ? " active" : ""}" data-qa-dom="${esc(m.id)}">${m.icon} ${esc(m.name)} <span style="opacity:.65">${qaQuestions(m.id).length}</span></button>`).join("");
  document.getElementById("qaCount").textContent = total + " 问";
  const box = document.getElementById("qaBody");
  const kw = (document.getElementById("qaSearch").value || "").trim().toLowerCase();

  /* 逐题筛选：领域 + 难度 + 关键词（关键词同时匹配题干、答案、解析与干扰辨析） */
  const pick = id => qaQuestions(id)
    .map((q,i)=>({q:q, i:i}))
    .filter(x=>{
      if(qaLev && x.q.lv !== qaLev) return false;
      if(!kw) return true;
      return [x.q.q, x.q.opts[x.q.a], x.q.exp, (x.q.w||[]).join(" ")].join(" ").toLowerCase().includes(kw);
    });
  const groups = (activeQa === "all" ? META : META.filter(m=>m.id===activeQa))
    .map(m=>({m:m, items: pick(m.id)}))
    .filter(g=>g.items.length);
  const shown = groups.reduce((a,g)=>a + g.items.length, 0);
  if(!groups.length){
    box.innerHTML = `<div class="card"><div class="empty">没有匹配的问答，换个关键词或难度试试～</div></div>`;
    return;
  }
  const filtered = !!(kw || qaLev);
  /* 「全部」且无筛选时每领域只预览前几条：432 问全铺开是 8 万像素的长页，也白占 1.3 万个 DOM 节点。
     筛选（关键词/难度）时结果集本来就小，就全量给出。 */
  const CAP = 5, overview = (activeQa === "all" && !filtered);
  const meta = filtered
    ? `<div class="qa-empty">筛选出 ${shown} 问${qaLev?` · 难度「${esc(qaLev)}」`:""}${kw?` · 关键词「${esc(kw)}」`:""}</div>`
    : (overview ? `<div class="qa-empty">共 ${shown} 问，已按 ${groups.length} 个领域分组预览；点上方领域标签或下方「查看全部」进入该领域，也可直接搜索。</div>` : "");
  box.innerHTML = meta + groups.map(g=>{
    const list = overview ? g.items.slice(0, CAP) : g.items;
    const more = (overview && g.items.length > CAP)
      ? `<button class="qv-tab qa-more" data-qa-dom="${esc(g.m.id)}">查看「${esc(g.m.name)}」全部 ${g.items.length} 问 →</button>` : "";
    return `<div class="qa-group">${g.m.icon} ${esc(g.m.name)} <span>${g.items.length} 问</span></div>
      ${list.map(x=>qaCardHTML(g.m.id, x.i, x.q)).join("")}${more}`;
  }).join("");
}
document.getElementById("qaTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-qa-dom]"); if(!b) return;
  activeQa = b.dataset.qaDom;
  renderQa();
  window.scrollTo({top:0, behavior:"smooth"});
});
/* 「查看全部 N 问 →」与领域标签同义，但它在正文里，所以单独委托一次 */
document.getElementById("qaBody").addEventListener("click", e=>{
  const b = e.target.closest(".qa-more[data-qa-dom]"); if(!b) return;
  activeQa = b.dataset.qaDom;
  renderQa();
  window.scrollTo({top:0, behavior:"smooth"});
});
document.getElementById("qaSearch").addEventListener("input", renderQa);
document.getElementById("qaLev").addEventListener("change", e=>{ qaLev = e.target.value; renderQa(); });

/* ══════════════ 模块十一：选型决策 ══════════════ */
let selCur = null;         // 当前节点 id
let selPath = [];          // [{nodeId, ans}] 走过的路

function selTree(){ return (window.KB_SELECT||[]).find(x=>x.id===activeSel) || (window.KB_SELECT||[])[0]; }

function renderSelect(){
  const T = window.KB_SELECT || [];
  if(!T.length) return;
  const tabsEl = document.getElementById("selTabs");
  tabsEl.innerHTML = T.map(t=>`<button class="qv-tab${t.id===activeSel?" active":""}" data-sel="${t.id}">${t.icon} ${esc(t.name)}</button>`).join("");
  const tree = selTree();
  if(!selCur || !tree.nodes[selCur]){ selCur = tree.start; selPath = []; }
  const node = tree.nodes[selCur];
  const pathHtml = selPath.length
    ? `<div class="sel-path">${selPath.map(p=>`<span class="sel-ans">${esc(p.ans)}</span>`).join('<span class="sel-ar">›</span>')}</div>`
    : `<div class="sel-path"><span class="sel-start">从这里开始 ↓</span></div>`;
  const acts = `<div class="sel-acts">${selPath.length?`<button class="sel-btn back" id="selBack">‹ 返回上一步</button>`:""}<button class="sel-btn reset" id="selReset">↺ 重新开始</button></div>`;
  let body;
  if(node.r){
    const r = node.r;
    body = `<div class="sel-result">
      <div class="sr-head">推荐结论</div>
      <div class="sr-title">${esc(r.title)}</div>
      <div class="sr-block why"><div class="sr-k">为什么推荐它</div><ul>${(r.why||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="sr-block avoid"><div class="sr-k">要特别注意</div><ul>${(r.avoid||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="sr-note">💡 ${esc(r.note)}</div>
      ${(r.ref||[]).length?`<div class="sr-rel">深入看这些知识点：${r.ref.map(n=>`<button class="rel-chip" data-rel="${esc(n)}">${esc(n)} →</button>`).join("")}</div>`:""}
      ${acts}
    </div>`;
  } else {
    const n = selPath.length;
    body = `<div class="sel-q"><span class="sel-step">第 ${n+1} 步</span>${esc(node.q)}</div>
      <div class="sel-opts">${node.opts.map((o,i)=>`<button class="sel-opt" data-opt="${i}"><span class="so-i">${i+1}</span><span class="so-t">${esc(o.t)}</span><span class="so-a">→</span></button>`).join("")}</div>
      ${acts}`;
  }
  document.getElementById("selBody").innerHTML = `
    <div class="card sel-card">
      <h3>${tree.icon} ${esc(tree.name)} <span class="sel-desc">${esc(tree.desc)}</span></h3>
      ${pathHtml}
      ${body}
    </div>`;
}

/* ══════════════ 模块十二：公式速查 ══════════════ */
function renderFormula(){
  const FM = window.KB_FORMULA || [], UN = window.KB_UNIT || [];
  const tabs = FM.map(g=>({ id:g.cat, n:g.icon+" "+g.cat,
    c:(g.items||[]).length+" 条" }));
  tabs.push({ id:"__unit", n:"<svg class=ic aria-hidden=true><use href=#i-ruler /></svg>单位换算", c:UN.reduce((a,x)=>a+(x.items||[]).length,0)+" 条" });
  if(activeFm !== "__unit" && !FM.some(g=>g.cat===activeFm)) activeFm = tabs[0].id;
  document.getElementById("fmTabs").innerHTML = tabs.map(t=>
    `<button class="qv-tab${t.id===activeFm?" active":""}" data-fm="${esc(t.id)}">${t.n} <span style="opacity:.65">${t.c}</span></button>`).join("");
  const q = (document.getElementById("fmSearch").value||"").trim().toLowerCase();
  const hit = s => (s==null?"":String(s)).toLowerCase().includes(q);
  const box = document.getElementById("fmBody");
  const noHit = `<div class="card"><div class="empty">没有匹配的内容，换个关键词试试～</div></div>`;

  if(activeFm === "__unit"){
    const groups = UN.map(g=>({ g, items:(g.items||[]).filter(x=>!q || hit(x.a)||hit(x.b)||hit(x.note)) })).filter(x=>x.items.length);
    box.innerHTML = groups.length ? groups.map(({g,items})=>`
      <div class="card">
        <h3>${g.icon} ${esc(g.cat)}</h3>
        <div class="tbl-scroll"><table class="mini">
          <thead><tr><th style="width:250px">这个单位</th><th style="width:250px">等于</th><th>备注 / 使用场景</th></tr></thead>
          <tbody>${items.map(x=>`<tr><td><b>${esc(x.a)}</b></td><td>${esc(x.b)}</td><td>${esc(x.note||"")}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>`).join("") : noHit;
    return;
  }

  const groups = FM.map(g=>({ g, items:(g.items||[]).filter(x=>!q || hit(x.name)||hit(x.expr)||hit(x.when)||hit(x.eg)||hit(x.unit)||hit((x.vars||[]).map(v=>v.s+" "+v.d).join(" "))) })).filter(x=>x.items.length);
  box.innerHTML = groups.length ? groups.map(({g,items})=>`
    <div class="card">
      <h3>${g.icon} ${esc(g.cat)} <span class="sel-desc">${esc(g.desc||"")}${q?`　·　筛出 ${items.length} 条`:""}</span></h3>
      ${items.map(it=>`
        <div class="fm-item">
          <div class="fm-head"><span class="fm-name">${esc(it.name)}</span><span class="fm-unit">单位：${esc(it.unit)}</span></div>
          <div class="fm-expr">${esc(it.expr)}</div>
          <div class="fm-vars">${(it.vars||[]).map(v=>`<div class="fm-var"><span class="fv-s">${esc(v.s)}</span><span class="fv-d">${esc(v.d)}</span></div>`).join("")}</div>
          <div class="fm-when"><b>什么时候用：</b>${esc(it.when)}</div>
          ${it.eg?`<div class="fm-eg"><b>算例：</b>${esc(it.eg)}</div>`:""}
        </div>`).join("")}
    </div>`).join("") : noHit;
}

/* ══════════════ 模块十：参考图库 ══════════════ */
let gwLimit = 60;   // 分页渲染，避免手机端一次插入 498 个节点
function renderGallery(){
  const sel = document.getElementById("gwCat");
  if(!sel.dataset.init){
    sel.innerHTML = '<option value="">全部领域</option>' +
      KB_DOMAINS.map(d=>`<option value="${d.id}">${d.icon} ${esc(d.name)}</option>`).join("");
    sel.dataset.init = "1";
  }
  const q = (document.getElementById("gwSearch").value||"").trim().toLowerCase();
  const cat = sel.value;
  const cards = [];
  KB_ITEMS.forEach(it=>{
    const d = CAT_DOMAIN[it.cat]; if(!d) return;
    if(cat && d.id !== cat) return;
    ((window.KB_IMG||{})[it.name] || []).forEach(x=>{
      if(q && !(x.t+" "+it.name).toLowerCase().includes(q)) return;
      cards.push({it, x, d});
    });
  });
  const shown = cards.slice(0, gwLimit);
  document.getElementById("gwCount").textContent = cards.length + " 张";
  document.getElementById("gwStat").innerHTML =
    `共 <b>${cards.length}</b> 张参考图，覆盖 <b>${new Set(cards.map(c=>c.it.name)).size}</b> 个知识点` +
    (q||cat ? `（已筛选）` : `　·　点图片放大，点标题进入知识点`);
  document.getElementById("gwBody").innerHTML = (shown.length ? shown.map(c=>`
    <div class="gw-card" data-ref="${esc(c.x.f)}" data-cap="${esc(c.x.t)}" data-src="${esc(c.x.s||"")}">
      <div class="gc-img"><img src="${esc(refThumbOf(c.x.f))}" alt="${esc(c.x.t)}" loading="lazy" decoding="async"></div>
      <div class="gc-body">
        <div class="gc-item" data-rel="${esc(c.it.name)}">${c.d.icon} ${esc(c.it.name)} →</div>
        <div class="gc-cap">${esc(c.x.t)}</div>
      </div>
    </div>`).join("") : `<div class="empty" style="grid-column:1/-1">没有匹配的图片，换个关键词试试～</div>`)
    + (cards.length > gwLimit
        ? `<div style="grid-column:1/-1; text-align:center; padding:18px 0;">
             <button class="mini-btn" id="gwMore">加载更多（还有 ${cards.length - gwLimit} 张）</button>
           </div>`
        : "");
  watchGwMore();
}

/* 图库续加载：滚到接近底部自动加载下一批（原来必须手动点「加载更多」）。
   ⚠️ 这里刻意不用 IntersectionObserver：它在部分环境（隐藏标签页 / 没有合成帧）不派发回调，
   而「滚动监听 + 位置判断」成本只是一个 rAF 节流后的位置读取，且行为可预期。
   判断条件同时要 activeModule === "gallery"：视图隐藏时元素仍是 0 尺寸，
   只看位置会把「后台的按钮」判成进入视口。 */
let gwMoreQueued = false;
function gwMaybeMore(){
  const btn = document.getElementById("gwMore");
  if(!btn || activeModule !== "gallery") return;
  if(btn.getBoundingClientRect().top > window.innerHeight + 400) return;   // 还差得远，别急
  btn.click();                       // 复用 #gwBody 上委托的那段加载逻辑
}
function gwQueueMoreCheck(){
  if(gwMoreQueued) return;
  gwMoreQueued = true;
  /* 用定时器节流而不是 requestAnimationFrame：rAF 依赖合成帧，隐藏标签页 / 无渲染帧时
     完全不派发（实测这个环境里就是如此），定时器则照常跑 */
  setTimeout(()=>{ gwMoreQueued = false; gwMaybeMore(); }, 80);
}
window.addEventListener("scroll", gwQueueMoreCheck, { passive:true });
window.addEventListener("resize", gwQueueMoreCheck);
function watchGwMore(){
  gwMaybeMore();                          // 渲染完先试一次：内容不满一屏 / 没触发滚动时也能自动续上
  setTimeout(gwMaybeMore, 300);           // 图片上屏会改变布局高度，稍后再确认一次
}

// 图库筛选变化时重置分页
function resetGallery(keepQ){ gwLimit = 60; renderGallery(); }

/* ══════════════ 引导式空态（零数据时替代空白图表） ══════════════ */
/* o = {mini, icon, title, desc, steps:[], acts:[[mod, text], ...]} */
function geHTML(o){
  o = o || {};
  const steps = (o.steps || []).length
    ? `<div class="ge-steps">${o.steps.map((s, i) => `<div class="ge-step"><i>${i + 1}</i>${esc(s)}</div>`).join("")}</div>`
    : "";
  const acts = (o.acts || []).length
    ? `<div class="ge-act">${o.acts.map(a => `<button class="mini-btn" data-go="${esc(a[0])}">${a[2] ? `<svg class=ic aria-hidden=true><use href=#${esc(a[2])} /></svg>` : ""}${esc(a[1])}</button>`).join("")}</div>`
    : "";
  return `<div class="ge${o.mini ? " ge-mini" : ""}">`
    + (o.icon ? `<div class="ge-ic"><svg class=ic-lg aria-hidden=true><use href=#${esc(o.icon)} /></svg></div>` : "")
    + `<div class="ge-t">${esc(o.title || "")}</div>`
    + (o.desc ? `<div class="ge-d">${o.desc}</div>` : "")
    + steps + acts
    + `</div>`;
}

/* ══════════════ 模块十四：项目实战模板 ══════════════ */
let tplSaveTimer = null;
function renderTpl(){
  const T = window.KB_TEMPLATE || [];
  if(!T.length){ document.getElementById("tplBody").innerHTML = `<div class="card"><div class="empty">模板数据未加载</div></div>`; return; }
  if(!T.some(x=>x.id===activeTpl)) activeTpl = T[0].id;
  document.getElementById("tplTabs").innerHTML = T.map(t=>
    `<button class="qv-tab${t.id===activeTpl?" active":""}" data-tp="${t.id}">${t.icon} ${esc(t.name)}</button>`).join("");
  const t = T.find(x=>x.id === activeTpl) || T[0];
  let h = `<div class="tpl-card"><h3 style="font-size:15px">${t.icon} ${esc(t.name)}</h3>
    <div class="qv-desc" style="margin:5px 0 16px">${esc(t.desc)}</div>`;
  t.blocks.forEach((b, bi)=>{
    if(b.type === "info"){
      h += `<div class="tpl-info">` + b.fields.map((f, fi)=>{
        const key = t.id+"|"+bi+"|"+fi;
        const v = tplDraft[key] !== undefined ? tplDraft[key] : (f.v || "");
        return `<div class="tpl-field"><label>${esc(f.l)}</label>
          <input data-tk="${key}" value="${esc(v)}" placeholder="${esc(f.ph||"")}"></div>`;
      }).join("") + `</div>`;
    } else if(b.type === "table"){
      h += `<div class="tbl-scroll" style="margin-bottom:16px"><table class="mini">
        <thead><tr>${b.cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${b.rows.map(r=>`<tr>${r.map((c,ci)=>`<td${ci===0?' style="font-weight:bold"':""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    } else if(b.type === "fill"){
      h += `<div class="tbl-scroll"><table class="tpl-fill">
        <thead><tr>${b.cols.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${b.rows.map((r, ri)=>`<tr>${r.map((c, ci)=>{
          const key = t.id+"|"+bi+"|"+ri+"|"+ci;
          if(b.labelCol && ci === 0) return `<td class="lbl">${esc(c)}</td>`;
          const v = tplDraft[key] !== undefined ? tplDraft[key] : c;
          return `<td contenteditable="true" data-tk="${key}">${esc(v)}</td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
  });
  h += `<div class="tpl-actions">
      <button class="mini-btn" data-tact="print"><svg class=ic aria-hidden=true><use href=#i-printer /></svg> 打印 / 存为 PDF</button>
      <button class="mini-btn" data-tact="clear"><svg class=ic aria-hidden=true><use href=#i-trash /></svg>清空填写内容</button>
      <span class="mini-btn" style="cursor:default; color:var(--sub)"><svg class=ic aria-hidden=true><use href=#i-edit /></svg> 填写内容自动保存在本机</span>
    </div>`;
  if(t.note) h += `<div class="tpl-note">💡 ${esc(t.note)}</div>`;
  h += `</div>`;
  document.getElementById("tplBody").innerHTML = h;
}

/* ══════════════ 模块十五：我的收藏与笔记 ══════════════ */
function renderFav(){
  const tabs = [
    {id:"fav",  n:"<svg class=ic aria-hidden=true><use href=#i-star /></svg>我的收藏", c:favCount()+" 条"},
    {id:"note", n:"<svg class=ic aria-hidden=true><use href=#i-file-text /></svg>我的笔记", c:noteCount()+" 条"},
    {id:"doubt", n:"<svg class=ic aria-hidden=true><use href=#i-alert /></svg>我的疑问", c:doubtCount()+" 条"}
  ];
  document.getElementById("favTabs").innerHTML = tabs.map(t=>
    `<button class="qv-tab${t.id===favTab?" active":""}" data-fv="${t.id}">${t.n} <span style="opacity:.6">${t.c}</span></button>`).join("");
  const box = document.getElementById("favBody");
  const domOf = n => { const it = KB_ITEMS.find(x=>x.name===n); return it ? CAT_DOMAIN[it.cat] : null; };

  if(favTab === "fav"){
    const list = Object.entries(favs).sort((a,b)=>b[1]-a[1]).filter(([n])=>KB_ITEMS.some(x=>x.name===n));
    box.innerHTML = list.length ? list.map(([n])=>{
      const d = domOf(n), it = KB_ITEMS.find(x=>x.name===n);
      const memo = (window.KB_MEMO||{})[n] || (it ? it.points : "");
      return `<div class="fav-item" data-open="${esc(n)}">
        <span class="fi-ic">${d ? d.icon : "<svg class=ic aria-hidden=true><use href=#i-file-text /></svg>"}</span>
        <div style="min-width:0">
          <div class="fi-n">${esc(n)}</div>
          <div class="fi-d">${esc(String(memo).slice(0, 54))}</div>
        </div>
        <span class="fi-t">${d ? esc(d.name) : ""}</span>
        <button class="mini-btn" data-unfav="${esc(n)}" style="margin-left:12px">移出</button>
      </div>`;
    }).join("") : `<div class="card">${geHTML({ icon: "i-star", title: "还没有收藏", desc: "收藏是给「以后还要翻」的条目用的 —— 常用的材料参数、容易忘的公差表、天天要查的标准。", steps: ["打开任意知识点", "点右上「☆ 收藏」", "回这里随时翻"], acts: [["kb", "去知识库逛逛", "i-book"]] })}</div>`;
  } else if(favTab === "doubt"){
    const list = Object.keys(doubts).sort((a,b)=>doubts[b]-doubts[a]).filter(n=>KB_ITEMS.some(x=>x.name===n));
    box.innerHTML = list.length ? list.map(nm=>{
      const d = domOf(nm), it = KB_ITEMS.find(x=>x.name===nm);
      const lead = deepLead(nm) || (it ? it.points : "");
      return `<div class="fav-item" data-open="${esc(nm)}">
        <span class="fi-ic">${d ? d.icon : "<svg class=ic aria-hidden=true><use href=#i-alert /></svg>"}</span>
        <div style="min-width:0">
          <div class="fi-n">${esc(nm)}</div>
          <div class="fi-d">${esc(String(lead).slice(0, 62))}</div>
        </div>
        <span class="fi-t">${d ? esc(d.name) : ""}</span>
        <button class="mini-btn" data-doubt="${esc(nm)}" style="margin-left:12px">搞懂了</button>
      </div>`;
    }).join("") : `<div class="card">${geHTML({ icon: "i-alert", title: "还没有标过疑问", desc: "遇到「看懂了但不敢下手」的条目，在它的详情里点「标为疑问」。攒起来回看，比糊过去强。", steps: ["打开任意知识点", "点「标为疑问」", "回这里集中回看"], acts: [["kb", "去知识库逛逛", "i-book"]] })}</div>`;
  } else {
    const list = Object.entries(notes).filter(([,v])=>v && v.trim()).sort((a,b)=>(b[1].length - a[1].length));
    box.innerHTML = list.length ? list.map(([n, v])=>{
      const d = domOf(n);
      return `<div class="fav-item" data-open="${esc(n)}" style="align-items:flex-start">
        <span class="fi-ic">${d ? d.icon : "<svg class=ic aria-hidden=true><use href=#i-file-text /></svg>"}</span>
        <div style="min-width:0; flex:1">
          <div class="fi-n">${esc(n)}</div>
          <div class="fi-d" style="white-space:pre-wrap; margin-top:6px; line-height:1.75; color:var(--text)">${esc(v)}</div>
        </div>
        <button class="mini-btn" data-unfav="${esc(n)}" data-nodelete="1" style="margin-left:12px">删除笔记</button>
      </div>`;
    }).join("") : `<div class="card">${geHTML({ icon: "i-edit", title: "还没有笔记", desc: "笔记写在各知识点的详情里，会汇总到这一页 —— 试模踩过的坑、供应商给的经验值、跟客户确认过的口径，都值得记一句。", steps: ["打开任意知识点", "翻到「我的笔记」", "写一句保存即可"], acts: [["kb", "去写第一条", "i-book"]] })}</div>`;
  }
}

function renderDpActions(it){
  const btn = document.getElementById("dpFavBtn");
  if(btn){ btn.className = favOn(it.name) ? "on" : ""; btn.textContent = favOn(it.name) ? "★ 已收藏" : "☆ 收藏"; }
  /* 「还没搞懂」标记：和收藏分开 —— 收藏是留着用，这个是还没弄明白 */
  const db = document.getElementById("dpDoubt");
  // ⚠️ 图标是 <svg>，只能进 innerHTML，不能进 textContent
  if(db){
    const on = doubtOn(it.name);
    db.className = on ? "on" : "";
    db.innerHTML = on
      ? "<svg class=ic aria-hidden=true><use href=#i-alert /></svg>已标疑问"
      : "<svg class=ic aria-hidden=true><use href=#i-alert /></svg>标为疑问";
    db.title = on ? "点击取消这个疑问标记" : "标上之后可以在「我的收藏与笔记 · 我的疑问」里集中回看";
  }
  const nj = document.getElementById("dpNoteJump");
  // ⚠️ 同上：图标是 <svg>，必须 innerHTML
  if(nj){ const n = notes[it.name]; nj.innerHTML = (n && n.trim()) ? `<svg class=ic aria-hidden=true><use href=#i-edit /></svg>笔记（${n.trim().length} 字）` : "<svg class=ic aria-hidden=true><use href=#i-edit /></svg>写笔记"; }
}
function toggleFav(name){
  if(favs[name]) delete favs[name]; else favs[name] = Date.now();
  lsSet(LS_FAV, favs);
  if(curDetail && curDetail.name === name) renderDpActions(curDetail);
  refreshBadges();
  if(activeModule === "fav") renderFav();
}

/* ══════════════ 知识点对比 ══════════════ */
const LS_CMP = "kb-compare-v1";
const CMP_PRESETS = [
  { t: "ABS ↔ PC", a: "ABS", b: "PC" },
  { t: "PC ↔ 亚克力", a: "PC", b: "亚克力" },
  { t: "PP ↔ ABS", a: "PP", b: "ABS" },
  { t: "注塑 ↔ 搪胶", a: "注塑成型", b: "搪胶" },
  { t: "搪胶 ↔ 液态硅胶", a: "搪胶", b: "液态硅胶" },
  { t: "卡扣 ↔ 自攻螺丝", a: "卡扣设计", b: "自攻螺丝" },
  { t: "自攻螺丝 ↔ 热熔螺母", a: "自攻螺丝", b: "热熔螺母" },
  { t: "喷油 ↔ 电镀", a: "喷油", b: "电镀" },
  /* ── 跨工艺对比 ── */
  { t: "塑料卡扣 ↔ 钣金弹片", a: "卡扣设计", b: "不锈钢弹片（SUS301）与弹簧钢" },
  { t: "压铸铝灯体 ↔ 挤压铝型材", a: "ADC12 压铸铝", b: "6063 / 6061 铝型材" },
  { t: "SPCC ↔ SUS304", a: "SPCC / SECC 冷轧板", b: "SUS304 不锈钢" },
  { t: "塑料外壳 ↔ 钣金外壳", a: "ABS", b: "SPCC / SECC 冷轧板" },
  { t: "钣金折弯 ↔ 压铸结构", a: "钣金折弯最小半径", b: "压铸件壁厚均一与掏料减重" }
];
let cmpSel = lsGet(LS_CMP, { a: "", b: "" });

function cmpFind(kw){
  if(!kw) return null;
  let hit = KB_ITEMS.find(x => x.name === kw);
  if(!hit) hit = KB_ITEMS.find(x => x.name.indexOf(kw) >= 0);
  return hit || null;
}
function cmpNumOf(n){ const v = (window.KB_NUM || {})[n]; return Array.isArray(v) ? v : []; }
function cmpRelOf(n){ const v = (window.KB_REL || {})[n]; return Array.isArray(v) ? v : []; }
function cmpMemoOf(n){ return (window.KB_MEMO || {})[n] || ""; }
function cmpSplitPoints(txt){
  return String(txt || "").split(/[；;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 14);
}
function renderCompare(){
  const selA = document.getElementById("cmpA"), selB = document.getElementById("cmpB");
  if(!selA.dataset.init){
    /* 选项按工艺分组，组内按优先级排序 —— 跨工艺对比一眼可选 */
    const opts = (window.KB_PROC || []).map(p=>{
      const items = sortByLv(procItems(p.id));
      if(!items.length) return "";
      return `<optgroup label="${p.icon} ${esc(p.name)}">` +
        items.map(it=>`<option value="${esc(it.name)}">${esc(it.name)}</option>`).join("") + `</optgroup>`;
    }).join("");
    const html = `<option value="">— 请选择知识点 —</option>` + opts;
    selA.innerHTML = html; selB.innerHTML = html;
    selA.dataset.init = "1";
  }
  if(!cmpFind(cmpSel.a)){ const f = cmpFind("ABS"); cmpSel.a = f ? f.name : ((KB_ITEMS[0] || {}).name || ""); }
  if(!cmpFind(cmpSel.b)){ const f = cmpFind("PC");  cmpSel.b = f ? f.name : ((KB_ITEMS[1] || {}).name || ""); }
  selA.value = cmpSel.a; selB.value = cmpSel.b;

  document.getElementById("cmpPresets").innerHTML = CMP_PRESETS.map((p, i)=>{
    const A = cmpFind(p.a), B = cmpFind(p.b);
    if(!A || !B) return "";
    const on = (cmpSel.a === A.name && cmpSel.b === B.name);
    return `<button class="mini-btn${on ? " ok" : ""}" data-cmp="${i}" style="padding:5px 11px; font-size:var(--fs-xs);">${esc(p.t)}</button>`;
  }).join("");

  const LVN = ["", "核心必会", "进阶掌握", "了解即可"];
  const col = it => {
    if(!it) return `<div class="cmp-col"><div class="empty">未选择</div></div>`;
    const d = CAT_DOMAIN[it.cat] || { icon: "", name: "" };
    const nums = cmpNumOf(it.name), rel = cmpRelOf(it.name), memo = cmpMemoOf(it.name);
    const pts = cmpSplitPoints(it.points);
    return `<div class="cmp-col">
      <div class="cmp-head">
        <div class="cmp-name" data-rel="${esc(it.name)}">${d.icon} ${esc(it.name)} <span class="cmp-go">查看详情 →</span></div>
        <div class="cmp-meta"><span>${esc(d.name)}</span><span class="cmp-lv">${LVN[it.lv] || ""}</span></div>
      </div>
      ${memo ? `<div class="cmp-sec memo"><div class="cmp-h"><svg class=ic aria-hidden=true><use href=#i-bulb /></svg>一句话记住</div><div class="cmp-b">${esc(memo)}</div></div>` : ""}
      <div class="cmp-sec"><div class="cmp-h"><svg class=ic aria-hidden=true><use href=#i-pin /></svg>核心要点</div><div class="cmp-b"><ul>${pts.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>
      ${nums.length ? `<div class="cmp-sec"><div class="cmp-h"><svg class=ic aria-hidden=true><use href=#i-hash /></svg>关键经验数值</div><div class="cmp-b"><ul class="cmp-num">${nums.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>` : ""}
      <div class="cmp-sec"><div class="cmp-h"><svg class=ic aria-hidden=true><use href=#i-factory /></svg>应用场景</div><div class="cmp-b">${esc(usageOf(it) || "—")}</div></div>
      ${rel.length ? `<div class="cmp-sec"><div class="cmp-h"><svg class=ic aria-hidden=true><use href=#i-link /></svg>关联条目</div><div class="cmp-b"><div class="rel-box">${rel.map(n=>`<button class="rel-chip sm" data-rel="${esc(n)}">${esc(n)}</button>`).join("")}</div></div>` : ""}
    </div>`;
  };
  document.getElementById("cmpBody").innerHTML = `<div class="cmp-grid">${col(cmpFind(cmpSel.a))}${col(cmpFind(cmpSel.b))}</div>`;
}
document.getElementById("cmpA").addEventListener("change", e=>{ cmpSel.a = e.target.value; lsSet(LS_CMP, cmpSel); renderCompare(); });
document.getElementById("cmpB").addEventListener("change", e=>{ cmpSel.b = e.target.value; lsSet(LS_CMP, cmpSel); renderCompare(); });
document.getElementById("cmpPresets").addEventListener("click", e=>{
  const b = e.target.closest("[data-cmp]"); if(!b) return;
  const p = CMP_PRESETS[+b.dataset.cmp]; if(!p) return;
  const A = cmpFind(p.a), B = cmpFind(p.b); if(!A || !B) return;
  cmpSel = { a: A.name, b: B.name };
  lsSet(LS_CMP, cmpSel);
  renderCompare();
});

/* ══════════════ 首页：最近浏览 ══════════════ */
function relTime(ts){
  const s = Math.floor((Date.now() - ts)/1000);
  if(s < 60) return "刚刚";
  if(s < 3600) return Math.floor(s/60) + " 分钟前";
  if(s < 86400) return Math.floor(s/3600) + " 小时前";
  return Math.floor(s/86400) + " 天前";
}
function renderRecent(){
  const box = document.getElementById("panelRecent"); if(!box) return;
  const list = recents.filter(x => KB_ITEMS.some(it => it.name === x.n)).slice(0, 8);
  box.innerHTML = `<h3><svg class=ic aria-hidden=true><use href=#i-clock /></svg>最近浏览</h3>
    <div class="pdesc">点任意条目直接回到详情（只记录在本机）</div>
    ${list.length ? list.map(x=>{
      const it = KB_ITEMS.find(y => y.name === x.n), d = it ? CAT_DOMAIN[it.cat] : null;
      return `<div class="recent-item" data-recent="${esc(x.n)}">
        <span class="ri-ic">${d ? d.icon : "<svg class=ic aria-hidden=true><use href=#i-file-text /></svg>"}</span>
        <span class="ri-n">${esc(x.n)}</span>
        <span class="ri-t">${relTime(x.t)}</span></div>`;
    }).join("") : `<div class="empty" style="padding:14px 0">还没有浏览记录，点开任意知识点就会出现在这里。</div>`}
    ${recents.length > 8 ? `<div class="data-note">共 ${recents.length} 条记录，仅显示最近 8 条</div>` : ""}`;
}

/* ══════════════ 搜索历史下拉 ══════════════ */
function renderSearchHist(){
  const box = document.getElementById("searchHist"); if(!box) return;
  if(!searchHist.length || kw.value.trim()){ box.classList.remove("on"); box.innerHTML = ""; return; }
  box.innerHTML = `<div class="sh-cap"><span><svg class=ic aria-hidden=true><use href=#i-clock /></svg>搜索历史</span><button data-shclear="1">清空</button></div>` +
    searchHist.map(q => `<button class="sh-item" data-sh="${esc(q)}"><svg class=ic aria-hidden=true><use href=#i-search /></svg> ${esc(q)}</button>`).join("");
  box.classList.add("on");
}
function hideSearchHist(){ const b = document.getElementById("searchHist"); if(b) b.classList.remove("on"); }

/* 视图标识：模块 / 工艺 / 五维 / 领域 / 子类 / 各模块内的分类切换……
   一旦变化就说明「换了一页内容」，此时把窗口滚回顶部。
   只开关详情面板、勾清单、收藏这类操作不会改变这个标识，所以不会打断当前阅读位置。 */
let _viewKey = "";
function viewKeyOf(){
  return [activeModule, activeProc, activeDim, activeDomain, activeSub, browseAll ? 1 : 0,
    activeField, activeCase, activeQuick, activeTpl, activeChk, activeSel, activeFm, activeQa].join("|");
}
function renderAll(){
  const vk = viewKeyOf();
  if(vk !== _viewKey){                       // 换了视图 → 回到顶部
    _viewKey = vk;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  /* 当前模块的数据若还没到位：先用现有数据渲染一次让界面立刻响应，
     同时后台补齐，完成后自动重渲染（首屏省下那 526KB 靠的就是这段） */
  if(!dataReady(activeModule)){
    const want = activeModule;
    ensureData(want).then(function(){ if(activeModule === want) renderAll(); });
  }
  navbar.querySelectorAll(".nav-tab:not(.proc-tab)").forEach(b=>{
    const on = b.dataset.mod === activeModule;
    b.classList.toggle("active", on);
    if(on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
  });
  syncProcTabs();
  /* 小屏导航横向滑动时，把当前模块滚进可视区 */
  (function(){
    const cur = navbar.querySelector(".nav-tab.active");
    if(!cur || !cur.scrollIntoView) return;
    try{
      if(window.matchMedia && window.matchMedia("(max-width:640px)").matches){
        cur.scrollIntoView({ block: "nearest", inline: "center" });
      }
    }catch(e){}
  })();
  const isKB = activeModule === "kb";
  Object.values(MOD_VIEWS).forEach(v=>{ if(v) v.style.display = "none"; });
  document.querySelector(".search").style.display = isKB ? "" : "none";
  kw.style.display = isKB ? "" : "none";
  if(!isKB){
    KB_VIEWS.forEach(v=>{ if(v) v.style.display = "none"; });
    lvFilter.style.display = "none"; backBtn.style.display = "none";
    const v = MOD_VIEWS[activeModule];
    if(v) v.style.display = "";
    if(activeModule==="quick") renderQuick();
    else if(activeModule==="check") renderChecks();
    else if(activeModule==="case") renderCases();
    else if(activeModule==="gloss") renderGloss();
    else if(activeModule==="compare") renderCompare();
    else if(activeModule==="step") renderStep();
    else if(activeModule==="field") renderField();
    else if(activeModule==="gallery") renderGallery();
    else if(activeModule==="select") renderSelect();
    else if(activeModule==="formula") renderFormula();
    else if(activeModule==="tpl") renderTpl();
    else if(activeModule==="fav") renderFav();
    else if(activeModule==="qa") renderQa();
    refreshBadges();          // 角标随当前状态刷新（复习/每日20题/错题/收藏）
    return;
  }
  const q = kw.value.trim();
  if(q || browseAll){
    procView.style.display = "none";
    homeView.style.display="none"; domainView.style.display="none"; searchView.style.display="";
    lvFilter.style.display="";
    backBtn.style.display="";
    renderSearch();
  }else{
    document.getElementById("gsGroups").innerHTML = "";
    procView.style.display = "none";
    if(activeDomain){
      openDomain();
    }else if(activeProc !== "all"){
      homeView.style.display="none"; domainView.style.display="none"; searchView.style.display="none";
      lvFilter.style.display="none"; backBtn.style.display="none";
      procView.style.display="";
      renderProc();
    }else{
      homeView.style.display=""; domainView.style.display="none"; searchView.style.display="none";
      lvFilter.style.display="none";
      backBtn.style.display="none";
      renderHome();
    }
  }
}

// 事件
kw.addEventListener("input", ()=>{
  const q = kw.value.trim();
  if(q) browseAll = false;
  renderAll();
});
lvFilter.addEventListener("change", renderAll);
backBtn.onclick = ()=>{
  kw.value = ""; browseAll = false; activeDomain = null;
  renderAll();
  closeDetail();
};
document.getElementById("coreBtn").onclick = ()=>{
  browseAll = true; activeDomain = null; kw.value = "";
  lvFilter.value = "1";
  renderAll();
};
document.getElementById("allBtn").onclick = ()=>{
  browseAll = true; activeDomain = null; kw.value = "";
  lvFilter.value = "";
  renderAll();
};

// 行点击 → 打开详情；子按钮冒泡阻断
/* ══════════ 全局点击委托（表驱动，一个监听器）══════════
 * 原先是十余个 document 级监听器，靠"守卫恰好互不重叠"维持，新增一个就可能双重处理。
 * 现在收敛为一张注册表：按顺序逐条尝试，命中选择器且处理器未"谢绝"即执行；
 * 处理器 return true 表示已消费（等价于原先 stopPropagation 的意图），不再尝试后续。
 * 新增交互 = 在表里加一行。顺序即优先级（同一元素可能命中多条时靠顺序消歧）。 */
const CLICK_RULES = [
  { sel: ".img-btn[data-name]", fn(el, e){
      // 点缩略图本身 → 只放大看图，不打开详情面板（交给下面的图片放大规则）
      if(e.target.tagName === "IMG" && el.dataset.img) return false;
      const it = KB_ITEMS.find(x=>x.name === el.dataset.name);
      if(it) openDetail(it);
      return true; } },
  { sel: "tr[data-name]", fn(el){
      const it = KB_ITEMS.find(x=>x.name === el.dataset.name);
      if(it) openDetail(it);
      return true; } },
  { sel: ".gc-item[data-rel]", fn(el, e){
      e.preventDefault(); openItemByName(el.dataset.rel); return true; } },
  /* 关联跳转的两个宿主：详情/图库的 chip、对比卡的标题（原先漏了最后一个，点了没反应） */
  { sel: ".rel-chip[data-rel], .cmp-name[data-rel]", fn(el, e){
      e.preventDefault(); openItemByName(el.dataset.rel); return true; } },
  /* 图片放大（主图 / 参考图集 / 图库通用） */
  { sel: ".ref-card[data-ref], .gw-card[data-ref], .img-preview img, .img-btn[data-img] img", fn(el, e){
      const card = e.target.closest(".ref-card[data-ref], .gw-card[data-ref]");
      let src = "", cap = "";
      if(card){
        src = card.dataset.ref; cap = card.dataset.cap + (card.dataset.src ? "　|　来源：" + card.dataset.src : "");
      }else{
        const btn = e.target.closest(".img-btn[data-img]");
        const im = e.target.closest("img");
        // 列表里显示的是缩略图，放大时要换成原图
        src = (btn && btn.dataset.img) ? btn.dataset.img : (im ? im.getAttribute("src") : "");
        cap = btn ? btn.dataset.name : "";
      }
      if(!src) return false;
      document.getElementById("imgModalSrc").src = src;
      document.getElementById("imgModalCap").textContent = cap;
      document.getElementById("imgModal").classList.add("open");
      if(window.resetImgZoom) window.resetImgZoom();     // 每次打开都回到 100%（同一张图重复点开也一样）
      return true; } },
  { sel: "[data-qexp]", fn(el){
      const wrap = el.closest(".q-exps"); if(!wrap) return false;
      const open = !wrap.classList.contains("open");
      wrap.classList.toggle("open", open);
      el.textContent = open ? "收起解析" : "展开解析";
      return true; } },
  { sel: "[data-go]", fn(el){ switchMod(el.dataset.go); return true; } },
  /* 工艺页 → 实战宝典的某个分类：切模块 + 切分类 + 滚到那张卡 */
  { sel: "[data-fieldjump]", fn(el){
      activeModule = "field";
      activeField = el.dataset.fieldjump;
      const gid = el.dataset.fgroup;
      renderAll();
      setTimeout(()=>{
        const card = gid && document.querySelector('[data-fgroup="' + gid + '"]');
        if(card && card.scrollIntoView) card.scrollIntoView({block:"start", behavior:"smooth"});
        else window.scrollTo({top:0, behavior:"smooth"});
      }, 140);
      return true; } },
  { sel: "[data-recent]", fn(el){ openItemByName(el.dataset.recent); return true; } },
  { sel: "[data-copy]", fn(el){ copyDeepLink(el); return true; } },
  { sel: "[data-doubt]", fn(el){ toggleDoubt(el.dataset.doubt); return true; } },
  { sel: "[data-print]", fn(){ window.print(); return true; } },
  /* 搜索无结果时的建议词：点一下直接搜 */
  { sel: "[data-sekw]", fn(el){
      if(activeModule !== "kb"){ activeModule = "kb"; }
      kw.value = el.dataset.sekw;
      renderAll();
      try{ kw.focus(); }catch(err){}
      return true; } },
];
document.addEventListener("click", e=>{
  for(const rule of CLICK_RULES){
    const el = e.target.closest(rule.sel);
    if(!el) continue;
    if(rule.fn(el, e)) return;
  }
  if(!e.target.closest(".search")) hideSearchHist();   // 点到搜索框外：收起历史下拉
});

// AI 提示词 Modal 复制
document.getElementById("aiCopyBtn").onclick = function(){
  const t = document.getElementById("aiPromptText").textContent;
  navigator.clipboard?.writeText(t).then(()=>{
    this.textContent = "✓ 已复制"; this.classList.add("ok");
    setTimeout(()=>{ this.textContent = "复制提示词"; this.classList.remove("ok"); }, 1800);
  });
};
document.getElementById("aiCloseBtn").onclick = ()=> document.getElementById("aiModal").classList.remove("open");

// 图片放大：见上方 CLICK_RULES（表驱动委托）
document.getElementById("imgModalClose").onclick = ()=> document.getElementById("imgModal").classList.remove("open");
document.getElementById("imgModal").addEventListener("click", e=>{
  if(e.target === document.getElementById("imgModal")) document.getElementById("imgModal").classList.remove("open");
});

/* ══════════ 看图模式：滚轮 / 双指在指针处缩放、拖动平移、双击放大 ══════════
 * 图片用 transform 缩放（不改布局、不触发重排），平移量按「放大后不脱离取景框」夹住；
 * 以指针为中心缩放的算法：设当前可视中心 C、指针 P，则平移增量 = (P−C) × (1 − k'/k)。 */
(function(){
  const M = document.getElementById("imgModal");
  const img = document.getElementById("imgModalSrc");
  const valEl = document.getElementById("imgZoomVal");
  if(!M || !img || !valEl) return;
  const MIN = 1, MAX = 8, STEP = 1.25;
  let k = 1, tx = 0, ty = 0;
  let dragEndAt = 0;                           // 拖动结束时刻：用来拦截「拖完顺手点到背景」的那一次 click
  let dragging = false, moved = false, lastX = 0, lastY = 0, pinchDist = 0;
  const pts = new Map();                       // 活动指针（双指缩放用）

  function paint(){
    img.style.transform = (k === 1 && !tx && !ty) ? "" : `translate(${tx}px,${ty}px) scale(${k})`;
    valEl.textContent = Math.round(k * 100) + "%";
    img.classList.toggle("zoomed", k > 1);
  }
  /* 平移夹住：放大出来的那部分可以拖，但不让图整体脱出取景框 */
  function clamp(){
    if(k <= 1){ tx = 0; ty = 0; return; }
    const r = img.getBoundingClientRect();                 // 含 transform 的可视尺寸
    const maxX = Math.max(0, (r.width - r.width / k) / 2);
    const maxY = Math.max(0, (r.height - r.height / k) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }
  function zoomAt(k2, px, py){
    k2 = Math.max(MIN, Math.min(MAX, k2));
    if(k2 === k) return;
    const r = img.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const f = 1 - k2 / k;
    tx += (px - cx) * f; ty += (py - cy) * f;
    k = k2; clamp(); paint();
  }
  function zoomCenter(factor){
    const r = img.getBoundingClientRect();
    zoomAt(k * factor, r.left + r.width / 2, r.top + r.height / 2);
  }
  function reset(){ k = 1; tx = 0; ty = 0; paint(); }
  window.resetImgZoom = reset;                 // 打开新图时复位（见上面的图片放大规则）

  img.addEventListener("wheel", e=>{
    e.preventDefault();
    zoomAt(k * (e.deltaY < 0 ? STEP : 1 / STEP), e.clientX, e.clientY);
  }, { passive:false });

  img.addEventListener("pointerdown", e=>{
    try{ img.setPointerCapture(e.pointerId); }catch(err){}
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pts.size === 1){
      moved = false; lastX = e.clientX; lastY = e.clientY;
      dragging = k > 1;                        // 未放大时不拖（让点击继续是点击）
      if(dragging) img.classList.add("dragging");
    }else if(pts.size === 2){
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      dragging = false; img.classList.remove("dragging");
    }
  });
  img.addEventListener("pointermove", e=>{
    if(!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
    if(pts.size === 2){                        // 双指：按指距比例缩放，锚在两指中点
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if(pinchDist > 0){ zoomAt(k * (d / pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2); moved = true; }
      pinchDist = d;
      return;
    }
    if(!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if(Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    lastX = e.clientX; lastY = e.clientY;
    tx += dx; ty += dy; clamp(); paint();
  });
  function endPointer(e){
    pts.delete(e.pointerId);
    if(pts.size < 2) pinchDist = 0;
    if(pts.size === 0){ dragging = false; img.classList.remove("dragging"); if(moved) dragEndAt = performance.now(); }
  }
  img.addEventListener("pointerup", endPointer);
  img.addEventListener("pointercancel", endPointer);
  /* 拖完那一下不要当成「点背景关闭」：只拦截拖动结束后 300ms 内、且落在背景上的那一次 click。
     （早前用「遗留标记 + 永久拦截」的写法会把紧接着的点击一起吞掉，连工具条按钮都点不动） */
  M.addEventListener("click", e=>{
    if(e.target === M && performance.now() - dragEndAt < 300) e.stopPropagation();
  }, true);
  img.addEventListener("dblclick", e=>{
    e.preventDefault();
    if(k > 1) reset(); else zoomAt(2.5, e.clientX, e.clientY);
  });
  document.getElementById("imgZoomIn").onclick = ()=> zoomCenter(STEP);
  document.getElementById("imgZoomOut").onclick = ()=> zoomCenter(1 / STEP);
  document.getElementById("imgZoomReset").onclick = reset;
  document.addEventListener("keydown", e=>{
    if(!M.classList.contains("open")) return;
    if(e.key === "+" || e.key === "=" || e.key === "Add"){ zoomCenter(STEP); e.preventDefault(); }
    else if(e.key === "-" || e.key === "_" || e.key === "Subtract"){ zoomCenter(1 / STEP); e.preventDefault(); }
    else if(e.key === "0"){ reset(); e.preventDefault(); }
  });
  img.addEventListener("load", reset);         // 换图后自动回到 100%
})();

/* ══════════════ 模块导航与交互绑定 ══════════════ */

/* 站内多处文案写着「多少条知识点 / 多少道题 / 多少张图」—— 内容一直在长，
 * 光靠手改总会漏（2026-09-21 实测仍有 6 处写着 198、导航角标写着 120）。
 * 这里给这些位置加 data-cnt 标记，启动时按实际数据校正一遍；
 * HTML 里保留当前正确值作默认，所以题库（懒加载）还没到位时也不会显示错数字。
 * ⚠️ 新增知识点 / 题目后，只需更新 index.html 的 title 与 meta 描述（SEO 要静态值），
 *    页面内的这些数字会自动跟上。 */
function syncCounts(){
  /* 键对应 index.html 里 [data-cnt="…"] 标记；目前页面只用到 items 与 img 两个。 */
  const m = {
    items: KB_ITEMS.length,
    img:   Object.values(window.KB_IMG||{}).reduce(function(a,v){ return a + v.length; }, 0),
  };
  document.querySelectorAll("[data-cnt]").forEach(function(el){
    const k = el.dataset.cnt;
    if(m[k] === undefined) return;
    const tail = (el.textContent.match(/[条道张个]/) || [""])[0];
    el.textContent = m[k] + (tail ? " " + tail : "");
  });
}
function initBadges(){
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set("nbKb", KB_ITEMS.length);
  set("nbQa", qaTotalCount() + " 问");
  set("nbQuick", (window.KB_QUICK||[]).length + " 表");
  set("nbCheck", (window.KB_CHECKS||[]).length + " 份");
  set("nbCase", (window.KB_CASES||[]).length + " 个");
  set("nbGloss", (window.KB_GLOSS||[]).length + " 条");
  set("nbField", ((window.KB_MISTAKE||[]).reduce((a,x)=>a+x.items.length,0) + (window.KB_TROUBLE||[]).reduce((a,x)=>a+x.items.length,0) + (window.KB_INTERVIEW||[]).reduce((a,x)=>a+x.items.length,0)) + " 条");
  set("nbGallery", Object.values(window.KB_IMG||{}).reduce((a,b)=>a+b.length,0) + " 张");
  set("nbSelect", (window.KB_SELECT||[]).length + " 棵树");
  /* 原理问答的题数取自领域清单的 n（见 qaTotalCount），首屏就是真实数字；
     题目真正加载完后 afterQaData() 会再调一次本函数，按实际题目数复核。 */
  set("nbFormula", ((window.KB_FORMULA||[]).reduce((a,g)=>a+(g.items||[]).length,0) + (window.KB_UNIT||[]).reduce((a,g)=>a+(g.items||[]).length,0)) + " 条");
  set("nbTpl", (window.KB_TEMPLATE||[]).length + " 份");
  set("nbCompare", KB_ITEMS.length + " 条");
  set("nbFav", favCount() + " 条");
}
initBadges();
syncCounts();;

// 参考图库筛选
document.getElementById("gwCat").addEventListener("change", ()=>resetGallery());
document.getElementById("gwSearch").addEventListener("input", ()=>resetGallery());
// 加载更多
document.getElementById("gwBody").addEventListener("click", e=>{
  if(e.target.closest("#gwMore")){ gwLimit += 60; renderGallery(); }
});

// 实战宝典搜索
document.getElementById("fieldSearch").addEventListener("input", renderField);

// 详情面板区块跳转
document.getElementById("dpAnchors").addEventListener("click", e=>{
  const b = e.target.closest("[data-sec]"); if(!b) return;
  const sec = document.getElementById(b.dataset.sec); if(!sec) return;
  const body = document.getElementById("dpBody");
  const top = body.scrollTop + (sec.getBoundingClientRect().top - body.getBoundingClientRect().top) - 8;
  try{
    if(typeof body.scrollTo === "function") body.scrollTo({top: Math.max(0, top), behavior:"smooth"});
    else body.scrollTop = Math.max(0, top);
  }catch(err){ body.scrollTop = Math.max(0, top); }
});

// 全站搜索结果 → 跳转到对应模块并带上关键词
document.getElementById("gsGroups").addEventListener("click", e=>{
  const el = e.target.closest("[data-jump]"); if(!el) return;
  const q = kw.value.trim();
  activeModule = el.dataset.jump;
  if(el.dataset.field) activeField = el.dataset.field;
  if(el.dataset.sel){ activeSel = el.dataset.sel; selCur = null; selPath = []; }
  if(el.dataset.fm) activeFm = el.dataset.fm;
  if(el.dataset.chk) activeChk = el.dataset.chk;
  if(el.dataset.tpl) activeTpl = el.dataset.tpl;
  if(el.dataset.dom){ activeDomain = el.dataset.dom; browseAll = false; kw.value = ""; }
  if(activeModule === "gloss"){ glCat = "全部"; document.getElementById("glSearch").value = q; }
  else if(activeModule === "quick"){ document.getElementById("qvSearch").value = q; }
  else if(activeModule === "field"){ document.getElementById("fieldSearch").value = q; }
  else if(activeModule === "formula"){ document.getElementById("fmSearch").value = q; }
  else if(activeModule === "qa"){
    /* 关键词落到模块搜索框；若点的是具体某一问，再把领域切到它所属的那个。
       题目 id 形如 <领域id>-<题干哈希>，领域 id 里不含连字符，所以能可靠反查。 */
    document.getElementById("qaSearch").value = q;
    const want = el.dataset.quiz;
    if(want){
      const m = qaMeta().find(x=>want.indexOf(x.id + "-") === 0);
      if(m) activeQa = m.id;
    }
  }
  renderAll();
  if(el.dataset.open){ const it = KB_ITEMS.find(x=>x.name===el.dataset.open); kw.value=""; renderAll(); if(it) openDetail(it); }
  /* 原理问答命中的是单条：直接滚到那一问，而不是回页首 */
  if(el.dataset.quiz && activeModule === "qa"){
    const card = document.querySelector('[data-qa="' + el.dataset.quiz + '"]');
    if(card && card.scrollIntoView){ card.scrollIntoView({block:"start", behavior:"smooth"}); return; }
  }
  window.scrollTo({top:0, behavior:"smooth"});
});

// 回到顶部
(function(){
  const btn = document.getElementById("toTop");
  window.addEventListener("scroll", ()=>{
    btn.style.display = (window.scrollY > 480 && !document.body.classList.contains("detail-open")) ? "flex" : "none";
  }, {passive:true});
  btn.onclick = ()=> window.scrollTo({top:0, behavior:"smooth"});
})();

// 实战宝典
document.getElementById("fieldTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-field]"); if(!b) return;
  activeField = b.dataset.field; renderField(); window.scrollTo({top:0, behavior:"smooth"});
});

// 选型决策
document.getElementById("selTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-sel]"); if(!b) return;
  activeSel = b.dataset.sel; selCur = null; selPath = [];
  renderSelect(); window.scrollTo({top:0, behavior:"smooth"});
});
document.getElementById("selBody").addEventListener("click", e=>{
  const tree = selTree(); if(!tree) return;
  if(e.target.closest("#selReset")){ selCur = tree.start; selPath = []; renderSelect(); return; }
  if(e.target.closest("#selBack")){
    const p = selPath.pop(); if(p){ selCur = p.nodeId; renderSelect(); }
    return;
  }
  const ob = e.target.closest("[data-opt]"); if(!ob) return;
  const node = tree.nodes[selCur]; if(!node || !node.opts) return;
  const o = node.opts[+ob.dataset.opt]; if(!o) return;
  selPath.push({ nodeId: selCur, ans: o.t });
  selCur = o.go;
  renderSelect();
});

// 公式速查
document.getElementById("fmTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-fm]"); if(!b) return;
  activeFm = b.dataset.fm; renderFormula();
});
document.getElementById("fmSearch").addEventListener("input", ()=>{ renderFormula(); });

/* 引导空态里的行动按钮：跳到指定模块（全局委托，元素后生成也有效） */
/* 解析展开/收起：三处调用（题库 / 每日20题 / 复习计划）共用，走全局委托 */
// 解析折叠 / 模块跳转 / 建议词：见上方 CLICK_RULES

navbar.addEventListener("click", e=>{
  const b = e.target.closest(".nav-tab:not(.proc-tab)"); if(!b) return;   // 工艺行有自己的处理器
  activeModule = b.dataset.mod;
  window.scrollTo({top:0, behavior:"smooth"});
  renderAll();
});

document.getElementById("qvTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-qv]"); if(!b) return;
  activeQuick = b.dataset.qv; renderQuick();
});
document.getElementById("qvSearch").addEventListener("input", ()=>{ renderQuick(); });

document.getElementById("caseTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-case]"); if(!b) return;
  activeCase = b.dataset.case; renderCases();
  window.scrollTo({top:0, behavior:"smooth"});
});

document.getElementById("chkSum").addEventListener("click", e=>{
  const b = e.target.closest("[data-chk]"); if(!b) return;
  activeChk = b.dataset.chk; renderChecks();
});
document.getElementById("chkBody").addEventListener("click", e=>{
  const it = e.target.closest("[data-ck]"); if(!it) return;
  const parts = it.dataset.ck.split("|");
  const id = parts[0], g = +parts[1], i = +parts[2];
  chkSet(id, g, i, !chkOn(id,g,i));
  renderChecks();
});
document.getElementById("chkReset").onclick = ()=>{
  const c = KB_CHECKS.find(x=>x.id===activeChk); if(!c) return;
  c.groups.forEach((g,gi)=>g.items.forEach((it,ii)=>chkSet(c.id,gi,ii,false)));
  renderChecks();
};
document.getElementById("chkPrint").onclick = ()=>{ window.print(); };

document.getElementById("glChips").addEventListener("click", e=>{
  const b = e.target.closest("[data-gl]"); if(!b) return;
  glCat = b.dataset.gl; renderGloss();
});
document.getElementById("glSearch").addEventListener("input", ()=>{ renderGloss(); });

// 关联知识点 / 学习路径 标签 → 打开详情
// 关联跳转：见上方 CLICK_RULES（.rel-chip / .map-item / .cmp-name 共用）

// Esc：详情未打开时，从其他模块回到知识库（有弹窗打开时先让弹窗处理）
document.addEventListener("keydown", e=>{
  const modalOpen = ["imgModal","aiModal"].some(id=>{
    const el = document.getElementById(id); return el && el.classList.contains("open");
  });
  if(modalOpen) return;
  if(e.key === "Escape" && !document.body.classList.contains("detail-open") && activeModule !== "kb"){
    activeModule = "kb"; renderAll();
  }
});

/* ══════════ 主题切换 ══════════ */
document.getElementById("themeBtn").addEventListener("click", ()=>{
  theme = theme === "dark" ? "light" : "dark";
  lsSet(LS_THEME, theme); applyTheme();
});
document.getElementById("kbdBtn").addEventListener("click", ()=>{
  document.getElementById("kbdHint").classList.toggle("on");
});

/* ══════════ 详情面板：收藏 / 笔记跳转 / 打印 ══════════ */
document.getElementById("dpFavBtn").addEventListener("click", e=>{
  e.stopPropagation();
  if(curDetail) toggleFav(curDetail.name);
});
document.getElementById("dpNoteJump").addEventListener("click", e=>{
  e.stopPropagation();
  const sec = document.getElementById("secNote");
  const body = document.getElementById("dpBody");
  if(sec && body){
    const delta = sec.getBoundingClientRect().top - body.getBoundingClientRect().top;
    body.scrollTo({ top: body.scrollTop + delta - 8, behavior: "smooth" });
  }
  const ta = document.getElementById("dpNote"); if(ta) setTimeout(()=>ta.focus(), 320);
});
document.getElementById("dpPrintBtn").addEventListener("click", e=>{
  e.stopPropagation();
  document.body.classList.add("printing-detail");
  setTimeout(()=>{ window.print(); setTimeout(()=>document.body.classList.remove("printing-detail"), 400); }, 80);
});

/* ══════════ 实战模板交互 ══════════ */
document.getElementById("tplTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-tp]"); if(!b) return;
  activeTpl = b.dataset.tp; renderTpl(); window.scrollTo({ top:0, behavior:"smooth" });
});
function tplCollect(e){
  const el = e.target.closest("[data-tk]"); if(!el) return;
  const tag = (el.tagName || "").toUpperCase();
  tplDraft[el.dataset.tk] = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") ? el.value : el.textContent;
  clearTimeout(tplSaveTimer);
  tplSaveTimer = setTimeout(()=>lsSet(LS_TPL, tplDraft), 400);
}
document.getElementById("tplBody").addEventListener("input", tplCollect);
document.getElementById("tplBody").addEventListener("focusout", e=>{
  tplCollect(e);
  clearTimeout(tplSaveTimer);
  lsSet(LS_TPL, tplDraft);
});
document.getElementById("tplBody").addEventListener("click", e=>{
  const b = e.target.closest("[data-tact]"); if(!b) return;
  if(b.dataset.tact === "print"){ window.print(); return; }
  if(b.dataset.tact === "clear"){
    if(!confirm("确定清空这个模板里已填写的内容吗？（不影响模板本身的预设文字）")) return;
    const pre = activeTpl + "|";
    Object.keys(tplDraft).forEach(k=>{ if(k.indexOf(pre) === 0) delete tplDraft[k]; });
    lsSet(LS_TPL, tplDraft); renderTpl();
  }
});

/* ══════════ 我的收藏交互 ══════════ */
document.getElementById("favTabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-fv]"); if(!b) return;
  favTab = b.dataset.fv; renderFav();
});
document.getElementById("favBody").addEventListener("click", e=>{
  const un = e.target.closest("[data-unfav]");
  if(un){
    e.stopPropagation();
    const n = un.dataset.unfav;
    if(un.dataset.nodelete){ delete notes[n]; lsSet(LS_NOTE, notes); }
    else { delete favs[n]; lsSet(LS_FAV, favs); }
    refreshBadges(); renderFav();
    return;
  }
  const item = e.target.closest("[data-open]");
  if(item) openItemByName(item.dataset.open);
});

/* ══════════ 最近浏览 ══════════ */
// 最近浏览跳转：见上方 CLICK_RULES

/* ══════════ 搜索历史 ══════════ */
document.getElementById("searchHist").addEventListener("click", e=>{
  const c = e.target.closest("[data-shclear]");
  if(c){ searchHist = []; lsSet(LS_SEARCH, searchHist); renderSearchHist(); return; }
  const b = e.target.closest("[data-sh]");
  if(!b) return;
  kw.value = b.dataset.sh;
  kw.dispatchEvent(new Event("input", { bubbles: true }));
  hideSearchHist();
});
kw.addEventListener("focus", ()=>renderSearchHist());
kw.addEventListener("blur", ()=>setTimeout(hideSearchHist, 200));
kw.addEventListener("keydown", e=>{
  if(e.key === "Enter"){ pushSearchHist(kw.value); hideSearchHist(); }
  else if(e.key === "Escape"){ hideSearchHist(); }
});
// 点到搜索框外收起历史下拉：见上方 CLICK_RULES 末尾

/* ══════════ 键盘快捷键 ══════════ */
(function(){
  const MODS = ["kb","qa","select","formula","quick","check","tpl","case","gloss","gallery","field","fav","compare","step"];
  document.addEventListener("keydown", e=>{
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

    // ? ：快捷键提示
    if(e.key === "?" && !typing){ document.getElementById("kbdHint").classList.toggle("on"); e.preventDefault(); return; }
    // Shift + D ：切换主题
    if(e.shiftKey && (e.key === "D" || e.key === "d") && !typing){ document.getElementById("themeBtn").click(); e.preventDefault(); return; }
    // Ctrl/⌘ + K 或 / ：聚焦搜索
    if(((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) || (e.key === "/" && !typing)){
      if(activeModule !== "kb"){ activeModule = "kb"; renderAll(); }
      setTimeout(()=>{ kw.focus(); kw.select(); }, 40);
      e.preventDefault(); return;
    }
    if(typing) return;
    // Esc 已由其他监听处理；左右键翻详情
    if(document.body.classList.contains("detail-open")){
      if(e.key === "ArrowLeft"){ const b = document.getElementById("dpPrev"); if(b && !b.disabled) b.click(); }
      else if(e.key === "ArrowRight"){ const b = document.getElementById("dpNext"); if(b && !b.disabled) b.click(); }
      return;
    }
    // 数字键切模块
    if(/^[1-9]$/.test(e.key)){ const m = MODS[+e.key - 1]; if(m){ activeModule = m; renderAll(); window.scrollTo({top:0}); } }
  });
})();

/* ══════════════ 深链接：URL 直达单条内容 ══════════════
   现在只能分享首页 —— 同事想看你说的「卡扣设计」，还是得自己再搜一次。
   支持：?mod=kb&item=卡扣设计（自动切到所属领域并打开详情）
        ?mod=kb&dom=material（某个领域）
        ?mod=quick&id=thread / ?mod=case&id=xx / ?mod=tpl&id=xx
        ?mod=field&id=std / ?mod=check&id=xx / ?mod=quiz&id=material */

function deepLinkOf(){
  const p = new URLSearchParams();
  p.set("mod", activeModule);
  if(activeModule === "kb"){
    if(activeProc !== "all") p.set("proc", activeProc);
    const open = document.body.classList.contains("detail-open");
    const el = document.getElementById("dpName");
    const nm = open && el ? el.textContent.trim() : "";
    if(nm) p.set("item", nm);
    else if(!browseAll && activeDomain) p.set("dom", activeDomain);
  }
  if(activeModule === "quick" && activeQuick) p.set("id", activeQuick);
  if(activeModule === "case"  && activeCase)  p.set("id", activeCase);
  if(activeModule === "tpl"   && activeTpl)   p.set("id", activeTpl);
  if(activeModule === "check" && activeChk)   p.set("id", activeChk);
  if(activeModule === "field" && activeField) p.set("id", activeField);
  if(activeModule === "qa"    && activeQa !== "all") p.set("id", activeQa);
  return location.origin + location.pathname + "?" + p.toString();
}

function copyDeepLink(btn){
  const url = deepLinkOf();
  const done = () => {
    if(!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = "已复制链接";
    setTimeout(() => { if(btn.dataset.orig) btn.innerHTML = btn.dataset.orig; }, 1500);
  };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); }
    catch(e){ alert("复制失败，链接是：\n" + url); }
    ta.remove();
  };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(fallback);
  else fallback();
}

/* 打开带深链接的页面时直接定位过去 */
function applyDeepLink(){
  let sp;
  try { sp = new URLSearchParams(location.search); } catch(e){ return false; }
  const mod = sp.get("mod") || (sp.get("proc") ? "kb" : "");
  if(!mod) return false;
  const id = sp.get("id"), item = sp.get("item"), dom = sp.get("dom"), qid = sp.get("q");
  if(mod !== "kb" && !MOD_VIEWS[mod]) return false;   // 模块不存在（或已被裁掉）时不跳转
  const pr = sp.get("proc");                           // ?proc=sheet&dim=material 直达工艺页
  if(pr && procOf(pr)){ activeProc = pr; activeDim = sp.get("dim") || "all"; activeDomain = null; browseAll = false; lsSet(LS_PROC, pr); }
  if(mod === "kb" && dom){ activeDomain = dom; browseAll = false; }
  if(mod === "quick" && id) activeQuick = id;
  if(mod === "case"  && id) activeCase  = id;
  if(mod === "tpl"   && id) activeTpl   = id;
  if(mod === "check" && id) activeChk   = id;
  if(mod === "field" && id) activeField = id;
  if(mod === "qa"    && id) activeQa    = id;
  /* ?mod=qa&q=<题目id> 直达某一问：题目 id 形如 <领域id>-<题干哈希>，领域 id 里不含连字符 */
  if(mod === "qa" && qid){
    const m = qaMeta().find(x => qid.indexOf(x.id + "-") === 0);
    if(m){ activeQa = m.id; }
  }
  activeModule = mod;
  /* 打开单个知识点时，先把它的所属领域切过来，这样背景是正确的列表 */
  if(item){
    const it = KB_ITEMS.find(x => x.name === item);
    if(it){
      const d = CAT_DOMAIN[it.cat];
      if(d){ activeDomain = d.id; browseAll = false; activeSub = "all"; }
    }
  }
  renderAll();
  if(item) setTimeout(() => { try { openItemByName(item); } catch(e){ /* 名字对不上就不打开 */ } }, 90);
  /* 原理问答的单题直达：滚到那一问（数据可能还在按需加载，所以多等一拍） */
  if(mod === "qa" && qid){
    setTimeout(() => {
      const card = document.querySelector('[data-qa="' + qid + '"]');
      if(card && card.scrollIntoView) card.scrollIntoView({block:"start", behavior:"smooth"});
    }, 320);
    return true;
  }
  window.scrollTo(0, 0);
  return true;
}

// 深链复制 / 标疑问 / 打印 / 建议词：见上方 CLICK_RULES

/* 「标为疑问 / 搞懂了」：两个入口共用一套切换 */
function toggleDoubt(name){
  if(doubts[name]) delete doubts[name]; else doubts[name] = Date.now();
  lsSet(LS_DOUBT, doubts);
  refreshBadges();
  if(document.body.classList.contains("detail-open")) renderDpActions(KB_ITEMS.find(x=>x.name===name) || {name:name});
  if(activeModule === "fav") renderFav();
  if(activeModule === "kb") renderAll();
}
/* 详情面板里的「标疑问」按钮：面板内的元素级绑定（data-doubt 那条走 CLICK_RULES） */
document.getElementById("dpDoubt").addEventListener("click", ()=>{
  const el = document.getElementById("dpName");
  if(el && el.textContent.trim()) toggleDoubt(el.textContent.trim());
});

/* 「打印这张表」：走浏览器的打印（打印样式里已经把导航/工具栏隐藏掉）—— 见 CLICK_RULES */
renderAll();
applyDeepLink();
refreshBadges();

/* ========== 访问统计角标（不蒜子）：加载成功才显示 ========== */
// 不蒜子加载成功后再显示统计角标（加载失败则自动隐藏，不影响使用）
(function(){
  var box = document.getElementById("site-stats");
  var tries = 0;
  var timer = setInterval(function(){
    tries++;
    var uv = document.getElementById("busuanzi_value_site_uv");
    var pv = document.getElementById("busuanzi_value_site_pv");
    if(uv && pv && uv.textContent && uv.textContent !== "–"){
      box.style.display = "block";
      clearInterval(timer);
    } else if(tries > 30){ // 约15秒仍失败则放弃
      clearInterval(timer);
    }
  }, 500);
})();


/* ========== Service Worker：离线 / 弱网也能打开 ========== */
(function(){
  if(!("serviceWorker" in navigator)) return;
  // file:// 直接打开时不注册（浏览器不允许）；本地开发常用 127.0.0.1，也要放行
  var localHost = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]";
  if(location.protocol !== "https:" && !localHost) return;
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("./sw.js").catch(function(){ /* 注册失败不影响使用 */ });
  });
})();

/* ══════════ 首屏之后：用空闲时间把按需数据后台取回来 ══════════
 * 首屏 load 后 0.6s 起按 ORDER 串行预取，每取完一组再等下一次空闲。
 * 这样用户点进对应模块时数据通常已就绪，几乎看不到加载提示 ——
 * 既拿到首屏速度，又不牺牲「点进去就能用」的体验。
 *
 * ⚠️ ORDER 里刻意只有 step：原理问答那 396KB 是本站最大的一块传输，
 *    且进入该模块时会兜底等待、标签先出来、题目随后补齐，
 *    所以不预取 —— 不进这个模块的人一分带宽都不付。
 *    若要改成预取，往 ORDER 末尾加一个 "qa" 即可（它会走 afterQaData 收尾）。 */
(function preloadLazy(){
  function kick(){
    const ORDER = ["step"];
    let i = 0;
    (function next(){
      if(i >= ORDER.length) return;
      const k = ORDER[i++];
      Promise.all(LAZY_MODS[k].map(loadScript)).then(function(){
        _dataDone[k] = true;
        if(k === "qa") afterQaData();
        (window.requestIdleCallback || function(f){ setTimeout(f, 500); })(next);
      });
    })();
  }
  if(document.readyState === "complete") setTimeout(kick, 600);
  else window.addEventListener("load", function(){ setTimeout(kick, 600); });
})();
