# 结构工程师知识库（kb-standalone）

面向通用机械与产品结构设计的在线知识库：**438 条知识点 · 21 个知识领域 × 11 种工艺 · 814 张实景参考图 · 432 道自测题**，从选材到量产成本，一条一条讲透。

**在线使用：<https://yytiandao.github.io/kb-standalone/>**（纯静态站点，支持手机访问，可在浏览器中「安装」为应用离线使用）

## 内容组织

- **双轴导航**：按「工艺」（注塑 / 钣金 / 压铸铝 / 挤压型材 / 后加工 / 打样 / 装配 / 五金 / 玻璃 / 电子装配…）与「知识领域」（材料、DFM、传动、密封、散热、光学、安规、成本…）两条轴查阅
- **参考工具**：公式速查、速查手册、检查清单、实战模板、整机案例、术语词典、选型决策树
- **实战宝典**：设计避坑、缺陷排查、面试题、标准清单
- **STEP 成本评估**：上传 STEP 装配体本地解析（WebAssembly，文件不上传服务器）
- 收藏 / 笔记 / 学习进度保存在本机浏览器

## 本地开发与维护

零依赖，只需要 [Node.js](https://nodejs.org/)：

```bash
node serve.js          # 本地预览 http://127.0.0.1:8124
node content-check.js  # 内容门禁（改数据后必跑）
node release.js build  # 生成 dist/ 生产目录
node kb.js --help      # 查询 CLI：stats / schema / search / get / qa（AI 维护工具入口）
```

- 数据在 `data/*.js`（内容与代码分离），可用 `admin.html` 后台编辑后导出替换
- 发布上线：push 到 main 即自动构建并发布到 GitHub Pages，流程见 [deploy/DEPLOY.md](deploy/DEPLOY.md)

## 致谢

本项目基于开源项目 [zjf030210/structure-eng-kb](https://github.com/zjf030210/structure-eng-kb)（结构工程师知识库）二次开发扩展而来，在其基础上重构为多工艺通用版本。感谢原作者的开放与分享。

STEP 在线解析能力使用 [occt-import-js](https://github.com/kovacsv/occt-import-js)（基于 Open CASCADE Technology）。
