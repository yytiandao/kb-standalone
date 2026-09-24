/* proc.js  —— 工艺分类框架
 * 由 admin.html 导出生成；包含的表: KB_PROC, KB_DIM, KB_CAT_DIMS
 * 手改也欢迎，格式就是 window.<表名> = <JSON>; */

window.KB_PROC = [
 {
  "id": "inj",
  "name": "塑料成型",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-inj /></svg>",
  "short": "注塑 · 挤出 · 硅胶模压",
  "desc": "以模具成型的聚合物制件：注塑为主体，覆盖挤出、吹塑、搪胶、硅胶模压等衍生路线。壁厚自由度大、造型能力强、单件成本低，适合量大与复杂曲面。",
  "scenes": "外观件 / 透光件 / 绝缘件 / 中小结构件",
  "products": "灯具外壳、扩散罩、按键、装饰件",
  "cost": "注塑模具 1.5–15 万，单件 0.3–20 元（量大摊薄后极低）"
 },
 {
  "id": "sheet",
  "name": "钣金冲压",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-sheet /></svg>",
  "short": "冲裁 · 折弯 · 拉深 · 压铆",
  "desc": "金属板材的冷加工：激光/冲裁下料后折弯成型，配合拉深、翻边、压铆、焊接成壳体或支架。强度刚度好、料厚 0.5–3.0mm，改型快，中小批量也能接受。",
  "scenes": "支架 / 外壳 / 屏蔽件 / 弹片",
  "products": "安装支架、设备外壳、电池仓、弹簧接触片",
  "cost": "折弯/冲压模 0.1–2 万，单件 1–30 元（激光切可免开模）"
 },
 {
  "id": "diecast",
  "name": "压铸铝",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-diecast /></svg>",
  "short": "ADC12 · A380 高压铸造",
  "desc": "熔融铝合金高压注入金属模腔，一次成型复杂三维结构。散热好、刚性强、可做屏蔽腔体，适合中等批量、承载与散热要求高的部件。",
  "scenes": "散热灯体 / 承重支架 / 屏蔽腔",
  "products": "轨道射灯灯体、电源盒、马达壳、结构件",
  "cost": "压铸模 3–20 万，单件 3–40 元（含后处理）"
 },
 {
  "id": "extrude",
  "name": "挤压铝型材",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-extrude /></svg>",
  "short": "6063-T5 · 6061-T6 挤出",
  "desc": "铝锭加热后经模孔连续挤出等截面型材（行业俗称拉伸铝），再切割、加工、阳极氧化。截面可内嵌灯槽/卡槽/散热鳍片，长度任意，模具费远低于注塑与压铸。",
  "scenes": "线性灯具 / 散热结构 / 框架导轨",
  "products": "灯条型材、日光灯管外壳、屏风龙骨、设备框架",
  "cost": "挤型模 0.3–1.5 万，按公斤计价（约 25–45 元/kg 含氧化）"
 },
 {
  "id": "post",
  "name": "后加工工艺",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-post /></svg>",
  "short": "阳极氧化 · 喷涂 · 攻丝 · 压铆 · 热处理",
  "desc": "零件成型之后的二次加工：表面处理（阳极氧化、电镀、喷涂、丝印…）、机加工（攻丝、铣削、去毛刺倒角）、装配性加工（压铆螺母/螺柱、拉铆）与热处理（去应力、淬火回火、时效）。它决定外观、耐磨耐蚀、螺纹强度与尺寸稳定性，也是最容易漏算工序与成本的一段 —— 膜厚要计入公差、螺纹要遮蔽、热处理会影响尺寸。",
  "scenes": "外观件 / 螺纹连接 / 耐磨耐蚀 / 尺寸稳定",
  "products": "阳极氧化灯体、喷涂外壳、压铆螺母支架、热处理轴销",
  "cost": "按件或按面积：阳极氧化 3–15 元/件、喷涂 2–10 元/件、攻丝 0.2–1 元/孔、热处理 5–20 元/kg（含最小收费）"
 },
 {
  "id": "proto",
  "name": "打样与快速成型",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-proto /></svg>",
  "short": "3D 打印 · CNC 手板 · 复模 · 快模",
  "desc": "把图纸变成实物、拿到手里验证的那一段：3D 打印（SLA / SLS / FDM）、CNC 手板、真空复模、快模注塑与试模，以及手板的外观确认、试装配与强度验证。手板是改结构最便宜的机会 —— 改图纸几乎免费，改模具是几万元，所以「先手板后开模」是默认路线。",
  "scenes": "外观确认 / 功能验证 / 小批量试产",
  "products": "外观手板、功能手板、复模小批量件、快模试产件",
  "cost": "3D 打印 50–800 元/件、CNC 手板 200–2000 元/套、复模 500–3000 元/套模、快模 0.5–3 万元"
 },
 {
  "id": "assy",
  "name": "装配工艺",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-assy /></svg>",
  "short": "超声焊接 · 热熔嵌件 · 点胶灌封 · 螺纹紧固",
  "desc": "把零件装成整机的工艺：超声焊接、热熔/热铆、热熔螺母与嵌件、点胶与灌封、螺纹紧固与防松、密封与防水装配，以及装配顺序、防错与气密验证。装配决定了「设计意图能不能落地」：公差叠加、浮动量、防呆与可维修性都要在这一层收口。",
  "scenes": "整机装配 / 密封防水 / 可维修性",
  "products": "灯具整机、电源仓灌封件、防水结构件、卡扣装配件",
  "cost": "超声焊接 0.2–1 元/件、热熔嵌件 0.1–0.5 元/件、点胶灌封按胶量与工时计"
 },
 {
  "id": "hw",
  "name": "五金与弹簧",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-hw /></svg>",
  "short": "弹簧 · 线材 · 车件 · 冲压五金",
  "desc": "标准件之外的五金件：弹簧（压缩 / 拉伸 / 扭转 / 卡簧）、线材折弯成型、车削件（轴 / 衬套 / 销）、冲压五金（弹片 / 卡箍）及其表面处理与配合。它们多半不开模、按标准或图纸采购，但选型、固定方式与疲劳寿命直接决定结构的可靠性与手感。",
  "scenes": "弹性件 / 导向定位 / 导电接触",
  "products": "弹簧卡扣、接触弹片、轴销衬套、线材卡箍",
  "cost": "弹簧 0.05–2 元/件、车件 1–20 元/件、冲压五金 0.1–3 元/件"
 },
 {
  "id": "glass",
  "name": "玻璃件成型",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-glass /></svg>",
  "short": "吹制 · 压制 · 钢化 · 磨砂丝印",
  "desc": "玻璃件：吹制 / 压制 / 离心成型的选择、壁厚与圆角设计、钢化与安全要求、与金属或塑料的装配（缓冲与热胀冷缩）、磨砂与高温丝印，以及运输破损控制。玻璃件不可返修、破损率高，设计必须把成型、装配与包装一起考虑。",
  "scenes": "灯罩 / 面板 / 装饰件",
  "products": "球泡灯罩、玻璃面板、装饰玻璃、钢化视窗",
  "cost": "压制模 1–5 万、吹制模 0.5–3 万，单件 2–30 元（含钢化与丝印）"
 },
 {
  "id": "elec",
  "name": "电子装配",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-elec /></svg>",
  "short": "PCBA · 线束 · 驱动电源 · 焊接",
  "desc": "电气部分的工艺：PCBA（SMT / 插件 / 波峰焊 / 手工焊）、线束与端子压接、连接器与线对板、驱动电源的固定与导热、电缆入口与防水接头、ESD 与接地要求。结构工程师不必会焊板，但必须知道 PCB 怎么固定、元件高度与散热间距、走线空间与接地怎么留。",
  "scenes": "驱动电源 / 控制板 / 线束连接",
  "products": "驱动板固定、电源仓、线束与端子、按键板",
  "cost": "SMT 打样 200–800 元/款（钢网另计）、线束 1–10 元/套、手工焊 0.5–3 元/点"
 },
 {
  "id": "common",
  "name": "跨工艺通用",
  "icon": "<svg class=ic aria-hidden=true><use href=#i-proc-common /></svg>",
  "short": "安规 · 测试 · 公差 · 包装 · 成本",
  "desc": "不分工艺都要遵守的内容：安规认证、可靠性测试、公差与制图、包装运输、成本方法。以视角聚合现有条目，任何工艺视角下都可跳转查阅。",
  "scenes": "所有产品的共同要求",
  "products": "认证资料、测试计划、图纸规范",
  "cost": "—"
 }
];

window.KB_DIM = [
 {
  "id": "material",
  "name": "材料特性"
 },
 {
  "id": "design",
  "name": "典型设计要点"
 },
 {
  "id": "form",
  "name": "常见结构形式"
 },
 {
  "id": "constraint",
  "name": "制造约束与注意事项"
 },
 {
  "id": "defect",
  "name": "常见设计缺陷与规避"
 }
];

window.KB_CAT_DIMS = {
 "mat": [
  "material"
 ],
 "metal": [
  "material"
 ],
 "proc": [
  "design"
 ],
 "thermal": [
  "design"
 ],
 "optic": [
  "design"
 ],
 "struct": [
  "form"
 ],
 "fasten": [
  "form"
 ],
 "mold": [
  "constraint"
 ],
 "sf": [
  "constraint"
 ],
 "post": [
  "constraint"
 ],
 "drawing": [
  "constraint"
 ],
 "test": [
  "constraint",
  "defect"
 ],
 "safety": [
  "constraint"
 ],
 "pack": [
  "constraint"
 ],
 "cost": [
  "constraint"
 ],
 "sheet": [
  "design"
 ],
 "mech": [
  "design",
  "form"
 ],
 "strength": [
  "design",
  "constraint"
 ],
 "weld": [
  "design",
  "constraint"
 ],
 "seal": [
  "design",
  "constraint"
 ],
 "env": [
  "material",
  "defect"
 ],
 "ergo": [
  "design",
  "constraint"
 ],
 "elec": [
  "design",
  "form"
 ],
 "quality": [
  "constraint",
  "defect"
 ],
 "flow": [
  "constraint"
 ]
};
