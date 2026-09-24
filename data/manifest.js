/* ══════════════════════════════════════════════════════════════════════
 * data/manifest.js —— 内容契约（后台的全部驱动源）
 *
 * 这张清单声明「项目里有哪些内容表、长什么样、用什么编辑器、导出到哪个文件」。
 * admin.html 完全按它生成界面：加一张内容表 = 在这里加一条，后台自动出现入口，
 * 不用写任何后台代码。这是本模板可移植的关键。
 *
 * ── 一条声明的字段 ────────────────────────────────────────────────
 *   key        全局变量名（window[key]），也 write 到 file 里的表名
 *   file       导出时写回哪个文件（相对本目录）
 *   fileTitle  该文件的用途说明（写进导出文件的头注释）
 *   group      后台左侧分组：site / kb / qa / field / ref
 *   label      后台里显示的名字
 *   editor     编辑器类型：records | map | json | qa
 *   idKey      身份键字段名（默认 name）—— 改名联动与重复检测靠它
 *   fields     editor=records 时的字段契约（见 core/schema.js 顶部注释）
 *   value      editor=map 时的「值」结构描述
 *   note       给维护者看的说明，会显示在后台
 *
 * ⚠️ 改这里的 key/file 名要与实际数据文件和 index.html 的加载清单对上。
 * ══════════════════════════════════════════════════════════════════════ */
window.KB_MANIFEST = [

  /* ═══════════════ 站点配置 ═══════════════ */
  {
    key: "KB_CATS", file: "site.js", fileTitle: "站点骨架：分类 / 领域 / 领域导读",
    group: "site", label: "分类", editor: "records", idKey: "id",
    note: "知识点的分类（塑料材料 / 模具与 DFM …）。新增分类后，记得在「领域」里把它的 id 加进某个领域的 subs，否则它不会出现在任何领域下。",
    fields: [
      { key: "id",   label: "分类 id", type: "text", required: true, unique: true, max: 20, title: true, hint: "英文小写，如 mat / mold，被知识点条目的 cat 字段引用" },
      { key: "name", label: "分类名称", type: "text", required: true, max: 30 }
    ]
  },
  {
    key: "KB_DOMAINS", file: "site.js", fileTitle: "站点骨架：分类 / 领域 / 领域导读",
    group: "site", label: "领域", editor: "records", idKey: "id",
    note: "首页的知识领域（当前 21 个）。subs 决定这个领域下挂哪些分类；abilities 是「学完你能」清单。领域顺序由 app.js 的 KB_DOMAINS 数组本身决定，改顺序直接调数组。",
    fields: [
      { key: "id",        label: "领域 id", type: "text", required: true, unique: true, max: 20, title: true },
      { key: "name",      label: "领域名称", type: "text", required: true, max: 30 },
      { key: "icon",      label: "图标 svg", type: "text", hint: "整段 <svg class=ic …><use href=#i-xxx /></svg>" },
      { key: "tagline",   label: "一句话定位", type: "text", required: true, max: 60 },
      { key: "abilities", label: "学完你能（每条一行）", type: "list", required: true, minItems: 1 },
      { key: "subs",      label: "包含的分类 id（逗号分隔）", type: "tags", required: true, refList: "KB_CATS", hint: "填 KB_CATS 里的 id" }
    ]
  },
  {
    key: "KB_DOMAIN_GUIDE", file: "site.js", fileTitle: "站点骨架：分类 / 领域 / 领域导读",
    group: "site", label: "领域导读", editor: "json",
    note: "每个领域的导读长文（pos / why / map）。结构较深，用 JSON 编辑：pos=这段在流程里的位置，why=为什么重要，map=分组的知识地图。"
  },
  {
    key: "KB_PROC", file: "proc.js", fileTitle: "工艺分类框架",
    group: "site", label: "工艺", editor: "records", idKey: "id",
    note: "知识库第一级分类轴。新增工艺要同时在 index.html 的工艺筛选行加一个按钮。",
    fields: [
      { key: "id",       label: "工艺 id", type: "text", required: true, unique: true, max: 16, title: true },
      { key: "name",     label: "工艺名称", type: "text", required: true, max: 20 },
      { key: "short",    label: "简述", type: "text", required: true, max: 40 },
      { key: "desc",     label: "详细介绍", type: "textarea", required: true },
      { key: "icon",     label: "图标 svg", type: "text" },
      { key: "scenes",   label: "典型场景", type: "text", max: 80 },
      { key: "products", label: "典型产品", type: "text", max: 80 },
      { key: "cost",     label: "成本量级", type: "text", max: 80 }
    ]
  },
  {
    key: "KB_DIM", file: "proc.js", fileTitle: "工艺分类框架",
    group: "site", label: "内容维度", editor: "records", idKey: "id",
    note: "五维内容模板：材料特性 / 典型设计要点 / 常见结构形式 / 制造约束 / 缺陷规避。",
    fields: [
      { key: "id",   label: "维度 id", type: "text", required: true, unique: true, max: 16, title: true },
      { key: "name", label: "维度名称", type: "text", required: true, max: 20 }
    ]
  },
  {
    key: "KB_CAT_DIMS", file: "proc.js", fileTitle: "工艺分类框架",
    group: "site", label: "分类→维度 预填建议", editor: "map",
    value: { kind: "lines", ref: "KB_DIM" },
    note: "每个分类默认建议的维度（可多个）。新建知识点时按此预填 dims，之后每条可以各自调整——真值在条目的 dims 上，这里只是建议。",
    refKey: "KB_CATS"
  },

  /* ═══════════════ 知识库 ═══════════════ */
  {
    key: "KB_ITEMS", file: "items.js", fileTitle: "知识点条目（全部）",
    group: "kb", label: "知识点", editor: "records", idKey: "name",
    note: "知识库的主体。名字是身份键——改名时后台会提示并同步更新深度解析、关键数值、关联、一句话记忆、参考图等以名字索引的表。",
    fields: [
      { key: "name",   label: "条目名称", type: "text", required: true, unique: true, max: 40, title: true },
      { key: "cat",    label: "所属分类", type: "enum", optionsFrom: "KB_CATS", required: true },
      { key: "proc",   label: "所属工艺", type: "enum", optionsFrom: "KB_PROC", required: true,
        hint: "工艺轴的第一级归属；跨工艺通用的条目选 common" },
      { key: "dims",   label: "内容维度（可多选）", type: "tags", required: true, refList: "KB_DIM",
        hint: "填 KB_DIM 的 id：material/design/form/constraint/defect。一个条目可同时属于多个维度" },
      { key: "lv",     label: "优先级", type: "enum", required: true,
        options: [{ v: 1, label: "1 核心必会" }, { v: 2, label: "2 进阶掌握" }, { v: 3, label: "3 了解即可" }] },
      { key: "todo",   label: "待定说明", type: "text",
        hint: "内容里有无法核实的部分时填这里（例如「最小折弯半径需按供应商模具确认」）；后台可一键筛出所有待定项" },
      { key: "points", label: "核心要点", type: "textarea", required: true, hint: "用中文分号分隔的几个要点，列表页直接显示这段" },
      { key: "usage",  label: "应用场景 / 注意事项", type: "textarea", required: true },
      { key: "img",    label: "主示意图路径", type: "text", hint: "如 images/core01.jpg，留空则显示占位" },
      { key: "std",    label: "相关标准 / 手册", type: "tags",
        hint: "国标/行标编号（如 GB/T 8013）会与实战宝典的「标准清单」自动对应，显示时带出标准名称；手册写书名号（《热处理手册》）；企标写成「企标：要向供应商索取什么」。逗号或顿号分隔。⚠️ 补数据时先补这一项。" },
      { key: "imgKw",  label: "配图搜索词", type: "text" },
      { key: "imgAi",  label: "AI 出图提示词", type: "textarea" },
      { key: "videos", label: "视频参考", type: "records",
        of: [
          { key: "p", label: "平台", type: "enum", options: ["B站", "YouTube", "腾讯视频", "百度"], required: true },
          { key: "t", label: "标题", type: "text", required: true },
          { key: "u", label: "链接", type: "text", required: true }
        ] }
    ]
  },
  {
    key: "KB_DEEP", file: "items-side.js", fileTitle: "知识点的五张侧表（按条目名索引）",
    group: "kb", label: "深度解析", editor: "map",
    value: { kind: "sections", sections: [
      { k: "p", label: "核心原理" }, { k: "k", label: "关键参数与公式" }, { k: "e", label: "实战经验值" },
      { k: "f", label: "常见错误与避坑" }, { k: "s", label: "相关标准与术语" }
    ] },
    note: "每个条目的五节深度解析，键是条目名。",
    refKey: "KB_ITEMS"
  },
  {
    key: "KB_NUM", file: "items-side.js", fileTitle: "知识点的五张侧表（按条目名索引）",
    group: "kb", label: "关键经验数值", editor: "map",
    value: { kind: "lines" },
    note: "每条一行「数值 + 出处/条件」，详情面板里带序号显示。",
    refKey: "KB_ITEMS"
  },
  {
    key: "KB_REL", file: "items-side.js", fileTitle: "知识点的五张侧表（按条目名索引）",
    group: "kb", label: "关联条目", editor: "map",
    value: { kind: "lines", ref: "KB_ITEMS" },
    note: "值必须是真实存在的条目名（后台会校验；改名时也会一起同步）。",
    refKey: "KB_ITEMS"
  },
  {
    key: "KB_MEMO", file: "items-side.js", fileTitle: "知识点的五张侧表（按条目名索引）",
    group: "kb", label: "一句话记忆", editor: "map",
    value: { kind: "text" },
    refKey: "KB_ITEMS"
  },
  {
    key: "KB_TASK", file: "items-side.js", fileTitle: "知识点的五张侧表（按条目名索引）",
    group: "kb", label: "动手练习", editor: "map",
    value: { kind: "fields", fields: [
      { key: "t", label: "练习标题", type: "text", required: true },
      { key: "d", label: "练习说明", type: "textarea", required: true },
      { key: "k", label: "验收标准（每条一行）", type: "list", required: true, minItems: 1 }
    ] },
    refKey: "KB_ITEMS"
  },
  {
    key: "KB_IMG", file: "img.js", fileTitle: "参考图索引 与 场景改写表",
    group: "kb", label: "参考图", editor: "map",
    value: { kind: "list-of-fields", fields: [
      { key: "f", label: "图片路径", type: "text", required: true, hint: "如 images/ref/001_1.jpg" },
      { key: "t", label: "图注", type: "text", required: true },
      { key: "s", label: "来源", type: "text" }
    ] },
    note: "每条知识点挂的实景参考图，键是条目名。",
    refKey: "KB_ITEMS"
  },
  {
    key: "KB_USAGE", file: "img.js", fileTitle: "参考图索引 与 场景改写表",
    group: "kb", label: "应用场景（改写覆盖）", editor: "map",
    value: { kind: "text" },
    note: "内容通用化时改写过「应用场景」的条目：有值则覆盖条目自带的 usage，没有则用原文。",
    refKey: "KB_ITEMS"
  },

  /* ═══════════════ 原理问答 ═══════════════ */
  {
    key: "KB_QA", file: "__split__", fileTitle: "原理问答：题目（按领域拆分为 qa-<领域id>.js）",
    group: "qa", label: "问答题目", editor: "qa", splitBy: "domain",
    note: "题目按领域分散在 data/qa-<领域id>.js。导出时后台会按领域分别生成文件，覆盖回去即可。正确项位置必须留空、其余选项都要写「为什么不对」——后台保存时会自动把正确项那格清空。"
  },
  {
    key: "KB_QA_META", file: "qa-meta.js", fileTitle: "原理问答：领域清单",
    group: "qa", label: "问答领域", editor: "records", idKey: "id",
    note: "原理问答的 12 个领域与标签顺序。id 必须与 data/qa-<id>.js 的文件名一致。题目数 n 用于首屏角标（题目本体按需加载，不能现算），content-check 会校验它与实际题目数一致。",
    fields: [
      { key: "id",   label: "领域 id", type: "text", required: true, unique: true, max: 20, title: true, hint: "对应 data/qa-<id>.js" },
      { key: "name", label: "领域名称", type: "text", required: true, max: 20 },
      { key: "n",    label: "题目数", type: "number", required: true, hint: "该领域题目数量，改完题目同步（content-check 会校验）" },
      { key: "icon", label: "图标 svg", type: "text" }
    ]
  },

  /* ═══════════════ 实战宝典 ═══════════════ */
  {
    key: "KB_MISTAKE", file: "field.js", fileTitle: "实战宝典：避坑 / 排查 / 面试 / 标准",
    group: "field", label: "设计避坑", editor: "records", idKey: "id",
    fields: [
      { key: "id",    label: "id", type: "text", required: true, unique: true, max: 16, title: true },
      { key: "name",  label: "分组名称", type: "text", required: true },
      { key: "icon",  label: "图标 svg", type: "text" },
      { key: "desc",  label: "分组说明", type: "text" },
      { key: "items", label: "条目", type: "records", required: true, minItems: 1, of: [
        { key: "t",    label: "错误做法", type: "text", required: true },
        { key: "bad",  label: "具体怎么错的", type: "textarea", required: true },
        { key: "cost", label: "后果", type: "textarea", required: true },
        { key: "good", label: "正确做法", type: "textarea", required: true },
        { key: "how",  label: "怎么自查", type: "textarea", required: true },
        { key: "ref",  label: "关联条目", type: "tags", refList: "KB_ITEMS" }
      ] }
    ]
  },
  {
    key: "KB_TROUBLE", file: "field.js", fileTitle: "实战宝典：避坑 / 排查 / 面试 / 标准",
    group: "field", label: "缺陷排查", editor: "records", idKey: "id",
    fields: [
      { key: "id",    label: "id", type: "text", required: true, unique: true, max: 16, title: true },
      { key: "name",  label: "分组名称", type: "text", required: true },
      { key: "icon",  label: "图标 svg", type: "text" },
      { key: "desc",  label: "分组说明", type: "text" },
      { key: "items", label: "条目", type: "records", required: true, minItems: 1, of: [
        { key: "s", label: "现象", type: "text", required: true, title: true },
        { key: "c", label: "可能原因（每条一行）", type: "list", required: true, minItems: 1 },
        { key: "f", label: "对策（每条一行）", type: "list", required: true, minItems: 1 },
        { key: "v", label: "怎么验证", type: "textarea", required: true }
      ] }
    ]
  },
  {
    key: "KB_INTERVIEW", file: "field.js", fileTitle: "实战宝典：避坑 / 排查 / 面试 / 标准",
    group: "field", label: "面试题库", editor: "records", idKey: "cat",
    fields: [
      { key: "cat",   label: "主题", type: "text", required: true, title: true },
      { key: "icon",  label: "图标 svg", type: "text" },
      { key: "items", label: "题目", type: "records", required: true, minItems: 1, of: [
        { key: "q",   label: "问题", type: "textarea", required: true },
        { key: "tag", label: "难度标记", type: "enum", options: ["核心", "进阶", "加分"], required: true },
        { key: "a",   label: "回答要点（每条一行）", type: "list", required: true, minItems: 1 }
      ] }
    ]
  },
  {
    key: "KB_STD", file: "field.js", fileTitle: "实战宝典：避坑 / 排查 / 面试 / 标准",
    group: "field", label: "标准清单", editor: "records", idKey: "cat",
    fields: [
      { key: "cat",   label: "主题", type: "text", required: true, title: true },
      { key: "icon",  label: "图标 svg", type: "text" },
      { key: "items", label: "标准", type: "records", required: true, minItems: 1, of: [
        { key: "code", label: "标准号", type: "text", required: true, title: true },
        { key: "name", label: "名称", type: "text", required: true },
        { key: "note", label: "说明 / 用途", type: "textarea", required: true }
      ] }
    ]
  },

  /* ═══════════════ 参考工具 ═══════════════ */
  {
    key: "KB_GLOSS", file: "gloss.js", fileTitle: "术语词典 与 实际用法",
    group: "ref", label: "术语词典", editor: "records", idKey: "en",
    note: "英文缩写是身份键（实际用法表按它索引）。术语也会自动并入搜索同义词。",
    fields: [
      { key: "en", label: "英文 / 缩写", type: "text", required: true, unique: true, max: 40, title: true },
      { key: "cn", label: "中文名", type: "text", required: true, max: 60 },
      { key: "c",  label: "分类", type: "text", required: true, max: 20 },
      { key: "d",  label: "解释", type: "textarea", required: true }
    ]
  },
  {
    key: "KB_GLOSS_USE", file: "gloss.js", fileTitle: "术语词典 与 实际用法",
    group: "ref", label: "术语实际用法", editor: "map",
    value: { kind: "text" },
    note: "键是术语的英文/缩写，值是一段「在项目里怎么用」的说明。",
    refKey: "KB_GLOSS", refKeyField: "en"
  },
  {
    key: "KB_CHANGELOG", file: "changelog.js", fileTitle: "更新日志",
    group: "ref", label: "更新日志", editor: "records", idKey: "d",
    fields: [
      { key: "d",     label: "日期", type: "text", required: true, title: true, hint: "YYYY-MM-DD" },
      { key: "t",     label: "标题", type: "text", required: true },
      { key: "items", label: "改动条目（每条一行）", type: "list", required: true, minItems: 1 }
    ]
  },
  {
    key: "KB_QUICK", file: "tools.js", fileTitle: "速查手册 与 检查清单",
    group: "ref", label: "速查手册", editor: "json",
    note: "每张表是「表头 cols + 二维数组 rows」。结构规整但没有行内 schema，用 JSON 编辑更直观；改完点「校验」会检查 rows 与 cols 的列数是否一致。"
  },
  {
    key: "KB_QUICK_ADD", file: "tools.js", fileTitle: "速查手册 与 检查清单",
    group: "ref", label: "速查表补充行", editor: "json",
    note: "按工艺追加到速查表的行，键是表 id。"
  },
  {
    key: "KB_CHECKS", file: "tools.js", fileTitle: "速查手册 与 检查清单",
    group: "ref", label: "检查清单", editor: "json",
    note: "开模前逐项核对清单，含分组与勾选项。"
  },
  {
    key: "KB_FORMULA", file: "formula.js", fileTitle: "公式与单位",
    group: "ref", label: "公式", editor: "json",
    note: "每个分类下是公式条目（名称 / 表达式 / 变量说明 / 适用场合）。"
  },
  {
    key: "KB_UNIT", file: "formula.js", fileTitle: "公式与单位",
    group: "ref", label: "单位换算", editor: "json"
  },
  {
    key: "KB_CASES", file: "cases.js", fileTitle: "整机案例 与 DFM 检讨",
    group: "ref", label: "整机案例", editor: "json",
    note: "整机拆解：组成 / 规格 / 流程 / 问题与对策 / 成本。层数较深，用 JSON 编辑。"
  },
  {
    key: "KB_CASE_DFM", file: "cases.js", fileTitle: "整机案例 与 DFM 检讨",
    group: "ref", label: "案例 DFM 检讨", editor: "json",
    note: "键是案例 id，值是「问题 / 对策 / 结果」列表。"
  },
  {
    key: "KB_SELECT", file: "select.js", fileTitle: "选型决策树",
    group: "ref", label: "选型决策", editor: "json",
    note: "决策树节点：每个节点是问题 + 选项 + 跳转。用 JSON 编辑，改完点「校验」会检查 go 指向的节点是否存在。"
  },
  {
    key: "KB_TEMPLATE", file: "template.js", fileTitle: "实战模板",
    group: "ref", label: "实战模板", editor: "json",
    note: "带表单字段的模板（NPI 流程 / DFM 检讨表）。"
  },
  {
    key: "KB_MAP", file: "map.js", fileTitle: "学习地图",
    group: "ref", label: "学习地图", editor: "json",
    note: "按层组织的学习路径，每层下是知识点条目与「为什么学」。"
  },
  {
    key: "KB_MAP_CAP", file: "map.js", fileTitle: "学习地图",
    group: "ref", label: "学习地图·学完你能", editor: "map",
    value: { kind: "text" },
    note: "键是「领域id|层序号」，值是一句「这一层学完你能做到什么」。"
  },
  {
    key: "KB_SYN", file: "syn.js", fileTitle: "搜索同义词",
    group: "ref", label: "搜索同义词", editor: "json",
    note: "同义词组，每组至少两个词（英文与中文同行）。术语词典的英中对照已在整合时并入这里。"
  },
  {
    key: "KB_STEP", file: "step.js", fileTitle: "STEP 成本评估数据",
    group: "ref", label: "成本评估参数", editor: "json",
    note: "STEP 模块用的材料单价、机时费、钢材、精度与表面处理档位。"
  }
];
