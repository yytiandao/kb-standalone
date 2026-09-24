# AGENTS.md —— 给 AI 维护工具的项目说明（人也能看）

结构工程师知识库：纯静态站点（无后端、零依赖），线上 <https://yytiandao.github.io/kb-standalone/>。
数据 = `data/*.js` 里的一批 `window.KB_*` 全局变量；页面逻辑 `app.js`；后台 `admin.html`（已上线，登录+PAT 发布）。

## 数据模型（34 张表，契约在 data/manifest.js）

| 组 | 表 | 说明 |
|---|---|---|
| site | KB_CATS / KB_DOMAINS / KB_DOMAIN_GUIDE / KB_PROC / KB_DIM / KB_CAT_DIMS | 分类、21 领域、领域导读、11 工艺、五维、分类预填 |
| kb | **KB_ITEMS**（438 条，身份键 = `name`）/ KB_DEEP / KB_NUM / KB_REL / KB_MEMO / KB_TASK / KB_IMG / KB_USAGE | 后六张是**以条目名为键的侧表**，与条目一一联结 |
| qa | KB_QA（按领域拆成 `qa-<domain>.js`，`KB_QA["domain"]=[]`）/ KB_QA_META | 432 题 |
| field | KB_MISTAKE / KB_TROUBLE / KB_INTERVIEW / **KB_STD** | 实战宝典 + 标准清单 |
| ref | KB_GLOSS / KB_GLOSS_USE / KB_CHANGELOG / KB_QUICK(+ADD) / KB_CHECKS / KB_FORMULA / KB_UNIT / KB_CASES(+DFM) / KB_SELECT / KB_TEMPLATE / KB_SYN / KB_STEP | 词典、更新日志、速查、公式、案例等 |

## 查询：先查后改，别整读大文件

`node kb.js` 是查询 CLI（`items-side.js` 1.4MB，直接读会撑爆上下文）：

```
node kb.js stats                # 各表条数
node kb.js schema KB_ITEMS      # 某表字段契约（不带表名=全部）
node kb.js search 脱模          # 跨表搜索（条目/术语/标准/问答）
node kb.js get ABS              # 条目全量视图（本体+六张侧表联结）
node kb.js qa material 5        # 看某领域题目
```

## 编辑规则（content-check 会拦，别踩）

1. **条目 `name` 是身份键**：重名会被拦；改名要联动六张侧表的键与 KB_REL 里的引用值。
2. **`std` 字段**：国标/行标写标准号且必须能在 KB_STD（field.js）查到名称——**新增引用的标准号要同时补进 KB_STD**；手册写书名（如《热处理手册》）；企标写「企标：要向供应商索取什么判据」。不确定的编号宁可不写，编错比不写更糟。
3. **跨工艺重复主题**改条目的 `proc` 归属，不要复制一份。
4. **数据文件会被 admin 后台整体重写**：新增字段必须同时写进 manifest 契约，否则一导出就丢。
5. **数字现算**：页面计数用 `data-cnt` 自动校正，不要写死；只有 index.html 的 meta/og 描述需随内容手改（SEO 要静态值）。
6. **内容改动在 KB_CHANGELOG 加一条**（数组最前面）。

## 必跑命令

```
node content-check.js     # 全量校验（契约+引用+QA 规则+vendor 哈希），改完必跑
node qa-check.js          # 只改问答时
node release.js check     # 发布前资源完整性
```

## 新增工艺（KB_PROC）五件套

`data/proc.js` 加一条 → `index.html` 工艺行加按钮 → `app.js` 的 `PROC_DC`/`PROC_SHORT` 补映射 → 一个 `i-proc-*` 图标 svg（index.html symbol 库）→ admin 无需改（manifest 驱动）。

## 发布

- **线上后台**：admin.html 登录 → 改 → 「发布上线」（自动过 validateAll 门禁 → Git API 提交 → Actions 构建，约 2 分钟上线）
- **本地**：改 → content-check → `git push`；**线上发布过之后本地先 `git pull`**
- Actions 失败不部署坏内容；去 Actions 页看日志修复即可

详细部署：`deploy/DEPLOY.md`
