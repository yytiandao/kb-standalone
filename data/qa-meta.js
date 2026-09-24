/* qa-meta.js —— 原理问答：领域清单
 * 由 data/manifest.js 登记；后台（admin.html）改内容后导出会整体重写本文件，手改也欢迎。
 * 包含的表: KB_QA_META
 *
 * n = 该领域题目数。题目本体在 data/qa-<id>.js 里按需加载（396KB，不进首屏），
 * 但导航角标「原理问答 432 问」要在首屏就显示真实数字，所以题数随这份清单立即加载。
 * 增删题目后记得同步 n —— 跑一次 node content-check.js 会直接报出哪个领域对不上。 */

window.KB_QA_META = [
 {
  "id": "material",
  "name": "塑料材料",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-layers /></svg>"
 },
 {
  "id": "manufacturing",
  "name": "成型工艺",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-factory /></svg>"
 },
 {
  "id": "mold",
  "name": "模具与DFM",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-mold /></svg>"
 },
 {
  "id": "design",
  "name": "结构设计",
  "n": 43,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-grid /></svg>"
 },
 {
  "id": "drawing",
  "name": "制图与公差",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-ruler /></svg>"
 },
 {
  "id": "surface",
  "name": "表面处理",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-brush /></svg>"
 },
 {
  "id": "optic",
  "name": "光学结构",
  "n": 36,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-bulb /></svg>"
 },
 {
  "id": "thermal",
  "name": "散热设计",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-flame /></svg>"
 },
 {
  "id": "safety",
  "name": "安规认证",
  "n": 38,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-shield /></svg>"
 },
 {
  "id": "test",
  "name": "可靠性测试",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-flask /></svg>"
 },
 {
  "id": "pack",
  "name": "包装与运输",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-box /></svg>"
 },
 {
  "id": "cost",
  "name": "成本与量产",
  "n": 35,
  "icon": "<svg class=ic aria-hidden=true><use href=#i-tag /></svg>"
 }
];
