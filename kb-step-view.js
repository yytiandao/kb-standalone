/* ============================================================
 * kb-step-view.js —— STEP 成本评估的界面层
 *
 * 三块内容：
 *   ① 极简 WebGL 查看器（自写，不依赖 three.js —— 保持离线可用、零外部依赖）
 *      · 正交于项目的既有决策：统计图表也是手绘 SVG，同样不引图表库
 *      · 拖拽旋转 / 滚轮缩放 / 点击拾取（颜色编码渲染到离屏缓冲再读像素）
 *   ② STEP 解析：官方 Worker + WASM，主线程不卡顿
 *   ③ 界面：装配树（按零件选材料）、成本卡、AI 提示词、CSV 导出
 * ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var S = window.KB_STEP;

  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ══════════════ ⓪ 模型层（几何 / 模具 / 成本）══════════════
   * data/step.js 只放数据（后台导出会整体重写该文件），全部计算函数都在这里
   * 启动时挂到 window.KB_STEP 上 —— 数据与逻辑分离后，后台改数据不会再冲掉函数。 */
  var MOLD_COEF = {   // 材料锁模系数（t/cm²）
    abs: 0.35, pcabs: 0.38, pc: 0.40, pcfr: 0.40, pmma: 0.40, pp: 0.35,
    pom: 0.40, pa6: 0.40, hips: 0.32, petg: 0.38, tpu: 0.30, silic: 0.30,
    pvc: 0.35, epoxy: 0.40, al: 0.50, pcb: 0, none: 0
  };
  /* 注塑机机时费（含人工/电费/折旧的参考值） */
  var RATE_TABLE = [[80, 35], [150, 45], [250, 60], [400, 80], [650, 110], [Infinity, 160]];
  /* 默认材料猜测：按零件名关键词给一个合理初值 */
  var GUESS = [
    [/罩|lens|cover|shade|diffus|透光|灯罩|pc(?!b)/i, "pc"],
    [/导光|light.?guide|lgp|pmma|亚克力/i, "pmma"],
    [/电源|driver|psu|适配器|adapter/i, "pcfr"],
    [/壳|housing|case|body|enclosur|上盖|下盖|底壳|面盖/i, "abs"],
    [/外观|panel|装饰|decor|面壳|前盖/i, "pcabs"],
    [/卡扣|clip|snap|gear|齿轮|滑块|buckle/i, "pom"],
    [/支架|bracket|holder|frame|骨架|底座|base/i, "pp"],
    [/密封|seal|gasket|o.?ring|圈|垫/i, "silic"],
    [/硅胶|silicone|柔光|软/i, "tpu"],
    [/散热|heat.?sink|铝|alumin/i, "al"],
    [/pcb|板|board|电路/i, "pcb"],
    [/螺丝|screw|螺栓|bolt|螺母|标准件|磁铁|magnet|弹簧|spring/i, "none"]
  ];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  /* 单价库取值：优先用用户在「单价库」里改过的值（window.KB_WS 来自 kb-workspace.js），
     没改过就沿用数据文件里的行业参考值 */
  function WS() { return window.KB_WS; }
  function pMat(m) { var w = WS(); return w ? w.matPrice(m.id, m.p) : m.p; }
  function pDen(m) { var w = WS(); return w ? w.matDensity(m.id, m.d) : m.d; }
  function pTool(key, dft) { var w = WS(); return w && w.toolOf ? w.toolOf(key, dft) : dft; }
  function moldCoefOf(matId) {
    var v = MOLD_COEF[matId];
    return v === undefined ? 0.38 : v;
  }
  function machineRate(tonnage) {
    var w = WS();
    if (w && w.rateTable) {
      var t = w.rateTable();
      for (var j = 0; j < t.length; j++) if (tonnage <= t[j].cap) return t[j].v;
      return t.length ? t[t.length - 1].v : 160;
    }
    for (var i = 0; i < RATE_TABLE.length; i++) if (tonnage <= RATE_TABLE[i][0]) return RATE_TABLE[i][1];
    return 160;
  }
  function guessMat(name) {
    var s = String(name || "");
    for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(s)) return GUESS[i][1];
    return "abs";
  }
  function matById(id) {
    for (var i = 0; i < S.MATS.length; i++) if (S.MATS[i].id === id) return S.MATS[i];
    return S.MATS[0];
  }

  /* ── 几何量：从三角网格算体积 / 表面积 / 包围盒 ── */
  function meshStats(mesh) {
    var pos = mesh.attributes.position.array;
    var idx = mesh.index.array;
    var vol = 0, area = 0, tris = idx.length / 3;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    var i, k;
    for (i = 0; i < pos.length; i += 3) {
      for (k = 0; k < 3; k++) {
        var x = pos[i + k];
        if (x < mn[k]) mn[k] = x;
        if (x > mx[k]) mx[k] = x;
      }
    }
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      var ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      var bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
      var cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    for (k = 0; k < 3; k++) if (!isFinite(mn[k])) { mn[k] = 0; mx[k] = 0; }
    return {
      vol: Math.abs(vol), area: area, tris: tris,
      min: mn, max: mx,
      dim: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
    };
  }

  /* ── 装配层级 → 扁平零件表（每个挂 mesh 的节点算一个「零件」，保留层级路径）── */
  function flatten(root, meshes) {
    var parts = [], tree = [];
    (function walk(node, depth, path, sibTag) {
      if (!node) return;
      var name = String(node.name || "").trim();
      var label = name + (sibTag || "");
      var here = label ? path.concat([label]) : path;
      var mine = (node.meshes || []).filter(function (i) { return meshes[i]; });
      var nodeId = tree.length;
      tree.push({ id: nodeId, depth: depth, name: label || "(未命名)", path: here.join(" / "), isPart: mine.length > 0 });
      if (mine.length) {
        for (var i = 0; i < mine.length; i++) {
          var m = meshes[mine[i]];
          var stt = m.stats;
          /* 零件名带上节点的实例号：同名装配节点各挂多个 mesh 时，
             只用「节点名 + 序号」会与另一个同名节点的零件完全撞名 */
          var pname = (name || m.name || "零件") + (sibTag || "")
                    + (mine.length > 1 ? " · " + (i + 1) : "");
          parts.push({
            id: parts.length,
            nodeId: nodeId,
            depth: depth,
            path: here.join(" / "),
            name: pname,
            rawName: m.name || name || "",
            vol: stt.vol, area: stt.area, tris: stt.tris, dim: stt.dim,
            min: stt.min, max: stt.max,        // 自身包围盒的角点（原始坐标，3D 画线框用）
            mat: guessMat(name + " " + (m.name || "")),
            on: true,
            /* 模具与工艺配置（默认按体积给一个合理初值，可在界面上逐项改） */
            tool: {
              cav: stt.vol / 1000 < 5 ? 4 : (stt.vol / 1000 < 50 ? 2 : 1),
              slides: 0,          // 滑块 / 行位数量
              lifters: 0,         // 斜顶数量
              runner: "cold",     // 浇口类型
              steel: "p20",       // 钢材等级
              precision: "normal",// 精度等级
              finish: "normal",   // 表面要求
              post: 0,            // 二次加工 / 表面处理费（元/件）
              moldId: null,       // 共模组 id：同一 id 的零件拼在一套模具里（null = 独立开模）
              quote: null         // 若填了模具厂实际报价，则覆盖估算
            }
          });
        }
      }
      var ch = node.children || [];
      var cnt = {}, seq = {}, j;
      for (j = 0; j < ch.length; j++) {
        var kn = String(ch[j].name || "").trim();
        cnt[kn] = (cnt[kn] || 0) + 1;
      }
      for (j = 0; j < ch.length; j++) {
        var kn2 = String(ch[j].name || "").trim();
        seq[kn2] = (seq[kn2] || 0) + 1;
        walk(ch[j], depth + 1, here, cnt[kn2] > 1 ? " #" + seq[kn2] : "");
      }
    })(root, 0, []);
    return { parts: parts, tree: tree };
  }

  /* ── 模具：分组 / 报价 / 周期 ──
     按「共模」关系把零件聚合成模具组：同一 moldId 的零件拼在同一套模具里，
     moldId 为 null 的零件各自独立开模。一套模具很可能装好几个零件（小件拼模是常态）。 */
  function moldGroups(parts) {
    var map = {}, keys = [], i, k;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i].on) continue;
      k = parts[i].tool.moldId;
      /* 独立件用一个「只属于自己」的私有键，天然不会与别人合并 */
      if (k === null || k === undefined || k === "") k = "@" + i;
      if (!map[k]) { map[k] = []; keys.push(k); }
      map[k].push(i);
    }
    var groups = keys.map(function (kk) {
      var m = map[kk];
      return { leader: m[0], parts: m, cfg: parts[m[0]].tool };
    });
    /* 按最小零件序号排序，保证「模 1 / 模 2」的编号稳定 */
    groups.sort(function (a, b) { return a.leader - b.leader; });
    return groups;
  }

  var moldSeq = 0;      // 共模组 id 计数器（只增不减，保证脱离旧组的零件不会误并）

  /* 与 i 同属一套模具的全部零件索引（含自身） */
  function moldMembers(parts, i) {
    var gs = moldGroups(parts);
    for (var k = 0; k < gs.length; k++) if (gs[k].parts.indexOf(i) >= 0) return gs[k].parts.slice();
    return [i];
  }

  /* 把一组零件写成一个共模组；不足 2 件则各自独立开模 */
  function setMold(parts, ids) {
    ids.forEach(function (x) { parts[x].tool.moldId = null; });
    if (!ids || ids.length < 2) return null;
    var k = "G" + (++moldSeq);
    ids.forEach(function (x) { parts[x].tool.moldId = k; });
    return k;
  }

  /* 多选开关：把 j 并进 i 所在的模具 / 或从该模具中移出
     加入时若 j 原本已在别的模具里，则两套模具合并成一套 */
  function toggleShare(parts, i, j) {
    if (i === j) return;
    var set = moldMembers(parts, i);
    var at = set.indexOf(j);
    if (at >= 0) {
      set.splice(at, 1);
      setMold(parts, set);
      parts[j].tool.moldId = null;      // 被移出的零件改为独立开模
      return;
    }
    moldMembers(parts, j).forEach(function (x) { if (set.indexOf(x) < 0) set.push(x); });
    set.sort(function (a, b) { return a - b; });
    setMold(parts, set);
  }

  /* 本件改为独立开模，原同模的其余零件仍留在同一套模具里 */
  function leaveMold(parts, i) {
    var rest = moldMembers(parts, i).filter(function (x) { return x !== i; });
    setMold(parts, rest);
    parts[i].tool.moldId = null;
  }

  /* 单套模具的结构化报价：基础价按模具最大投影面积估；穴数、钢材、精度、
     表面用系数相乘；滑块 / 斜顶 / 热流道按行业单价直接叠加 */
  function moldCost(parts, group) {
    var members = group.parts.map(function (i) { return parts[i]; });
    var main = members[0];
    for (var i = 1; i < members.length; i++) {
      var a = members[i].dim.slice().sort(function (x, y) { return y - x; });
      var b = main.dim.slice().sort(function (x, y) { return y - x; });
      if (a[0] * a[1] > b[0] * b[1]) main = members[i];
    }
    var d = main.dim.slice().sort(function (x, y) { return y - x; });
    var area = d[0] * d[1] / 100;                                  // mm² → cm²
    var baseN = pTool("base", 8500), baseP = pTool("baseP", 0.55), baseCap = pTool("baseCap", 350000);
    var base = baseN * Math.pow(Math.max(area, 5) / 25, baseP);    // 经验式：面积越小越便宜
    base = Math.min(base, baseCap);                                // 软上限，避免超大面积外推过度

    var cfg = group.cfg;
    var steel = byId(S.STEELS, cfg.steel), prec = byId(S.PRECISIONS, cfg.precision), fin = byId(S.FINISHES, cfg.finish);
    var cav = Math.max(cfg.cav || 1, 1);
    var kCav = Math.pow(cav, pTool("cavP", 0.75));                  // 多腔成本递减（非线性）
    var core = base * kCav * steel.k * prec.k * fin.k;
    var slideCost = (cfg.slides || 0) * pTool("slide", 5000);       // 滑块 / 行位：每组 5,000 元
    var liftCost = (cfg.lifters || 0) * pTool("lifter", 3000);      // 斜顶：每个 3,000 元
    var runCost = 0;
    if (cfg.runner === "three") runCost = pTool("three", 4000);
    else if (cfg.runner === "hot") runCost = pTool("hotBase", 8000) + pTool("hotPoint", 1500) * cav;   // 热流道按点数

    var est = core + slideCost + liftCost + runCost;
    var quoted = cfg.quote !== null && cfg.quote !== undefined && +cfg.quote > 0;
    return {
      leader: group.leader, members: group.parts, cfg: cfg, main: main,
      area: area, base: base, kCav: kCav, cav: cav,
      core: core, slideCost: slideCost, liftCost: liftCost, runCost: runCost,
      steel: steel, prec: prec, fin: fin,
      est: est, total: quoted ? +cfg.quote : est, quoted: quoted
    };
  }

  /* 滑块 / 斜顶会让开合模多出侧向抽芯动作，周期随之变长 */
  function cycleOf(part, baseCycle) {
    var c = part.tool;
    var k = 1 + pTool("slideCyc", 8) / 100 * (c.slides || 0) + pTool("liftCyc", 5) / 100 * (c.lifters || 0);
    if (c.runner === "three") k *= 1.10;
    else if (c.runner === "hot") k *= 0.96;
    return baseCycle * Math.min(k, 1.6);
  }

  /* 零件投影面积 → 锁模力 → 机台吨位 → 机时费 */
  function partMachine(part, rateK) {
    var d = part.dim.slice().sort(function (x, y) { return y - x; });
    var area = d[0] * d[1] / 100;                       // cm²
    var clamp = area * moldCoefOf(part.mat);            // t
    var tonnage = clamp * 1.2;                          // 含 20% 余量
    return { area: area, clamp: clamp, tonnage: tonnage, rate: machineRate(tonnage) * rateK };
  }

  /* ── 成本模型 ── */
  function estimate(parts, P) {
    var loss = +P.loss / 100;
    var yld = Math.max(+P.yield || 1, 1) / 100;
    var rateK = +P.rateK || 1;
    var qty = Math.max(+P.qty || 1, 1);
    var pack = +P.pack || 0, asm = +P.asm || 0;

    /* 先按共模关系聚合模具，算出每套模具的报价 */
    var groups = moldGroups(parts);
    var molds = groups.map(function (g) { return moldCost(parts, g); });
    var moldTotal = 0;
    molds.forEach(function (m) { moldTotal += m.total; });
    var moldOf = {};
    molds.forEach(function (m) { m.members.forEach(function (pi) { moldOf[pi] = m; }); });

    var mat = 0, mach = 0, post = 0, amort = 0, weight = 0, volSum = 0, areaSum = 0, n = 0;
    var perPart = [];

    for (var i = 0; i < parts.length; i++) {
      var pt = parts[i], m = matById(pt.mat);
      var den = pDen(m);
      var netW = den > 0 ? (pt.vol / 1000) * den : 0;                // 净重 g
      var rn = byId(S.RUNNERS, pt.tool.runner);
      var scrapW = netW * rn.scrap;                                   // 水口料重
      /* 材料费 = 净重(含损耗) 全价 + 水口料按回收折价后计入 */
      var recycle = pTool("recycle", 62) / 100;
      var matCost = (netW * (1 + loss) + scrapW * (1 - recycle)) * pMat(m) / 1000;

      var mi = partMachine(pt, rateK);
      var cycle = cycleOf(pt, +P.cycle);
      var cav = Math.max(pt.tool.cav || 1, 1);
      var machCost = mi.rate * cycle / 3600 / cav;                    // 按模穴分摊

      var mm = moldOf[i];
      /* 模具摊销：该套模具价 ÷ 订单量 ÷ 组内零件数 */
      var amortCost = mm ? mm.total / qty / mm.members.length : 0;

      var row = {
        pt: pt, i: i, netW: netW, scrapW: scrapW, mat: matCost, mach: machCost,
        post: +pt.tool.post || 0, amort: amortCost,
        area: mi.area, clamp: mi.clamp, tonnage: mi.tonnage, rate: mi.rate,
        cycle: cycle, cav: cav, mold: mm
      };
      perPart.push(row);

      if (pt.on) {
        mat += matCost; mach += machCost; post += (+pt.tool.post || 0);
        amort += amortCost; weight += netW;
        volSum += pt.vol; areaSum += pt.area; n++;
      }
    }

    var sub = mat + mach;
    var total = sub / yld + post + pack + asm + amort;

    return {
      weighted: weight, volSum: volSum, areaSum: areaSum, n: n,
      mat: mat, mach: mach, post: post, pack: pack, asm: asm, amort: amort,
      yldLoss: sub * (1 / yld - 1),
      total: total,
      molds: molds, moldTotal: moldTotal, qty: qty,
      perPart: perPart
    };
  }

  /* 常规注塑范围检查：超出行业常见范围的数值要给出提示，避免误读 */
  function sanity(parts, est) {
    var warn = [];
    for (var i = 0; i < est.perPart.length; i++) {
      var r = est.perPart[i];
      if (r.netW > 20000) warn.push(r.pt.name + " 单件重 " + fix(r.netW / 1000, 1) + " kg，超出常规注塑范围（常见 ≤20 kg）");
      if (r.clamp > 2500) warn.push(r.pt.name + " 需锁模力 " + fix(r.clamp, 0) + " t，超出常规注塑机（常见 ≤2500 t）");
      if (r.area > 10000) warn.push(r.pt.name + " 投影面积 " + fix(r.area, 0) + " cm²，超出常规注塑机台板尺寸");
    }
    var big = parts.filter(function (p) { return p.on; }).sort(function (a, b) { return b.vol - a.vol; })[0];
    if (big && big.vol / 1000 > 20000) warn.push("最大件体积 " + fix(big.vol / 1000, 0) + " cm³，模具尺寸与机台需专项评估");
    return warn.slice(0, 4);
  }

  /* 阶梯价：同一套零件在不同订单量下的单件成本 */
  function tiers(parts, P, qtys) {
    var out = [];
    for (var i = 0; i < qtys.length; i++) {
      var P2 = {};
      for (var k in P) if (P.hasOwnProperty(k)) P2[k] = P[k];
      P2.qty = qtys[i];
      var e = estimate(parts, P2);
      out.push({ qty: qtys[i], unit: e.total, amort: e.amort, moldTotal: e.moldTotal });
    }
    return out;
  }

  /* 回本点：模具投入要多少件才能靠单件毛利收回来 */
  function breakEven(e, target) {
    if (!target || +target <= 0) return null;
    var variable = e.total - e.amort;          // 不含模具摊销的单件成本
    var gross = +target - variable;            // 单件毛利
    if (gross <= 0) return { ok: false, variable: variable, gross: gross };
    return { ok: true, qty: Math.ceil(e.moldTotal / gross), variable: variable, gross: gross };
  }

  /* ── 格式化 ── */
  function fix(x, d) {
    if (!isFinite(x)) return "—";
    var s = (+x).toFixed(d === undefined ? 2 : d);
    if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
    return s;
  }
  /* 选单位的依据是「四舍五入后的显示值」而不是原始阈值：
     999.9999 mm³ 若按阈值判断会显示成 1000 mm³，其实写成 1 cm³ 更好读 */
  function vol(x) {           // mm³ → 智能单位
    var m3 = x / 1e9, L = x / 1e6, cm = x / 1e3;
    if (Math.round(m3 * 1000) / 1000 >= 1) return fix(m3, 3) + " m³";
    if (Math.round(L * 100) / 100 >= 1) return fix(L, 2) + " L";
    if (Math.round(cm * 100) / 100 >= 1) return fix(cm, 2) + " cm³";
    return fix(x, 1) + " mm³";
  }
  function area(x) {          // mm² → 智能单位
    if (x >= 1e4) return fix(x / 1e2, 1) + " cm²";
    return fix(x, 0) + " mm²";
  }
  function grams(x) {
    if (x >= 1000) return fix(x / 1000, 2) + " kg";
    return fix(x, x < 10 ? 2 : 1) + " g";
  }
  function money(x) { return "¥ " + fix(x, x < 0.1 ? 4 : x < 10 ? 3 : 2); }

  /* ── AI 提示词 ── */
  function buildPrompt(info, parts, est, P) {
    var B = String.fromCharCode(124);   // 竖线，避免转义困扰
    var rows = [], i;
    /* 零件 → 所属模具序号与同模件数（一个模具可能装好几个零件，必须逐件标出来） */
    var moldNo = {}, moldSize = {};
    est.molds.forEach(function (m, k) {
      m.members.forEach(function (x) { moldNo[x] = k + 1; moldSize[x] = m.members.length; });
    });
    for (i = 0; i < parts.length; i++) {
      var pt = parts[i], m = matById(pt.mat), t = pt.tool;
      var rn = byId(S.RUNNERS, pt.tool.runner);
      rows.push(
        (i + 1) + ". " + pt.name +
        " " + B + " 材料 " + (pt.on ? m.n : "（未计入）") +
        " " + B + " 体积 " + fix(pt.vol / 1000, 2) + " cm³" +
        " " + B + " 包围盒 " + pt.dim.map(function (d) { return fix(d, 1); }).join("×") + " mm" +
        " " + B + " 模具 " + (t.cav || 1) + " 穴 / " + rn.n +
        (t.slides ? " / 滑块 " + t.slides : "") +
        (t.lifters ? " / 斜顶 " + t.lifters : "") +
        " / " + byId(S.STEELS, t.steel).n +
        " / " + byId(S.PRECISIONS, t.precision).n +
        (t.finish !== "normal" ? " / " + byId(S.FINISHES, t.finish).n : "") +
        (moldSize[i] > 1 ? " / 与另 " + (moldSize[i] - 1) + " 件共模（模 " + moldNo[i] + "）" : "") +
        (t.post ? " / 二次加工 " + t.post + " 元" : "")
      );
    }

    var molds = [], mi;
    for (mi = 0; mi < est.molds.length; mi++) {
      var md = est.molds[mi];
      molds.push(
        "模 " + (mi + 1) + "（共模 " + md.members.length + " 件：" +
        md.members.map(function (x) { return parts[x].name; }).join("、") + "）" +
        "\n    投影面积 " + fix(md.area, 0) + " cm² " + B + " 基准件 " + md.main.name +
        "\n    基础价 ¥" + fix(md.base, 0) + " × 穴数系数 " + fix(md.kCav, 2) +
        " × 钢材 " + fix(md.steel.k, 2) + " × 精度 " + fix(md.prec.k, 2) + " × 表面 " + fix(md.fin.k, 2) +
        " = ¥" + fix(md.core, 0) +
        "，滑块 ¥" + fix(md.slideCost, 0) + "，斜顶 ¥" + fix(md.liftCost, 0) + "，浇口系统 ¥" + fix(md.runCost, 0) +
        "\n    合计 ¥" + fix(md.total, 0) + "" + (md.quoted ? "（已按模具厂实际报价覆盖）" : "（系统估算）")
      );
    }

    var tl = tiers(parts, P, [10000, 50000, 100000, 300000, 500000]);
    var tierTxt = tl.map(function (x) { return fix(x.qty, 0) + " 件 → " + fix(x.unit, 3) + " 元/件"; }).join("；");
    var be = breakEven(est, P.target);

    var L = [];
    L.push("我是一名灯具结构工程师，正在做项目前期成本评估。");
    L.push("下面是一份从 STEP 装配体自动提取的零件清单（体积由三角网格按散度定理积分得到，与 CAD 实测值可对齐），请帮我就「成本」和「工艺可行性」做分析。");
    L.push("");
    L.push("【模型信息】");
    L.push("· 文件：" + info.file + "（" + info.size + "）");
    L.push("· 整体包围盒：" + info.bbox + " mm");
    L.push("· 零件数：" + est.n + " 个（参与计价）");
    L.push("· 总体积：" + fix(est.volSum / 1000, 2) + " cm³（" + vol(est.volSum) + "）");
    L.push("· 总重量：" + fix(est.weighted, 2) + " g（" + grams(est.weighted) + "）");
    L.push("· 总表面积：" + fix(est.areaSum / 100, 1) + " cm²");
    L.push("");
    L.push("【零件清单（含各自的开模方案）】");
    L.push(rows.join("\n"));
    L.push("");
    L.push("【模具投入清单（共 " + est.molds.length + " 套模具，合计 ¥" + fix(est.moldTotal, 0) + "）】");
    L.push(molds.join("\n"));
    L.push("");
    L.push("【成本估算（按注塑工艺）】");
    L.push("· 全局参数：材料损耗 " + P.loss + "%，基础成型周期 " + P.cycle + " s，良率 " + P.yield + "%，机时费系数 " + P.rateK + "×");
    L.push("· 机时费与水口比例按每套模具的机台吨位与浇口形式分别推算；滑块/斜顶会相应延长成型周期");
    L.push("· 订单量 " + fix(P.qty, 0) + " 件 → 模具摊销 " + fix(est.amort, 4) + " 元/件");
    L.push("· 材料费合计 " + fix(est.mat, 3) + " 元；加工费合计 " + fix(est.mach, 3) + " 元；良率损失 " + fix(est.yldLoss, 3) + " 元");
    L.push("· 二次加工 " + fix(est.post, 3) + " 元/件；包装 " + fix(est.pack, 3) + " 元/件；组装 " + fix(est.asm, 3) + " 元/件");
    L.push("· **单件估算成本 " + fix(est.total, 3) + " 元**");
    L.push("· 阶梯价：" + tierTxt);
    if (be && be.ok) L.push("· 目标售价 " + P.target + " 元时，模具投入需 " + be.qty.toLocaleString() + " 件才能收回（单件毛利 " + fix(be.gross, 3) + " 元）");
    else if (be && !be.ok) L.push("· ⚠️ 目标售价 " + P.target + " 元低于不含摊销的单件成本 " + fix(be.variable, 3) + " 元，模具永远收不回来");
    L.push("");
    L.push("【请回答】");
    L.push("1. 这套开模方案（模穴数、滑块、斜顶、浇口形式、钢材）有没有明显过度或不足的地方？逐条说明理由与调整建议。");
    L.push("2. 这个成本结构里哪一项压缩空间最大？给出具体可执行的降本方向（含预期幅度）。");
    L.push("3. 上面的模具分组（哪几个零件拼在同一套模具里）是否合理？请逐组评估：产量、材料、颜色、精度、模具尺寸是否匹配；哪些零件应该拆成单独一副模具，哪些还可以继续合并进来？");
    L.push("4. 从零件的体积/表面积比例看，是否存在壁厚过厚、可以减料或抽壳的部位？请指出具体是哪个零件。");
    L.push("5. 材料选型是否合理？哪些零件换材料后成本或性能会明显改善？（我主要做塑料灯具：小夜灯、氛围灯、补光灯，也涉及树脂一体成型、搪胶、软硅胶等小众工艺）");
    L.push("6. 前期的风险提示：哪些零件在开模前必须再确认（脱模斜度、卡扣强度、缩水、透光均匀性等）？");
    L.push("");
    L.push("如果信息不足，请先说明你需要补充什么，不要凭空假设尺寸或结构细节。");
    return L.join("\n");
  }

  /* ── CSV 导出 ── */
  function toCSV(info, parts, est, P) {
    var q = function (v) {
      var sv = String(v === undefined || v === null ? "" : v);
      return /[",\n]/.test(sv) ? '"' + sv.replace(/"/g, '""') + '"' : sv;
    };
    var rowOf = {}, ri;
    for (ri = 0; ri < est.perPart.length; ri++) rowOf[est.perPart[ri].i] = est.perPart[ri];

    /* 零件 → 所属模具序号与同模件数（一个模具可以装好几个零件） */
    var moldNo = {}, moldSize = {};
    est.molds.forEach(function (m, k) {
      m.members.forEach(function (x) { moldNo[x] = k + 1; moldSize[x] = m.members.length; });
    });

    var L = [];
    L.push(["零件名称", "层级路径", "材料", "体积(cm³)", "包围盒(mm)", "重量(g)",
      "所属模具", "共模件数",
      "模穴数", "滑块", "斜顶", "浇口形式", "钢材", "精度", "表面要求",
      "投影面积(cm²)", "锁模力(t)", "机台吨位(t)", "机时费(元/h)", "成型周期(s)",
      "材料费(元)", "加工费(元)", "二次加工(元)", "模具摊销(元)", "单件小计(元)", "是否计入"].map(q).join(","));

    for (var i = 0; i < parts.length; i++) {
      var pt = parts[i], m = matById(pt.mat), t = pt.tool, r = rowOf[i] || {};
      L.push([
        pt.name, pt.path, m.n, fix(pt.vol / 1000, 3),
        pt.dim.map(function (d) { return fix(d, 1); }).join("×"),
        fix(r.netW || 0, 3),
        "模 " + (moldNo[i] || ""), moldSize[i] || 1,
        t.cav || 1, t.slides || 0, t.lifters || 0,
        byId(S.RUNNERS, t.runner).n, byId(S.STEELS, t.steel).n,
        byId(S.PRECISIONS, t.precision).n, byId(S.FINISHES, t.finish).n,
        fix(r.area || 0, 1), fix(r.clamp || 0, 1), fix(r.tonnage || 0, 0),
        fix(r.rate || 0, 1), fix(r.cycle || 0, 1),
        fix(r.mat || 0, 4), fix(r.mach || 0, 4), fix(r.post || 0, 4), fix(r.amort || 0, 4),
        fix((r.mat || 0) + (r.mach || 0) + (r.post || 0) + (r.amort || 0), 4),
        pt.on ? "是" : "否"
      ].map(q).join(","));
    }

    L.push("");
    L.push(["模具投入清单", "", "", "", "", ""].map(q).join(","));
    L.push(["模具", "共模件数", "涉及零件", "基准件", "投影面积(cm²)", "基础价(元)", "穴数系数",
      "钢材系数", "精度系数", "表面系数", "滑块(元)", "斜顶(元)", "浇口系统(元)", "模具合计(元)", "来源"].map(q).join(","));
    for (var mi = 0; mi < est.molds.length; mi++) {
      var md = est.molds[mi];
      L.push([
        "模 " + (mi + 1),
        md.members.length,
        md.members.map(function (x) { return parts[x].name; }).join("、"),
        md.main.name, fix(md.area, 0), fix(md.base, 0), fix(md.kCav, 3),
        fix(md.steel.k, 2), fix(md.prec.k, 2), fix(md.fin.k, 2),
        fix(md.slideCost, 0), fix(md.liftCost, 0), fix(md.runCost, 0),
        fix(md.total, 0), md.quoted ? "模具厂报价" : "系统估算"
      ].map(q).join(","));
    }
    L.push(["模具合计", "", "", "", "", "", "", "", "", "", "", "", fix(est.moldTotal, 0), ""].map(q).join(","));

    L.push("");
    L.push(["成本汇总", "金额 / 数值"].map(q).join(","));
    var SS = [
      ["参与计价零件数", est.n],
      ["模具套数", est.molds.length],
      ["模具总投入(元)", fix(est.moldTotal, 0)],
      ["总体积(cm³)", fix(est.volSum / 1000, 2)],
      ["总重量(g)", fix(est.weighted, 2)],
      ["总表面积(cm²)", fix(est.areaSum / 100, 1)],
      ["材料费合计(元)", fix(est.mat, 4)],
      ["加工费合计(元)", fix(est.mach, 4)],
      ["良率损失(元/件)", fix(est.yldLoss, 4)],
      ["二次加工(元/件)", fix(est.post, 4)],
      ["包装(元/件)", fix(est.pack, 4)],
      ["组装(元/件)", fix(est.asm, 4)],
      ["模具摊销(元/件)", fix(est.amort, 4)],
      ["单件成本(元)", fix(est.total, 4)]
    ];
    for (var k = 0; k < SS.length; k++) L.push([SS[k][0], SS[k][1]].map(q).join(","));

    L.push("");
    L.push(["阶梯价（不同订单量下的单件成本）", ""].map(q).join(","));
    L.push(["订单量(件)", "单件成本(元)", "其中模具摊销(元)"].map(q).join(","));
    var tl = tiers(parts, P, [10000, 50000, 100000, 300000, 500000]);
    for (var ti = 0; ti < tl.length; ti++) {
      L.push([fix(tl[ti].qty, 0), fix(tl[ti].unit, 4), fix(tl[ti].amort, 4)].map(q).join(","));
    }
    var be = breakEven(est, P.target);
    if (be) {
      L.push(["回本点", be.ok ? (be.qty + " 件（单件毛利 " + fix(be.gross, 4) + " 元）") : "目标售价低于可变成本，无法回本"].map(q).join(","));
    }

    L.push("");
    L.push(["全局工艺参数", "值"].map(q).join(","));
    for (var key in P) if (P.hasOwnProperty(key)) L.push([P[key].l, P[key].v].map(q).join(","));
    return "\uFEFF" + L.join("\n");   // BOM 让 Excel 正确识别中文
  }

  /* 挂到 window.KB_STEP：界面层全程用 S.xxx 调用，与数据键同居一个命名空间 */
  S.byId = byId; S.moldCoefOf = moldCoefOf; S.machineRate = machineRate;
  S.matById = matById; S.guessMat = guessMat;
  S.meshStats = meshStats; S.flatten = flatten; S.estimate = estimate;
  S.moldGroups = moldGroups; S.moldCost = moldCost; S.cycleOf = cycleOf;
  S.moldMembers = moldMembers; S.setMold = setMold; S.toggleShare = toggleShare; S.leaveMold = leaveMold;
  S.partMachine = partMachine; S.tiers = tiers; S.breakEven = breakEven; S.sanity = sanity;
  S.buildPrompt = buildPrompt; S.toCSV = toCSV;
  S.fix = fix; S.vol = vol; S.area = area; S.grams = grams; S.money = money;

  /* 零件配色（低饱和，与站点风格一致） */
  var PALETTE = [
    [96, 145, 200], [120, 180, 150], [205, 150, 95], [160, 130, 195],
    [200, 110, 120], [110, 170, 195], [175, 175, 105], [145, 145, 175],
    [200, 165, 130], [125, 190, 180], [185, 140, 165], [130, 155, 130]
  ];
  function partColor(i) {
    var c = PALETTE[i % PALETTE.length];
    var k = 0.78 + 0.22 * ((Math.floor(i / PALETTE.length) % 2));
    return [c[0] * k / 255, c[1] * k / 255, c[2] * k / 255];
  }

  /* ══════════════ 状态 ══════════════ */
  var st = {
    parts: [], tree: [], params: {}, info: null,
    sel: -1, parsed: false, busy: false, err: "",
    open: {},         // 展开了「开模设置」的零件索引
    /* 方案与草稿 */
    planId: "",       // 当前载入的方案 id（空 = 未保存）
    planName: "",     // 当前方案名
    fileSize: 0,      // 原始文件字节数，用于「同名文件」匹配
    needMesh: false,  // 从保存的记录恢复时没有网格 → 3D 需要重新拖文件
    applyMsg: "",     // 「已自动套用上次配置」之类的一次性提示
    quote: null       // 报价单的抬头信息（客户 / 有效期 / 备注）
  };
  for (var k in S.PARAMS) st.params[k] = S.PARAMS[k].v;

  /* ══════════════ ① WebGL 查看器 ══════════════ */
  function Viewer(canvas) {
    var gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true })
          || canvas.getContext("experimental-webgl", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) return null;

    var VS = [
      "attribute vec3 aPos; attribute vec3 aNrm;",
      "uniform mat4 uMVP; uniform mat3 uRot; uniform float uScale;",
      "varying vec3 vN;",
      "void main(){ vN = uRot * aNrm; gl_Position = uMVP * vec4(aPos * uScale, 1.0); }"
    ].join("\n");
    var FS = [
      "precision mediump float;",
      "varying vec3 vN; uniform vec3 uColor; uniform float uDim;",
      "void main(){",
      "  vec3 n = normalize(vN);",
      "  float d = abs(dot(n, normalize(vec3(0.45, 0.75, 0.5))));",
      "  float e = abs(dot(n, normalize(vec3(-0.6, 0.2, -0.4))));",
      "  float l = 0.46 + 0.46 * d + 0.16 * e;",
      "  gl_FragColor = vec4(uColor * l * uDim, 1.0);",
      "}"
    ].join("\n");
    var PVS = "attribute vec3 aPos; uniform mat4 uMVP; uniform float uScale; void main(){ gl_Position = uMVP * vec4(aPos * uScale, 1.0); }";
    var PFS = "precision mediump float; uniform vec3 uId; void main(){ gl_FragColor = vec4(uId, 1.0); }";

    /* 包围盒线框：单位立方体（12 条边）经 uCenter/uSize 变换到目标零件的位置 */
    var WVS = "attribute vec3 aPos; uniform mat4 uMVP; uniform vec3 uCenter; uniform vec3 uSize; uniform float uScale;"
            + " void main(){ vec3 p = uCenter + aPos * uSize; gl_Position = uMVP * vec4(p * uScale, 1.0); }";
    var WFS = "precision mediump float; uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }";
    var UNIT_BOX = new Float32Array([
      -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,
       0.5, -0.5, -0.5,  0.5,  0.5, -0.5,
       0.5,  0.5, -0.5, -0.5,  0.5, -0.5,
      -0.5,  0.5, -0.5, -0.5, -0.5, -0.5,
      -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,
       0.5, -0.5,  0.5,  0.5,  0.5,  0.5,
       0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
      -0.5,  0.5,  0.5, -0.5, -0.5,  0.5,
      -0.5, -0.5, -0.5, -0.5, -0.5,  0.5,
       0.5, -0.5, -0.5,  0.5, -0.5,  0.5,
       0.5,  0.5, -0.5,  0.5,  0.5,  0.5,
      -0.5,  0.5, -0.5, -0.5,  0.5,  0.5
    ]);

    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    function prog(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    }
    var P = prog(VS, FS), PP = prog(PVS, PFS), PW = prog(WVS, WFS);
    if (!P || !PP || !PW) return null;

    /* 大模型单个零件顶点常超过 65535，Uint16 索引会静默出错 */
    var uintExt = gl.getExtension("OES_element_index_uint");
    var IDX = uintExt ? Uint32Array : Uint16Array;
    var IDX_GL = uintExt ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    var loc = {
      aPos: gl.getAttribLocation(P, "aPos"), aNrm: gl.getAttribLocation(P, "aNrm"),
      uMVP: gl.getUniformLocation(P, "uMVP"), uRot: gl.getUniformLocation(P, "uRot"),
      uScale: gl.getUniformLocation(P, "uScale"), uColor: gl.getUniformLocation(P, "uColor"),
      uDim: gl.getUniformLocation(P, "uDim")
    };
    var pLoc = {
      aPos: gl.getAttribLocation(PP, "aPos"),
      uMVP: gl.getUniformLocation(PP, "uMVP"),
      uScale: gl.getUniformLocation(PP, "uScale"),
      uId: gl.getUniformLocation(PP, "uId")
    };
    var wLoc = {
      aPos: gl.getAttribLocation(PW, "aPos"),
      uMVP: gl.getUniformLocation(PW, "uMVP"),
      uCenter: gl.getUniformLocation(PW, "uCenter"),
      uSize: gl.getUniformLocation(PW, "uSize"),
      uScale: gl.getUniformLocation(PW, "uScale"),
      uColor: gl.getUniformLocation(PW, "uColor")
    };
    var boxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_BOX, gl.STATIC_DRAW);
    var boxMin = null, boxMax = null;

    var bufs = [];       // 每个零件：{pos, nrm, idx, count, color}
    var center = [0, 0, 0], radius = 1;
    var rotX = -0.5, rotY = 0.6, zoom = 1;
    var fbo = null, fboTex = null, fboRtt = null, fboW = 0, fboH = 0;

    /* ── 矩阵工具 ── */
    function mul(a, b) {
      var o = new Float32Array(16);
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        var v = 0; for (var n = 0; n < 4; n++) v += a[n * 4 + j] * b[i * 4 + n];
        o[i * 4 + j] = v;
      }
      return o;
    }
    function persp(fovy, asp, zn, zf) {
      var f = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = f / asp; o[5] = f; o[10] = (zf + zn) / (zn - zf); o[11] = -1;
      o[14] = 2 * zf * zn / (zn - zf);
      return o;
    }
    function rotMat(rx, ry) {
      var cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
      var o = new Float32Array(16);
      o[0] = cy; o[2] = -sy;
      o[4] = sx * sy; o[5] = cx; o[6] = sx * cy;
      o[1] = 0;
      o[8] = cx * sy; o[9] = -sx; o[10] = cx * cy;
      o[15] = 1;
      return o;
    }
    function rotMat3(m) {
      return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
    }
    function mvp() {
      var R = rotMat(rotX, rotY);
      var dist = 2.2 / zoom;
      var view = new Float32Array(16);
      view[0] = 1; view[5] = 1; view[10] = 1; view[14] = -dist; view[15] = 1;
      var canvas = gl.canvas;
      var asp = (canvas.width || 1) / (canvas.height || 1);
      return { m: mul(persp(Math.PI / 4, asp, 0.05, 60), mul(view, R)), R: rotMat3(R) };
    }

    /* 先算整体包围盒 → 平移顶点到原点 → 再上传。
       顺序不能反：一旦先 bufferData，之后改数组不会同步到 GPU。 */
    function upload(list) {
      for (var i = 0; i < bufs.length; i++) {
        gl.deleteBuffer(bufs[i].pos); gl.deleteBuffer(bufs[i].nrm); gl.deleteBuffer(bufs[i].idx);
      }
      bufs = [];
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      var p, c, v;
      for (p = 0; p < list.length; p++) {
        var pa = list[p].pos;
        for (v = 0; v < pa.length; v += 3) for (c = 0; c < 3; c++) {
          var x = pa[v + c]; if (x < mn[c]) mn[c] = x; if (x > mx[c]) mx[c] = x;
        }
      }
      if (!isFinite(mn[0])) { mn = [0, 0, 0]; mx = [1, 1, 1]; }
      center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      /* 用最大边长（不是半边长）做归一化基准，否则模型会占满整个视野 */
      var dmax = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      radius = dmax > 0 ? dmax : 1;

      for (p = 0; p < list.length; p++) {
        var g = list[p];
        var pos = new Float32Array(g.pos.length);
        for (v = 0; v < g.pos.length; v += 3) {
          pos[v]     = g.pos[v]     - center[0];
          pos[v + 1] = g.pos[v + 1] - center[1];
          pos[v + 2] = g.pos[v + 2] - center[2];
        }
        var nrm = new Float32Array(g.nrm);
        var idx = new IDX(g.idx.length);
        for (v = 0; v < g.idx.length; v++) idx[v] = g.idx[v];
        var bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
        var bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.STATIC_DRAW);
        var bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        bufs.push({ pos: bp, nrm: bn, idx: bi, count: idx.length, color: g.color });
      }
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    function drawTo(target, pick) {
      resize();
      var m = mvp();
      if (pick) {
        if (!fbo) { fbo = gl.createFramebuffer(); fboTex = gl.createTexture(); fboRtt = gl.createRenderbuffer(); }
        if (fboW !== canvas.width || fboH !== canvas.height) {
          gl.bindTexture(gl.TEXTURE_2D, fboTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.bindRenderbuffer(gl.RENDERBUFFER, fboRtt);
          gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboRtt);
          fboW = canvas.width; fboH = canvas.height;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(pick ? 0 : bg[0], pick ? 0 : bg[1], pick ? 0 : bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var P0 = pick ? PP : P;
      gl.useProgram(P0);
      var sc = 1 / radius;
      gl.uniformMatrix4fv(pick ? pLoc.uMVP : loc.uMVP, false, m.m);
      gl.uniform1f(pick ? pLoc.uScale : loc.uScale, sc);
      if (!pick) gl.uniformMatrix3fv(loc.uRot, false, m.R);

      for (var i = 0; i < bufs.length; i++) {
        var b = bufs[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
        gl.enableVertexAttribArray(pick ? pLoc.aPos : loc.aPos);
        gl.vertexAttribPointer(pick ? pLoc.aPos : loc.aPos, 3, gl.FLOAT, false, 0, 0);
        if (!pick) {
          gl.bindBuffer(gl.ARRAY_BUFFER, b.nrm);
          gl.enableVertexAttribArray(loc.aNrm);
          gl.vertexAttribPointer(loc.aNrm, 3, gl.FLOAT, false, 0, 0);
          gl.uniform3fv(loc.uColor, b.color);
          gl.uniform1f(loc.uDim, (st.sel >= 0 && st.sel !== i) ? 0.45 : 1.0);
        } else {
          var id = i + 1;
          gl.uniform3f(pLoc.uId, (id & 255) / 255, ((id >> 8) & 255) / 255, 0);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
        gl.drawElements(gl.TRIANGLES, b.count, IDX_GL, 0);
      }

      /* 选中零件的包围盒线框（拾取用的那趟不画，免得干扰 id 颜色） */
      if (!pick && boxMin && boxMax) {
        gl.useProgram(PW);
        gl.uniformMatrix4fv(wLoc.uMVP, false, m.m);
        gl.uniform1f(wLoc.uScale, sc);
        gl.uniform3f(wLoc.uCenter,
          (boxMin[0] + boxMax[0]) / 2 - center[0],
          (boxMin[1] + boxMax[1]) / 2 - center[1],
          (boxMin[2] + boxMax[2]) / 2 - center[2]);
        /* 略微外扩，避免与零件表面重叠时被 z-fighting 吃掉 */
        gl.uniform3f(wLoc.uSize,
          Math.max(boxMax[0] - boxMin[0], 1e-3) * 1.004,
          Math.max(boxMax[1] - boxMin[1], 1e-3) * 1.004,
          Math.max(boxMax[2] - boxMin[2], 1e-3) * 1.004);
        gl.uniform3f(wLoc.uColor, 0.94, 0.44, 0.09);
        gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
        gl.enableVertexAttribArray(wLoc.aPos);
        gl.vertexAttribPointer(wLoc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, 24);
      }
    }

    var bg = [0.96, 0.97, 0.99];
    function setBg(c) { bg = c; }
    function setRot(rx, ry) { rotX = rx; rotY = ry; }
    function setZoom(z) { zoom = z; }

    function pickAt(cx, cy) {
      drawTo(null, true);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var px = new Uint8Array(4);
      gl.readPixels(Math.round(cx * dpr), canvas.height - Math.round(cy * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      var id = px[0] + (px[1] << 8);
      return id > 0 ? id - 1 : -1;
    }

    return {
      upload: upload, draw: function () { drawTo(null, false); },
      pick: pickAt, mvp: mvp, setBg: setBg,
      /* 传 null 取消线框；坐标是模型的原始坐标系（与 parts 的 min/max 一致） */
      setBox: function (mn, mx) { boxMin = mn; boxMax = mx; },
      rot: function () { return [rotX, rotY]; }, setRot: setRot, setZoom: setZoom,
      getZoom: function () { return zoom; },
      dispose: function () { gl.getExtension("WEBGL_lose_context") && gl.getExtension("WEBGL_lose_context").loseContext(); }
    };
  }

  /* 把解析出来的 mesh 转成查看器需要的扁平三角形数组 */
  function toGeom(meshes, parts) {
    var out = [];
    for (var i = 0; i < meshes.length; i++) {
      var m = meshes[i];
      var pos = m.attributes.position.array;
      var nrm = m.attributes.normal ? m.attributes.normal.array : null;
      var idx = m.index.array;
      var P2 = [], N = [], I = [];
      for (var v = 0; v < pos.length; v++) P2.push(pos[v]);
      if (nrm && nrm.length === pos.length) for (var n = 0; n < nrm.length; n++) N.push(nrm[n]);
      else for (var q = 0; q < pos.length / 3; q++) { N.push(0, 1, 0); }
      for (var t = 0; t < idx.length; t++) I.push(idx[t]);
      out.push({ pos: P2, nrm: N, idx: I, color: partColor(i) });
    }
    return out;
  }

  /* ══════════════ ② Worker 解析 ══════════════
     引擎是 vendor/occt/ 里的 occt-import-js（官方 worker，懒加载约 7.6 MB）。
     官方 worker 没有 ready 握手：构造成功后 WASM 才按需初始化，真正的问题
     （脚本/wasm 404、初始化崩溃）会在首次解析时经 onerror 冒出来 ——
     所以解析阶段必须同时盯住 onerror / onmessageerror 和超时。 */
  var worker = null, workerLoading = null, pending = null;

  function killWorker() {
    if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
  }

  function ensureWorker(onStatus) {
    if (worker) return Promise.resolve(worker);
    if (workerLoading) return workerLoading;
    workerLoading = new Promise(function (resolve, reject) {
      if (onStatus) onStatus("正在加载解析引擎（约 7.6 MB，仅首次需要）…");
      /* 预检引擎文件：官方 worker 的 wasm 加载失败只会在 worker 内部变成
         未处理的 Promise 拒绝，不会给主线程回消息 —— 不预检就要干等 3 分钟超时。
         用 GET 而不是 HEAD：HEAD 命不中 Service Worker 按 GET 存的缓存，
         会破坏「访问过一次后可离线使用」；GET 未命中时还能顺手把 wasm 预热进缓存。 */
      fetch("vendor/occt/occt-import-js.wasm").then(function (r) {
        if (!r.ok) throw new Error("引擎文件不可用（HTTP " + r.status + "）——vendor/occt/ 需完整部署");
        var w;
        try { w = new Worker("vendor/occt/occt-import-js-worker.js"); }
        catch (err) { throw new Error(err && err.message ? err.message : "浏览器无法创建 Worker"); }
        w.onmessage = function (e) {
          var p = pending; pending = null;
          if (p) { clearTimeout(p.to); p.resolve(e.data); }
        };
        w.onerror = function (e) {
          var msg = e && e.message ? e.message : "脚本或 wasm 下载失败，请检查网络后重试";
          var p = pending; pending = null;
          killWorker();
          if (p) { clearTimeout(p.to); p.reject(new Error("解析引擎加载失败：" + msg)); }
        };
        w.onmessageerror = function () {
          var p = pending; pending = null;
          killWorker();
          if (p) { clearTimeout(p.to); p.reject(new Error("解析结果传回主线程失败（结果数据过大），请尝试更小的文件")); }
        };
        worker = w;
        resolve(w);
      }).catch(function (e) {
        killWorker();
        workerLoading = null;
        reject(new Error("解析引擎加载失败：" + (e && e.message ? e.message : "未知错误")));
      });
    });
    return workerLoading;
  }

  function parseBuffer(buf, format, onStatus) {
    return ensureWorker(onStatus).then(function (w) {
      return new Promise(function (resolve, reject) {
        var to = setTimeout(function () {
          /* 超时的多为引擎卡死：终止掉，下次重试用全新 Worker */
          pending = null;
          killWorker();
          reject(new Error("解析超时（超过 3 分钟），文件可能过大；请重试或先在 CAD 里精简模型"));
        }, 180000);
        pending = { to: to, resolve: resolve, reject: reject };
        try { w.postMessage({ format: format, buffer: buf, params: null }, [buf.buffer]); }
        catch (err) { w.postMessage({ format: format, buffer: buf, params: null }); }
      });
    });
  }

  /* ══════════════ ③ 界面 ══════════════ */
  function uploadHTML() {
    return resumeHTML()
      + '<div class="st-drop" id="stDrop" role="button" tabindex="0" aria-label="选择或拖入 STEP 文件">'
      + '  <div class="st-ic"><svg class="ic-lg" aria-hidden="true"><use href="#i-upload-cloud"/></svg></div>'
      + '  <h3>拖入 STEP 文件，或点击选择</h3>'
      + '  <p>支持 .step / .stp（以及 .igs / .iges / .brep）　·　单个文件建议 50 MB 以内</p>'
      + '  <div class="st-privacy">解析全部在你自己的浏览器里完成，文件不会上传到任何服务器。</div>'
      + '  <input type="file" id="stFile" accept=".step,.stp,.STEP,.STP,.igs,.iges,.brep" style="display:none">'
      + '</div>'
      + '<div id="stStatus" class="st-privacy" style="text-align:center; margin-top:14px;"></div>'
      + '<div class="st-sec-plain"><h3><svg class="ic" aria-hidden="true"><use href="#i-briefcase"/></svg>项目台账 <span class="st-h3n">在跑的产品的报价记录</span></h3>'
      + projectsHTML() + '</div>';
  }

  function busyHTML(msg) {
    return '<div class="st-drop" style="cursor:default">'
      + '<div class="st-ic"><svg class="ic-lg" aria-hidden="true"><use href="#i-cube"/></svg></div>'
      + '<h3>' + esc(msg) + '</h3>'
      + '<p>大装配体可能需要十几秒，请稍候…</p></div>';
  }

  function resultHTML() {
    var e = S.estimate(st.parts, st.params);
    var h = [];

    /* 顶栏：文件信息 + 重新选择 */
    h.push('<div class="st-bar">'
      + '<div class="st-file"><svg class="ic" aria-hidden="true"><use href="#i-file-text"/></svg>'
      + '<b>' + esc(st.info.file) + '</b><span>' + esc(st.info.size) + '</span></div>'
      + '<button class="pill" id="stAgain"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg>换一个文件</button>'
      + '</div>');
    h.push(planBarHTML());
    if (st.applyMsg) h.push('<div class="st-applied"><svg class="ic" aria-hidden="true"><use href="#i-check-square"/></svg>' + esc(st.applyMsg) + '</div>');

    /* 左右分栏 */
    h.push('<div class="st-grid">');

    /* 左：3D + 概览 */
    h.push('<div>');
    h.push('<div class="st-stage" id="stStage">'
      + (st.needMesh
          ? '<div class="st-reload">'
            + '<svg class="ic-lg" aria-hidden="true"><use href="#i-upload-cloud"/></svg>'
            + '<b>这是从保存的记录恢复的方案</b>'
            + '<p>成本、模具方案、导出都已经完整恢复。想看 3D 预览，把 <em>' + esc((st.info && st.info.file) || "STEP 文件") + '</em> 再拖进来一次就行 —— 同名文件会自动套用现在这套配置。</p>'
            + '<button class="pill" id="stReloadPick"><svg class="ic" aria-hidden="true"><use href="#i-upload-cloud"/></svg>重新选择文件</button>'
            + '<input type="file" id="stFile2" accept=".step,.stp,.STEP,.STP,.igs,.iges,.brep" style="display:none">'
            + '</div>'
          : '<canvas id="stCanvas"></canvas>'
            + '<div class="st-btns">'
            + '<button class="st-mini" id="stReset" title="复位视角" aria-label="复位视角"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg></button>'
            + '</div>'
            + '<div class="st-hint" id="stHint">拖拽旋转 · 滚轮缩放 · 点击零件查看该零件包围盒</div>')
      + '</div>');
    h.push('<div class="st-meta">'
      + '<div><span>零件数</span><b>' + e.n + ' 个</b></div>'
      + '<div><span>总体积</span><b>' + S.vol(e.volSum) + '</b></div>'
      + '<div><span>总重量</span><b>' + S.grams(e.weighted) + '</b></div>'
      + '<div><span>总表面积</span><b>' + S.area(e.areaSum) + '</b></div>'
      + '<div><span>三角形</span><b>' + st.info.tris + '</b></div>'
      + '<div><span>包围盒 (mm)</span><b>' + st.info.bbox + '</b></div>'
      + '</div>');
    h.push('</div>');

    /* 右：装配树 */
    h.push('<div>');
    h.push('<div class="st-tree" id="stTree">' + treeHTML() + '</div>');
    h.push('</div>');
    h.push('</div>');

    /* 成本区 */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-coins"/></svg>成本估算</h3>');
    h.push('<div class="st-params">' + paramsHTML() + '</div>');
    h.push('<div id="stCost">' + costHTML() + '</div>');
    h.push('<div id="stSanity">' + sanityHTML() + '</div>');
    h.push('</div>');

    /* 模具方案 */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-wrench"/></svg>模具方案</h3>');
    h.push('<div class="st-privacy" style="margin:0 0 10px">每个零件默认独立开模；小件可以在装配树里展开「开模设置」，把多个零件勾选成共模拼进同一套模具（可多选）。滑块 / 行位、斜顶、热流道都会直接抬高模具报价，并相应拉长成型周期。</div>');
    h.push('<div id="stMolds">' + moldsHTML() + '</div>');
    h.push('</div>');

    /* 报价分析 */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-trending-up"/></svg>报价分析</h3>');
    h.push('<div id="stTiers">' + tiersHTML() + '</div>');
    h.push('</div>');

    /* 导出区 */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-cpu"/></svg>交给 AI 深入分析</h3>'
      + '<div class="st-privacy" style="margin:0 0 10px">本地已经算准了体积、重量与成本；把下面这段提示词连同数据一起发给 AI，让它帮你分析降本方向与工艺风险。</div>'
      + '<div class="st-tools">'
      + '<button class="pill" id="stPrompt"><svg class="ic" aria-hidden="true"><use href="#i-file-text"/></svg>生成 AI 提示词</button>'
      + '<button class="pill" id="stCsv"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>导出 CSV（Excel）</button>'
      + '</div><div id="stPromptBox"></div></div>');

    /* 正式报价单（给客户看的） */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-file-text"/></svg>生成报价单</h3>'
      + '<div class="st-privacy" style="margin:0 0 10px">CSV 是给工程师看的；这张是给客户 / 老板看的 —— 填好抬头点打印，在打印窗口里选「另存为 PDF」即可。</div>'
      + quoteFormHTML()
      + '<div class="st-tools"><button class="pill" id="stQuotePrint"><svg class="ic" aria-hidden="true"><use href="#i-file-text"/></svg>打印 / 存为 PDF</button></div></div>');

    /* 方案管理 */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-layers"/></svg>方案与对比</h3>'
      + plansSecHTML() + '</div>');

    /* 单价库 */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-tag"/></svg>单价库 <span class="st-h3n">把参考价改成你自己的实际价</span></h3>'
      + priceSecHTML() + '</div>');

    /* 项目台账 */
    h.push('<div class="st-sec"><h3><svg class="ic" aria-hidden="true"><use href="#i-briefcase"/></svg>项目台账 <span class="st-h3n">在跑的产品的报价记录</span></h3>'
      + projectsHTML() + '</div>');

    return h.join("");
  }

  function treeHTML() {
    var rows = [], i;
    rows.push('<div class="st-tr head"><div class="st-nm"><span>装配结构 / 零件（点击可展开开模设置）</span></div>'
      + '<div class="st-b">包围盒 mm</div><div class="st-v">体积</div><div class="st-w">重量</div></div>');
    for (i = 0; i < st.tree.length; i++) {
      var t = st.tree[i];
      if (!t.isPart) {
        rows.push('<div class="st-tr' + (t.depth ? ' off' : '') + '">'
          + '<div class="st-nm" style="padding-left:' + (t.depth * 12) + 'px">'
          + '<svg class="ic" aria-hidden="true"><use href="#i-layers"/></svg><span>' + esc(t.name) + '</span></div>'
          + '<div class="st-b"></div><div class="st-v"></div><div class="st-w"></div></div>');
      }
    }
    for (i = 0; i < st.parts.length; i++) {
      rows.push(partRowHTML(i));
      if (st.open[i]) rows.push(cfgRowHTML(i));
    }
    return rows.join("");
  }

  function partRowHTML(i) {
    var p = st.parts[i], m = S.matById(p.mat);
    var w = m.d > 0 ? (p.vol / 1000) * m.d : 0;
    var c = partColor(i);
    var opts = S.MATS.map(function (mm) {
      return '<option value="' + mm.id + '"' + (mm.id === p.mat ? " selected" : "") + '>' + esc(mm.n) + '</option>';
    }).join("");
    return '<div class="st-tr part' + (p.on ? "" : " off") + (st.sel === i ? " on" : "") + '" data-i="' + i + '">'
      + '<div class="st-nm" style="padding-left:' + ((p.depth + 1) * 12) + 'px">'
      + '<i style="background:rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')"></i>'
      + '<span title="' + esc(p.path) + '">' + esc(p.name) + '</span></div>'
      + '<div class="st-b" title="该零件的自身包围盒">'
      + p.dim.map(function (d) { return S.fix(d, 1); }).join("×") + '</div>'
      + '<div class="st-v">' + S.vol(p.vol) + '</div>'
      + '<div class="st-w">' + S.grams(w) + '</div>'
      + '<select class="st-sel" data-mat="' + i + '">' + opts + '</select>'
      + '<button class="st-mini" data-toggle="' + i + '" title="' + (p.on ? "不计入成本" : "计入成本") + '" aria-label="切换是否计入成本" style="width:24px;height:24px">'
      + '<svg class="ic" aria-hidden="true"><use href="#' + (p.on ? "i-check-square" : "i-x-circle") + '"/></svg></button>'
      + '</div>';
  }

  function paramsHTML() {
    var out = [];
    for (var key in S.PARAMS) if (S.PARAMS.hasOwnProperty(key)) {
      out.push('<div><label for="stp-' + key + '">' + esc(S.PARAMS[key].l) + '</label>'
        + '<input id="stp-' + key + '" data-p="' + key + '" type="number" step="any" value="' + st.params[key] + '"></div>');
    }
    return out.join("");
  }

  /* 下拉选项 */
  function optList(list, cur) {
    return list.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === cur ? " selected" : "") + '>' + esc(x.n) + '</option>';
    }).join("");
  }
  /* 共模多选：与本件拼在同一套模具里的零件可以勾多个 ——
     小件拼模（一模具装好几件）是常态，所以这里是「分组」不是「两两配对」。
       勾上  = 并入本件所在的模具（若该零件本就在别的模具里，则两套模具合并）
       取消  = 该零件脱离本套模具、改为独立开模
     标签上的「模 N」表示它当前还在第 N 套模具里，点一下就会并过来。 */
  function sharePickerHTML(i) {
    var mine = S.moldMembers(st.parts, i);
    var e = S.estimate(st.parts, st.params);
    var moldNo = {}, moldSize = {}, j;
    e.molds.forEach(function (m, k) {
      m.members.forEach(function (x) { moldNo[x] = k + 1; moldSize[x] = m.members.length; });
    });
    var o = ['<div class="st-share">'];
    o.push('<div class="st-share-h"><span>共模零件</span>'
      + '<em>可多选；勾上的零件与本件拼在同一套模具里</em>'
      + '<b>本套模具 ' + mine.length + ' 件</b>'
      + (mine.length > 1 ? '<button type="button" class="st-share-clr" data-shareclear="' + i + '">本件改为独立开模</button>' : '')
      + '</div>');
    var others = 0;
    for (j = 0; j < st.parts.length; j++) if (j !== i && st.parts[j].on) others++;
    if (!others) {
      o.push('<div class="st-share-none">没有其他零件可以合并</div>');
    } else {
      o.push('<div class="st-share-list">');
      for (j = 0; j < st.parts.length; j++) {
        if (j === i || !st.parts[j].on) continue;
        var on = mine.indexOf(j) >= 0;
        o.push('<button type="button" class="st-share-i' + (on ? " on" : "") + '"'
          + ' data-share="' + i + '|' + j + '"'
          + ' title="' + esc(st.parts[j].path || st.parts[j].name) + '">'
          + esc(st.parts[j].name)
          + (on ? '<i class="x">×</i>' : (moldSize[j] > 1 ? '<i>模 ' + moldNo[j] + '</i>' : ''))
          + '</button>');
      }
      o.push('</div>');
    }
    o.push('</div>');
    return o.join('');
  }

  /* ══════ 成本卡 ══════ */
  function costHTML() {
    var e = S.estimate(st.parts, st.params);
    var L = [];
    L.push('<div class="st-cost">');
    L.push('<div class="st-line"><span>材料费<span class="st-sub">' + e.n + ' 个零件 · 含损耗 ' + st.params.loss + '% · 水口料按回收折价抵扣</span></span><b>' + S.money(e.mat) + '</b></div>');
    L.push('<div class="st-line"><span>加工费<span class="st-sub">按各零件的机台吨位与模穴数分别推算</span></span><b>' + S.money(e.mach) + '</b></div>');
    L.push('<div class="st-line"><span>良率损失<span class="st-sub">良率 ' + st.params.yield + '%</span></span><b>' + S.money(e.yldLoss) + '</b></div>');
    L.push('<div class="st-line"><span>二次加工 / 表面处理<span class="st-sub">在零件上逐件设置</span></span><b>' + S.money(e.post) + '</b></div>');
    L.push('<div class="st-line"><span>包装</span><b>' + S.money(e.pack) + '</b></div>');
    L.push('<div class="st-line"><span>组装</span><b>' + S.money(e.asm) + '</b></div>');
    L.push('<div class="st-line"><span>模具摊销<span class="st-sub">模具总投入 ' + S.fix(e.moldTotal, 0) + ' 元 ÷ ' + S.fix(e.qty, 0) + ' 件</span></span><b>' + S.money(e.amort) + '</b></div>');
    L.push('<div class="st-total"><span>单件估算成本</span><span class="st-num">' + S.money(e.total) + '</span></div>');
    L.push('<div class="st-privacy" style="margin-top:10px">材料密度与单价、模具结构单价均为行业参考值，请按实际供应商报价调整。</div>');
    L.push('</div>');
    return L.join("");
  }

  /* ══════ 零件：开模设置面板 ══════ */
  function cfgRowHTML(i) {
    var p = st.parts[i], t = p.tool;
    var g = [];
    g.push('<div class="st-cfg" data-i="' + i + '">');
    g.push('<div class="st-cfg-grid">');
    g.push('<label>模穴数<input type="number" min="1" max="64" step="1" data-c="cav" data-i="' + i + '" value="' + (t.cav || 1) + '"></label>');
    g.push('<label>滑块 / 行位<input type="number" min="0" max="20" step="1" data-c="slides" data-i="' + i + '" value="' + (t.slides || 0) + '"></label>');
    g.push('<label>斜顶<input type="number" min="0" max="20" step="1" data-c="lifters" data-i="' + i + '" value="' + (t.lifters || 0) + '"></label>');
    g.push('<label>浇口形式<select data-c="runner" data-i="' + i + '">' + optList(S.RUNNERS, t.runner) + '</select></label>');
    g.push('<label>钢材<select data-c="steel" data-i="' + i + '">' + optList(S.STEELS, t.steel) + '</select></label>');
    g.push('<label>精度<select data-c="precision" data-i="' + i + '">' + optList(S.PRECISIONS, t.precision) + '</select></label>');
    g.push('<label>表面要求<select data-c="finish" data-i="' + i + '">' + optList(S.FINISHES, t.finish) + '</select></label>');
    g.push('<label>二次加工 (元/件)<input type="number" min="0" step="any" data-c="post" data-i="' + i + '" value="' + (t.post || 0) + '"></label>');
    g.push('<label>模具厂报价 (元，留空=按估算)<input type="number" min="0" step="any" data-c="quote" data-i="' + i + '" value="' + (t.quote === null || t.quote === undefined ? "" : t.quote) + '"></label>');
    g.push('</div>');
    g.push(sharePickerHTML(i));
    g.push('<div class="st-tools" style="margin-top:10px">'
      + '<button class="pill" data-push="' + i + '"><svg class="ic" aria-hidden="true"><use href="#i-calculator"/></svg>把这个零件带进成本估算</button></div>');
    g.push('<div class="st-cfg-note">' + cfgNoteHTML(i) + '</div>');
    g.push('</div>');
    return g.join("");
  }

  /* 该零件当前的推算结论（改任一配置项后只刷新这一行） */
  function cfgNoteHTML(i) {
    var e = S.estimate(st.parts, st.params);
    var r = null;
    for (var k = 0; k < e.perPart.length; k++) if (e.perPart[k].i === i) r = e.perPart[k];
    if (!r) return "";
    return '推算：投影 ' + S.fix(r.area, 1) + ' cm² → 锁模力 ' + S.fix(r.clamp, 1) + ' t → 机台 '
      + S.fix(r.tonnage, 0) + ' t（' + r.rate + ' 元/h）｜周期 ' + S.fix(r.cycle, 1) + ' s｜' + r.cav + ' 穴'
      + '｜材料 ' + S.money(r.mat) + '　加工 ' + S.money(r.mach) + '　模具摊销 ' + S.money(r.amort)
      + (r.mold ? '｜所属：模 ' + (e.molds.indexOf(r.mold) + 1) + '（' + S.money(r.mold.total) + '）' : '');
  }

  /* ══════ 模具投入清单 ══════ */
  function moldsHTML() {
    var e = S.estimate(st.parts, st.params);
    if (!e.molds.length) return '<div class="st-privacy">暂无参与计价的零件</div>';
    var L = ['<div class="st-molds">'];
    for (var mi = 0; mi < e.molds.length; mi++) {
      var m = e.molds[mi];
      L.push('<div class="st-mold' + (m.members.length > 1 ? " multi" : "") + (m.quoted ? " quoted" : "") + '">');
      L.push('<div class="st-mold-h"><b>模 ' + (mi + 1) + '</b>'
        + '<span>' + m.members.map(function (x) { return esc(st.parts[x].name); }).join('、')
        + '（' + (m.members.length > 1 ? '共模 ' + m.members.length + ' 件' : '单件模')
        + (m.cfg.cav > 1 ? ' · ' + m.cfg.cav + ' 穴' : '') + '）</span>'
        + '<em>' + S.money(m.total) + '</em></div>');
      L.push('<div class="st-mold-b">'
        + '<span>基准件 ' + esc(m.main.name) + '　投影 ' + S.fix(m.area, 0) + ' cm²</span>'
        + '<span>' + S.fix(m.base, 0) + ' × 穴数 ' + S.fix(m.kCav, 2) + ' × 钢材 ' + S.fix(m.steel.k, 2)
        + ' × 精度 ' + S.fix(m.prec.k, 2) + ' × 表面 ' + S.fix(m.fin.k, 2) + ' = ' + S.fix(m.core, 0) + ' 元</span>'
        + (m.slideCost ? '<span>滑块 / 行位 +' + S.fix(m.slideCost, 0) + ' 元</span>' : '')
        + (m.liftCost ? '<span>斜顶 +' + S.fix(m.liftCost, 0) + ' 元</span>' : '')
        + (m.runCost ? '<span>浇口系统 +' + S.fix(m.runCost, 0) + ' 元</span>' : '')
        + '<span>' + (m.quoted ? '模具厂实际报价' : '系统估算') + '</span>'
        + '</div>');
      L.push('</div>');
    }
    L.push('</div>');
    L.push('<div class="st-privacy">模具总投入 <b>' + S.money(e.moldTotal) + '</b>　共 ' + e.molds.length + ' 套　'
      + '（明细可在上方装配树里逐件调整；模具厂给了实际报价后填进去即可覆盖估算）</div>');
    return L.join("");
  }

  /* ══════ 报价分析：阶梯价 + 回本点 ══════ */
  function tiersHTML() {
    var e = S.estimate(st.parts, st.params);
    var tl = S.tiers(st.parts, st.params, [10000, 50000, 100000, 300000, 500000]);
    var cur = +st.params.qty;
    var L = ['<div class="st-tiers">'];
    L.push('<div class="st-tier head"><span>订单量</span><b>单件成本</b><span>其中模具摊销</span></div>');
    for (var i = 0; i < tl.length; i++) {
      var on = Math.abs(tl[i].qty - cur) < 1;
      L.push('<div class="st-tier' + (on ? " on" : "") + '"><span>' + tl[i].qty.toLocaleString() + ' 件'
        + (on ? '（当前）' : '') + '</span><b>' + S.money(tl[i].unit) + '</b>'
        + '<span>' + S.fix(tl[i].amort, 3) + ' 元</span></div>');
    }
    L.push('</div>');
    var be = S.breakEven(e, st.params.target);
    if (be && be.ok) {
      L.push('<div class="st-note">按目标售价 ' + S.money(st.params.target) + '：单件毛利 ' + S.money(be.gross)
        + '，模具投入 <b>' + S.money(e.moldTotal) + '</b> 需要 <b>' + be.qty.toLocaleString() + ' 件</b>才能收回</div>');
    } else if (be && !be.ok) {
      L.push('<div class="st-note warn">目标售价 ' + S.money(st.params.target) + ' 低于不含模具摊销的单件成本 '
        + S.money(be.variable) + '，模具投入永远收不回来</div>');
    } else {
      L.push('<div class="st-note">在下面「目标售价」里填一个价格，就能算出模具投入需要多少件收回</div>');
    }
    return L.join("");
  }

  /* ══════ 合理性提示 ══════ */
  function sanityHTML() {
    var e = S.estimate(st.parts, st.params);
    var w = S.sanity(st.parts, e);
    if (!w.length) return "";
    return '<div class="st-note warn" style="margin-top:12px">'
      + '<b>超出常规注塑范围，结果仅作量级参考：</b><br>'
      + w.map(function (x) { return "· " + esc(x); }).join("<br>") + '</div>';
  }

  /* ══════════════ 渲染与事件 ══════════════ */
  /* ══════════════ 方案 / 单价库 / 报价单 / 自动草稿 ══════════════ */
  var W = function () { return window.KB_WS; };

  function fmtTime(ts) {
    if (!ts) return "—";
    var d = new Date(ts), p = function (x) { return (x < 10 ? "0" : "") + x; };
    return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function plusDays(n) {
    var d = new Date(Date.now() + (isFinite(+n) ? +n : 30) * 864e5), p = function (x) { return (x < 10 ? "0" : "") + x; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* 方案里的零件：补齐默认字段（老记录也能载入） */
  function normParts(list) {
    return (list || []).map(function (p, i) {
      var tool = {}, k;
      for (k in (p.tool || {})) tool[k] = p.tool[k];
      return {
        id: i, nodeId: p.nodeId, depth: p.depth || 0, path: p.path || p.name,
        name: p.name, rawName: p.rawName || p.name, vol: p.vol, area: p.area, tris: p.tris,
        dim: p.dim || [0, 0, 0], min: p.min || null, max: p.max || null,
        mat: p.mat || "abs", on: p.on !== false, tool: tool
      };
    });
  }
  /* ⚠️ 必须深拷贝：tool / dim / min / max 都是引用，
     直接放进去会让「已保存的方案」跟着后续改动一起变 —— 那样对比出来的数字全一样，功能等于白做。 */
  function clone(x) { return x === null || x === undefined ? x : JSON.parse(JSON.stringify(x)); }
  function packParts(list) {
    return (list || []).map(function (p) {
      return { name: p.name, nodeId: p.nodeId, depth: p.depth, path: p.path,
        vol: p.vol, area: p.area, tris: p.tris,
        dim: clone(p.dim), min: clone(p.min), max: clone(p.max),
        mat: p.mat, on: p.on, tool: clone(p.tool || {}) };
    });
  }
  function packPlan(name) {
    return {
      id: st.planId || "",
      name: name || st.planName || (st.info && st.info.file) || "未命名方案",
      info: clone(st.info || {}), params: clone(st.params), parts: packParts(st.parts)
    };
  }
  function planParams(rec) {
    var P2 = {}, k;
    for (k in S.PARAMS) P2[k] = S.PARAMS[k].v;
    for (k in (rec.params || {})) if (rec.params.hasOwnProperty(k)) P2[k] = rec.params[k];
    return P2;
  }
  function estimateOfPlan(rec) { return S.estimate(normParts(rec.parts), planParams(rec)); }

  /* 载入方案：几何量都在记录里，所以成本/模具/导出能完整恢复，只有 3D 需要重新拖文件 */
  function applyPlan(rec) {
    st.parts = normParts(rec.parts);
    st.tree = []; st.meshes = null; st.geom = null;
    st.info = rec.info || { file: "（已保存的方案）", size: "", bbox: "—", tris: 0 };
    st.params = planParams(rec);
    st.planId = rec.id || ""; st.planName = rec.name || "";
    st.sel = -1; st.open = {}; st.err = ""; st.busy = false;
    st.parsed = true; st.needMesh = true;
    mount();
  }

  /* 找出与这个文件匹配的已存配置（先自动草稿，再方案） */
  function matchSaved(name, size) {
    var w = W(); if (!w) return null;
    var a = w.getAuto();
    if (a && a.file === name && (!size || !a.size || a.size === size)) return a;
    var list = w.plans();
    for (var i = 0; i < list.length; i++) {
      var f = list[i].info || {};
      if (f.file === name && (!size || !f.size || f.size === size)) return list[i];
    }
    return null;
  }
  /* 把已存配置按零件名套到新解析出的零件上 */
  function applyConfigToParts(parts, rec) {
    var src = rec.parts || [], byName = {}, i, k;
    for (i = 0; i < src.length; i++) if (!byName[src[i].name]) byName[src[i].name] = src[i];
    var hit = 0;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i], t = byName[p.name] || (src[i] && src[i].name === p.name ? src[i] : null);
      if (!t) continue;
      p.mat = t.mat || p.mat;
      p.on = t.on !== false;
      if (t.tool) for (k in t.tool) if (t.tool.hasOwnProperty(k)) p.tool[k] = t.tool[k];
      hit++;
    }
    return hit;
  }

  /* ══════ 自动草稿：改动后延迟写入，页面隐藏时立刻落盘 ══════ */
  var autoTimer = null;
  function autoFlush() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    var w = W();
    if (!w || !st.parsed || !st.parts.length) return;
    var rec = packPlan(st.planName || (st.info && st.info.file));
    rec.auto = true;
    rec.file = (st.info && st.info.file) || "";
    rec.size = st.fileSize || 0;
    w.setAuto(rec);
  }
  function autoSave(delay) {
    if (!st.parsed || !st.parts.length || st.needMesh && !st.parts.length) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(autoFlush, delay === undefined ? 1200 : delay);
  }
  window.addEventListener("beforeunload", function () { autoFlush(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") autoFlush();
  });

  /* ══════ 上传页：继续上次的报价 ══════ */
  function resumeHTML() {
    var w = W(); if (!w) return "";
    var a = w.getAuto();
    if (!a || !a.parts || !a.parts.length) return "";
    var e = null;
    try { e = estimateOfPlan(a); } catch (x) { e = null; }
    var line = esc(a.file || a.name || "（未命名）") + " · " + a.parts.length + " 个零件 · " + fmtTime(a.at);
    if (e) line += " · 单件成本 " + S.money(e.total);
    return '<div class="st-resume">'
      + '<div class="st-resume-h"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>'
      + '<b>上次的报价还在</b><span>' + line + '</span></div>'
      + '<div class="st-tools">'
      + '<button class="pill" id="stResume"><svg class="ic" aria-hidden="true"><use href="#i-refresh"/></svg>继续上次的报价</button>'
      + '<button class="pill" id="stResumeDrop">都清掉，重新开始</button>'
      + '</div></div>';
  }

  /* ══════ 结果页顶栏：当前方案 ══════ */
  function planBarHTML() {
    var w = W(), n = w ? w.plans().length : 0;
    return '<div class="st-planbar">'
      + '<span class="st-pb-l">方案名</span>'
      + '<input id="stPlanName" type="text" value="' + esc(st.planName || "") + '" placeholder="如：夜灯A-4穴ABS（不填就按文件名）">'
      + '<button class="pill" id="stPlanSave"><svg class="ic" aria-hidden="true"><use href="#i-save"/></svg>保存方案</button>'
      + '<span class="st-pb-n">已存 ' + n + ' 个</span>'
      + '</div>';
  }

  /* ══════ 单价库 ══════ */
  function priceSecHTML() {
    var w = W(); if (!w) return '<div class="st-empty">单价库未加载</div>';
    var L = [];
    L.push('<div class="st-price">');
    L.push('<div class="st-privacy" style="margin:0 0 12px">下面是<b>行业参考值</b>。改成你自己供应商的真实价格后，会立刻作用于所有报价 —— 只存你改过的项，没改的继续跟随参考值。</div>');

    L.push('<div class="st-ph"><b>材料单价与密度</b><span>元 / kg　·　密度 g/cm³</span>'
      + '<button class="st-mini-t" data-wreset="mat">恢复材料默认</button></div>');
    L.push('<div class="st-ptable">');
    L.push('<div class="st-prow st-prow-mat head"><span>材料</span><span>密度</span><span>单价</span><span class="st-pu">用途</span></div>');
    w.mats().forEach(function (m) {
      L.push('<div class="st-prow st-prow-mat">'
        + '<span class="st-pn">' + esc(m.n) + (m.pChg || m.dChg ? '<i>已改</i>' : '') + '</span>'
        + '<span><input type="number" step="any" min="0" data-wp="den" data-wid="' + m.id + '" value="' + m.d + '" title="默认 ' + m.d0 + '"></span>'
        + '<span><input type="number" step="any" min="0" data-wp="mat" data-wid="' + m.id + '" value="' + m.p + '" title="默认 ' + m.p0 + '"></span>'
        + '<span class="st-pu">' + esc(m.use || "") + '</span></div>');
    });
    L.push('</div>');

    L.push('<div class="st-ph"><b>模具结构单价与系数</b><span>滑块 / 斜顶 / 浇口按行业报价区间</span>'
      + '<button class="st-mini-t" data-wreset="tool">恢复默认</button></div>');
    L.push('<div class="st-ptable st-ptable-tool">');
    w.TOOL_DEF.forEach(function (t) {
      var cur = w.toolOf(t.k, t.v), chg = cur !== t.v;
      L.push('<div class="st-prow st-prow-tool">'
        + '<span class="st-pn">' + esc(t.n) + (chg ? '<i>已改</i>' : '') + '</span>'
        + '<span><input type="number" step="' + (t.step || "any") + '" min="0" data-wt="' + t.k + '" value="' + cur + '" title="默认 ' + t.v + '"></span>'
        + '<span class="st-pu">' + esc(t.d || "") + '</span></div>');
    });
    L.push('</div>');

    L.push('<div class="st-ph"><b>机时费档位</b><span>按注塑机吨位区间，元 / 小时</span>'
      + '<button class="st-mini-t" data-wreset="rate">恢复默认</button></div>');
    L.push('<div class="st-ptable st-ptable-rate">');
    w.rateTable().forEach(function (r, i) {
      var lab = r.cap === Infinity ? "> 650 t" : (i === 0 ? "≤ 80 t" : "≤ " + r.cap + " t");
      L.push('<div class="st-prow st-prow-rate">'
        + '<span class="st-pn">' + lab + (r.chg ? '<i>已改</i>' : '') + '</span>'
        + '<span><input type="number" step="any" min="0" data-wr="' + i + '" value="' + r.v + '" title="默认 ' + r.v0 + '"></span></div>');
    });
    L.push('</div>');

    L.push('<div class="st-pfoot"><span class="st-privacy" style="margin:0">已自定义 <b>' + w.changedCount() + '</b> 项</span>'
      + '<button class="pill" data-wact2="export"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>导出单价库</button>'
      + '<button class="pill" data-wact2="import"><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg>导入单价库</button>'
      + '<button class="pill" data-wact2="resetAll">全部恢复默认</button>'
      + '<input type="file" id="stPriceFile" accept=".json" style="display:none"></div>');
    L.push('</div>');
    return L.join("");
  }

  /* ══════ 方案列表 + 对比 ══════ */
  function plansSecHTML() {
    var w = W(); if (!w) return "";
    var list = w.plans(), L = [];
    L.push('<div class="st-privacy" style="margin:0 0 12px">模型和配置会自动留底（刷新、关掉页面都不丢）。把成套的配置「保存方案」，之后可以随时载入，或者勾两个并排比一比哪个划算。</div>');
    if (!list.length) {
      L.push('<div class="st-empty">还没有保存过方案。在上面填个名字，点「保存方案」就行。</div>');
      L.push('<div id="stCompare"></div>');
      return L.join("");
    }
    L.push('<div class="st-ptable st-ptable-plan">');
    L.push('<div class="st-prow st-prow-plan head"><span class="c1">方案</span><span class="c2">单件成本</span><span class="c3">模具投入</span><span class="c4">保存于</span><span class="c5">操作</span></div>');
    list.forEach(function (p) {
      var e = null; try { e = estimateOfPlan(p); } catch (x) { e = null; }
      L.push('<div class="st-prow st-prow-plan' + (p.id === st.planId ? " on" : "") + '">'
        + '<span class="c1"><input type="checkbox" data-pcmp="' + p.id + '" aria-label="选择对比">'
        + '<b>' + esc(p.name) + '</b><i>' + (p.parts ? p.parts.length : 0) + ' 个零件 · ' + esc((p.info && p.info.file) || "") + '</i></span>'
        + '<span class="c2">' + (e ? S.money(e.total) : "—") + '</span>'
        + '<span class="c3">' + (e ? S.fix(e.moldTotal, 0) + " 元" : "—") + '</span>'
        + '<span class="c4">' + fmtTime(p.at) + '</span>'
        + '<span class="c5"><button data-pact="load" data-pid="' + p.id + '">载入</button>'
        + '<button data-pact="rename" data-pid="' + p.id + '">改名</button>'
        + '<button data-pact="del" data-pid="' + p.id + '">删除</button></span></div>');
    });
    L.push('</div>');
    L.push('<div class="st-pfoot"><button class="pill" data-pact="compare">并排对比选中的方案</button>'
      + '<span class="st-privacy" style="margin:0">勾选 2-3 个再点</span></div>');
    L.push('<div id="stCompare"></div>');
    return L.join("");
  }

  function compareHTML(ids) {
    var w = W(); if (!w) return "";
    var recs = ids.map(function (id) { return w.getPlan(id); }).filter(Boolean);
    if (recs.length < 2) return '<div class="st-empty">至少勾选 2 个方案才能对比。</div>';
    var cols = recs.map(function (r) {
      var mats = {}, i;
      for (i = 0; i < (r.parts || []).length; i++) mats[r.parts[i].mat] = 1;
      var names = [];
      for (var k in mats) if (mats.hasOwnProperty(k)) names.push(S.matById(k).n);
      return { name: r.name, e: estimateOfPlan(r), mats: names };
    });
    var rows = [
      ["单件成本", function (c) { return S.money(c.e.total); }, "total"],
      ["　材料费", function (c) { return S.money(c.e.mat); }],
      ["　加工费", function (c) { return S.money(c.e.mach); }],
      ["　模具摊销", function (c) { return S.money(c.e.amort); }],
      ["模具投入", function (c) { return S.fix(c.e.moldTotal, 0) + " 元"; }, "moldTotal"],
      ["模具套数", function (c) { return c.e.molds.length + " 套"; }],
      ["总重量", function (c) { return S.grams(c.e.weighted); }],
      ["计入零件", function (c) { return c.e.n + " 个"; }],
      ["订单量", function (c) { return S.fix(c.e.qty, 0) + " 件"; }],
      ["用到的材料", function (c) { return c.mats.length + " 种"; }]
    ];
    var best = {};
    rows.forEach(function (r) {
      if (!r[2]) return;
      var idx = -1, val = Infinity;
      cols.forEach(function (c, i) { var v = c.e[r[2]]; if (v < val) { val = v; idx = i; } });
      best[r[0]] = idx;
    });
    var L = ['<div class="st-cmp-wrap"><table class="st-cmp"><thead><tr><th>指标</th>'];
    cols.forEach(function (c) { L.push('<th>' + esc(c.name) + '</th>'); });
    L.push('</tr></thead><tbody>');
    rows.forEach(function (r) {
      L.push('<tr><td class="k">' + esc(r[0]) + '</td>');
      cols.forEach(function (c, i) {
        var good = best[r[0]] === i;
        L.push('<td' + (good ? ' class="best"' : '') + '>' + esc(r[1](c)) + (good ? '<i>最优</i>' : '') + '</td>');
      });
      L.push('</tr>');
    });
    L.push('</tbody></table></div>');
    return L.join("");
  }

  /* ══════ 报价单（打印 / 存 PDF） ══════ */
  function quoteFormHTML() {
    if (!st.quote) st.quote = { customer: "", valid: 30, note: "" };
    var q = st.quote;
    return '<div class="st-qform">'
      + '<label>客户 / 项目<input id="stQCustomer" type="text" value="' + esc(q.customer) + '" placeholder="填了会印在报价单上"></label>'
      + '<label>有效期 (天)<input id="stQValid" type="number" min="1" step="1" value="' + q.valid + '"></label>'
      + '<label class="st-qnote">备注<input id="stQNote" type="text" value="' + esc(q.note) + '" placeholder="如：以上为不含税单价，模具费预付 50%"></label>'
      + '</div>';
  }
  function w0matsTxt() {
    var w = W(), ids = {}, i, arr = [];
    for (i = 0; i < st.parts.length; i++) if (st.parts[i].on) ids[st.parts[i].mat] = 1;
    var all = w ? w.mats() : [];
    for (var id in ids) if (ids.hasOwnProperty(id)) {
      for (i = 0; i < all.length; i++) if (all[i].id === id) arr.push(all[i].n + " " + all[i].p + " 元/kg");
    }
    return arr.length ? arr.join("、") : "行业参考值";
  }
  function quoteSheetHTML() {
    var e = S.estimate(st.parts, st.params), q = st.quote || {};
    var L = [];
    L.push('<div class="st-q">');
    L.push('<h1>零件报价单</h1>');
    L.push('<table class="st-q-meta"><tbody>');
    L.push('<tr><th>产品 / 项目</th><td>' + esc(st.planName || (st.info && st.info.file) || "—") + '</td>'
      + '<th>报价日期</th><td>' + today() + '</td></tr>');
    L.push('<tr><th>客户</th><td>' + esc(q.customer || "—") + '</td>'
      + '<th>有效期</th><td>' + (q.valid || 30) + ' 天（至 ' + plusDays(q.valid) + '）</td></tr>');
    L.push('</tbody></table>');

    L.push('<h2>一、单件成本构成</h2>');
    L.push('<table class="st-q-t"><tbody>');
    var lines = [
      ["材料费（含损耗；水口料按回收折价抵扣）", e.mat],
      ["加工费（按机台吨位与模穴数分摊）", e.mach],
      ["良率损失", e.yldLoss],
      ["二次加工 / 表面处理", e.post],
      ["包装", e.pack],
      ["组装", e.asm],
      ["模具摊销（模具投入 " + S.fix(e.moldTotal, 0) + " 元 ÷ " + S.fix(e.qty, 0) + " 件）", e.amort]
    ];
    lines.forEach(function (r) {
      if (!r[1]) return;
      L.push('<tr><td>' + esc(r[0]) + '</td><td class="n">' + S.money(r[1]) + '</td></tr>');
    });
    L.push('<tr class="sum"><td>单件成本合计</td><td class="n">' + S.money(e.total) + '</td></tr>');
    L.push('</tbody></table>');

    var tiers = S.tiers(st.parts, st.params, [10000, 50000, 100000, 300000, 500000]);
    L.push('<h2>二、订单量阶梯价</h2>');
    L.push('<table class="st-q-t"><thead><tr><th>订单量（件）</th>');
    tiers.forEach(function (t) { L.push('<th class="n">' + S.fix(t.qty, 0) + '</th>'); });
    L.push('</tr></thead><tbody><tr><td>单件单价（元）</td>');
    tiers.forEach(function (t) { L.push('<td class="n">' + S.fix(t.unit, 3) + '</td>'); });
    L.push('</tr><tr><td>其中模具摊销</td>');
    tiers.forEach(function (t) { L.push('<td class="n">' + S.fix(t.amort, 4) + '</td>'); });
    L.push('</tr></tbody></table>');

    L.push('<h2>三、零件明细</h2>');
    L.push('<table class="st-q-t"><thead><tr><th>序号</th><th>零件名称</th><th>材料</th>'
      + '<th class="n">体积(cm³)</th><th class="n">重量(g)</th><th class="n">模穴</th>'
      + '<th class="n">材料费</th><th class="n">加工费</th><th class="n">模具摊销</th><th class="n">小计</th></tr></thead><tbody>');
    var k = 0;
    e.perPart.forEach(function (r) {
      if (!r.pt.on) return;
      k++;
      L.push('<tr><td>' + k + '</td><td>' + esc(r.pt.name) + '</td><td>' + esc(S.matById(r.pt.mat).n) + '</td>'
        + '<td class="n">' + S.fix(r.pt.vol / 1000, 2) + '</td><td class="n">' + S.fix(r.netW, 2) + '</td>'
        + '<td class="n">' + r.cav + '</td><td class="n">' + S.fix(r.mat, 4) + '</td>'
        + '<td class="n">' + S.fix(r.mach, 4) + '</td><td class="n">' + S.fix(r.amort, 4) + '</td>'
        + '<td class="n">' + S.fix(r.mat + r.mach + r.post + r.amort, 4) + '</td></tr>');
    });
    L.push('</tbody></table>');

    L.push('<h2>四、模具投入</h2>');
    L.push('<table class="st-q-t"><thead><tr><th>模具</th><th>涉及零件</th><th class="n">穴数</th>'
      + '<th>钢材</th><th>浇口</th><th class="n">滑块</th><th class="n">斜顶</th><th class="n">金额(元)</th></tr></thead><tbody>');
    e.molds.forEach(function (m, i) {
      L.push('<tr><td>模 ' + (i + 1) + '</td><td>' + esc(m.members.map(function (x) { return st.parts[x].name; }).join("、")) + '</td>'
        + '<td class="n">' + m.cav + '</td><td>' + esc(m.steel.n) + '</td><td>' + esc(S.byId(S.RUNNERS, m.cfg.runner).n) + '</td>'
        + '<td class="n">' + (m.cfg.slides || 0) + '</td><td class="n">' + (m.cfg.lifters || 0) + '</td>'
        + '<td class="n">' + S.fix(m.total, 0) + '</td></tr>');
    });
    L.push('<tr class="sum"><td colspan="7">模具总投入</td><td class="n">' + S.fix(e.moldTotal, 0) + '</td></tr>');
    L.push('</tbody></table>');

    L.push('<h2>五、说明</h2>');
    L.push('<div class="st-q-note">'
      + '<p>1. 以上单价按订单量 ' + S.fix(e.qty, 0) + ' 件核算；数量变化时单价需重新确认。</p>'
      + '<p>2. 材料单价按「' + esc(w0matsTxt()) + '」核算。</p>'
      + '<p>3. 报价不含运费、税费与认证费用；如需含入请另行说明。</p>'
      + (st.quote && st.quote.note ? '<p>4. ' + esc(st.quote.note) + '</p>' : '')
      + '</div>');
    L.push('<table class="st-q-sign"><tbody><tr><th>供方（盖章）</th><td></td><th>需方（盖章）</th><td></td></tr></tbody></table>');
    L.push('</div>');
    return L.join("");
  }
  /* 打印报价单：临时把报价单挂到 <body> 上（放在页面内部会被层级规则连带隐藏），
     打完再摘掉。打印件强制浅色，不跟随深色模式。 */
  function printQuote() {
    var c = $("stQCustomer"), v = $("stQValid"), nt = $("stQNote");
    st.quote = {
      customer: c ? c.value : "",
      valid: v && isFinite(parseFloat(v.value)) ? parseFloat(v.value) : 30,
      note: nt ? nt.value : ""
    };
    var host = document.createElement("div");
    host.className = "st-quote-wrap";
    host.id = "stQuoteSheet";
    host.innerHTML = quoteSheetHTML();
    document.body.appendChild(host);
    document.body.classList.add("printing-quote");
    setTimeout(function () {
      window.print();
      setTimeout(function () {
        document.body.classList.remove("printing-quote");
        if (host.parentNode) host.parentNode.removeChild(host);
      }, 600);
    }, 80);
  }


  /* ══════════════ 模块联动：STEP → 成本估算计算器 ══════════════ */
  function pushToCalc(i) {
    var pt = st.parts[i];
    if (!pt) return;
    var e = S.estimate(st.parts, st.params), r = null, k;
    for (k = 0; k < e.perPart.length; k++) if (e.perPart[k].i === i) r = e.perPart[k];
    if (!r) return;
    var w = W(), m = S.matById(pt.mat);
    var vals = {
      w: Math.round(r.netW * 100) / 100,
      price: Math.round((w ? w.matPrice(m.id, m.p) : m.p) * 100) / 100,
      loss: +st.params.loss,
      rate: Math.round(r.rate * 10) / 10,
      cycle: Math.round(r.cycle * 10) / 10,
      cav: r.cav,
      yield: +st.params.yield,
      extra: Math.round(((+pt.tool.post) || 0) + (+st.params.pack || 0) + (+st.params.asm || 0))
    };
    if (w) for (k in vals) if (vals.hasOwnProperty(k)) w.calcSet("cost", k, vals[k]);
    switchMod("calc");
    setTimeout(function () {
      var card = null, cards = document.querySelectorAll("#calcBody .calc-card");
      Array.prototype.forEach.call(cards, function (c) {
        if (c.querySelector("h4") && c.querySelector("h4").textContent.indexOf("塑料件成本估算") >= 0) card = c;
      });
      if (!card) return;
      try { card.scrollIntoView({ block: "center" }); } catch (e2) {}
      card.classList.add("hi");
      setTimeout(function () { card.classList.remove("hi"); }, 1800);
    }, 260);
  }

  /* ══════════════ 项目台账 ══════════════ */
  function projRowHTML(j) {
    var w = W();
    return '<div class="st-prow st-prow-proj">'
      + '<span><input type="text" data-pj="name" data-jid="' + j.id + '" value="' + esc(j.name) + '" placeholder="产品名"></span>'
      + '<span><input type="text" data-pj="customer" data-jid="' + j.id + '" value="' + esc(j.customer) + '" placeholder="客户"></span>'
      + '<span><input type="number" step="any" min="0" data-pj="qty" data-jid="' + j.id + '" value="' + (j.qty || "") + '" placeholder="订单量"></span>'
      + '<span><input type="number" step="any" min="0" data-pj="unitCost" data-jid="' + j.id + '" value="' + (j.unitCost || "") + '" placeholder="成本"></span>'
      + '<span><input type="number" step="any" min="0" data-pj="price" data-jid="' + j.id + '" value="' + (j.price || "") + '" placeholder="报价"></span>'
      + '<span><select data-pj="status" data-jid="' + j.id + '">'
        + (w ? w.PROJ_STATUS.map(function (s) {
            return '<option value="' + s + '"' + (s === j.status ? " selected" : "") + '>' + s + '</option>';
          }).join("") : "")
      + '</select></span>'
      + '<span class="c7"><b>' + (j.price && j.unitCost ? S.fix(j.price - j.unitCost, 3) : "—") + '</b>'
        + '<i>' + (j.price && j.unitCost ? (j.unitCost ? "毛利 " + Math.round((j.price - j.unitCost) / j.price * 100) + "%" : "") : "") + '</i></span>'
      + '<span class="c8"><button data-jact="del" data-jid="' + j.id + '">删除</button></span>'
      + '</div>';
  }
  function projectsHTML() {
    var w = W(); if (!w) return "";
    var list = w.projects();
    var L = ['<div class="st-proj">'];
    L.push('<div class="st-privacy" style="margin:0 0 12px">在跑的产品的报价记录：客户、订单量、成本、报价、状态。'
      + '和「方案」不同 —— 方案是<b>一套配置</b>，台账是<b>一个产品这一单</b>。存在你自己的浏览器里，可随备份一起导出。</div>');
    if (st.parsed && st.parts.length) {
      L.push('<div class="st-tools" style="margin-bottom:10px">'
        + '<button class="pill" data-jact="fromquote"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg>把当前报价存进台账</button></div>');
    }
    if (!list.length) {
      L.push('<div class="st-empty">还没有记录。上面那个按钮可以直接从当前报价建一条，也可以点下面「新增一行」手填。</div>');
    } else {
      L.push('<div class="st-ptable st-ptable-proj">');
      L.push('<div class="st-prow st-prow-proj head"><span>产品</span><span>客户</span><span>订单量</span>'
        + '<span>单件成本</span><span>报价</span><span>状态</span><span class="c7">毛利</span><span class="c8">操作</span></div>');
      list.forEach(function (j) { L.push(projRowHTML(j)); });
      L.push('</div>');
      L.push('<div class="st-pfoot"><span class="st-privacy" style="margin:0">共 ' + list.length + ' 条'
        + (list.length && list.some(function (x) { return x.moldCost; })
            ? '　·　模具投入合计 ' + S.fix(list.reduce(function (a, x) { return a + (+x.moldCost || 0); }, 0), 0) + ' 元'
            : '') + '</span></div>');
    }
    L.push('<div class="st-pfoot"><button class="pill" data-jact="add">新增一行</button>'
      + (list.length ? '<button class="pill" data-jact="csv"><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>导出台账 CSV</button>' : '')
      + (list.length ? '<button class="pill" data-jact="clear">清空台账</button>' : '')
      + '</div></div>');
    return L.join("");
  }
  function projectFromQuote() {
    var w = W(); if (!w) return;
    var e = S.estimate(st.parts, st.params);
    var top = null;
    st.parts.forEach(function (p) { if (p.on && (!top || p.vol > top.vol)) top = p; });
    w.saveProject({
      name: st.planName || (st.info && st.info.file) || "未命名产品",
      customer: (st.quote && st.quote.customer) || "",
      qty: st.params.qty,
      mat: top ? S.matById(top.mat).n : "",
      unitCost: Math.round(e.total * 1000) / 1000,
      moldCost: Math.round(e.moldTotal),
      price: +st.params.target || 0,
      status: "报价中",
      planId: st.planId || ""
    });
    refreshSection("项目台账", '<h3><svg class="ic" aria-hidden="true"><use href="#i-briefcase"/></svg>项目台账 <span class="st-h3n">在跑的产品的报价记录</span></h3>' + projectsHTML());
  }
  /* 按标题局部重绘某个区块（避免整页重绘丢滚动位置） */
  function refreshSection(title, html) {
    var secs = document.querySelectorAll("#stepBody .st-sec, #stepBody .st-sec-plain");
    Array.prototype.forEach.call(secs, function (sec) {
      var h = sec.querySelector("h3");
      if (h && h.textContent.indexOf(title) >= 0) sec.innerHTML = html;
    });
  }
  function projCsv() {
    var w = W(); if (!w) return "";
    var q = function (v) { var s = String(v === undefined || v === null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var L = [["产品", "客户", "订单量", "材料", "单件成本(元)", "模具费(元)", "报价(元)", "毛利(元)", "毛利率", "状态", "备注"].map(q).join(",")];
    w.projects().forEach(function (j) {
      var gp = j.price && j.unitCost ? j.price - j.unitCost : "";
      L.push([j.name, j.customer, j.qty || "", j.mat || "", j.unitCost || "", j.moldCost || "", j.price || "",
        gp === "" ? "" : S.fix(gp, 3), gp === "" ? "" : Math.round(gp / j.price * 100) + "%",
        j.status || "", j.note || ""].map(q).join(","));
    });
    return L.join("\n");
  }

  var viewer = null;

  function mount() {
    var body = $("stepBody");
    if (!body) return;
    if (st.busy) { body.innerHTML = busyHTML(st.busyMsg || "正在解析…"); return; }
    if (!st.parsed) {
      body.innerHTML = uploadHTML() + (st.err
        ? '<div class="st-cost" style="margin-top:14px; border-color:var(--danger-bd); background:var(--danger-bg)">'
          + '<div style="font-size:var(--fs-sm); color:var(--danger); display:flex; gap:var(--sp-4); align-items:flex-start">'
          + '<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg><span>' + esc(st.err) + '</span></div></div>'
        : "");
      bindUpload();
      return;
    }
    body.innerHTML = resultHTML();
    bindResult();
    mountViewer();
  }

  function mountViewer() {
    var cv = $("stCanvas");
    if (!cv) return;
    viewer = Viewer(cv);
    if (!viewer) {
      $("stStage").innerHTML = '<div style="padding:40px 16px;text-align:center;color:var(--tx-faint);font-size:var(--fs-xs)">'
        + '当前浏览器不支持 WebGL，3D 预览不可用（其余功能不受影响）</div>';
      return;
    }
    viewer.setBg([0.96, 0.97, 0.99]);
    if (document.documentElement.getAttribute("data-theme") === "dark") viewer.setBg([0.08, 0.11, 0.17]);
    viewer.upload(toGeom(st.meshes, st.parts));
    viewer.draw();

    var stage = $("stStage");
    var dragging = false, lx = 0, ly = 0, moved = 0;
    function down(x, y) { dragging = true; lx = x; ly = y; moved = 0; stage.classList.add("drag"); }
    function move(x, y) {
      if (!dragging) return;
      var r = viewer.rot();
      var ry = r[1] + (x - lx) * 0.01;
      var rx = Math.max(-1.5, Math.min(1.5, r[0] + (y - ly) * 0.01));
      viewer.setRot(rx, ry);
      moved += Math.abs(x - lx) + Math.abs(y - ly);
      lx = x; ly = y;
      viewer.draw();
    }
    function up(x, y) {
      if (!dragging) return;
      dragging = false; stage.classList.remove("drag");
      if (moved < 4) {
        var r = cv.getBoundingClientRect();
        var hit = viewer.pick(x - r.left, y - r.top);
        st.sel = (hit >= 0 && hit < st.parts.length) ? hit : -1;
        updateSelection();
        var tree = $("stTree");
        if (tree) {
          tree.innerHTML = treeHTML();
          var row = tree.querySelector('.st-tr.part[data-i="' + st.sel + '"]');
          if (row && row.scrollIntoView) { try { row.scrollIntoView({ block: "nearest" }); } catch (e2) {} }
        }
      }
    }
    cv.addEventListener("mousedown", function (e) { down(e.clientX, e.clientY); e.preventDefault(); });
    window.addEventListener("mousemove", function (e) { if (dragging) move(e.clientX, e.clientY); });
    window.addEventListener("mouseup", function (e) { if (dragging) up(e.clientX, e.clientY); });
    cv.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) { down(e.touches[0].clientX, e.touches[0].clientY); }
    }, { passive: true });
    cv.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1 && dragging) { move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
    }, { passive: false });
    cv.addEventListener("touchend", function (e) {
      var t = e.changedTouches[0]; if (t) up(t.clientX, t.clientY);
    });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      var z = viewer.getZoom() * (e.deltaY > 0 ? 0.92 : 1.08);
      viewer.setZoom(Math.max(0.3, Math.min(6, z)));
      viewer.draw();
    }, { passive: false });

    var rb = $("stReset");
    if (rb) rb.onclick = function () { viewer.setRot(-0.5, 0.6); viewer.setZoom(1); viewer.draw(); };
  }

  function bindUpload() {
    var drop = $("stDrop"), input = $("stFile");
    if (!drop) return;
    var open = function () { input.click(); };
    drop.onclick = open;
    drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    input.onchange = function () { if (input.files && input.files[0]) handle(input.files[0]); };
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handle(f);
    });
    /* 继续上次的报价 / 清掉草稿 */
    var rs = $("stResume"), rd = $("stResumeDrop"), w = W();
    if (rs && w) rs.onclick = function () {
      var a = w.getAuto();
      if (a) { st.applyMsg = ""; applyPlan(a); }
    };
    if (rd && w) rd.onclick = function () {
      if (!confirm("清掉自动保存的草稿？清掉后刷新页面就不能恢复这次的结果了（已保存的方案不受影响）。")) return;
      w.clearAuto();
      mount();
    };
  }

  /* 扩展名 → 引擎格式（occt-import-js 同时支持 step / iges / brep） */
  function fmtOf(name) {
    var ext = (String(name).split(".").pop() || "").toLowerCase();
    if (ext === "igs" || ext === "iges") return "iges";
    if (ext === "brep") return "brep";
    return "step";
  }

  function handle(file) {
    if (st.busy) return;   // 已有解析在跑（忙碌态正常不显示上传区，防御重复拖拽）
    st.fileSize = file.size || 0;
    st.applyMsg = "";
    st.planId = ""; st.planName = "";
    var mb = file.size / 1024 / 1024;
    var fmt = fmtOf(file.name);
    if (mb > 120) {
      st.busy = false; st.parsed = false;
      st.err = "文件 " + S.fix(mb, 0) + " MB 超过 120 MB 上限，浏览器端解析大概率失败。请先在 CAD 里精简或分拆装配体";
      mount();
      return;
    }
    st.busy = true; st.busyMsg = "正在读取 " + file.name + " …";
    mount();
    file.arrayBuffer().then(function (ab) {
      st.busyMsg = "正在解析几何（" + S.fix(mb, 1) + " MB）…";
      mount();
      return parseBuffer(new Uint8Array(ab), fmt, function (msg) { st.busyMsg = msg; mount(); });
    }).then(function (res) {
      st.busy = false;
      if (!res || !res.success) {
        var what = fmt === "step" ? "STEP" : fmt === "iges" ? "IGES" : "BREP";
        st.err = "解析失败：文件可能不是有效的 " + what + "，或使用了不支持的高级实体";
        st.parsed = false; mount(); return;
      }
      /* 结果契约检查：meshStats/toGeom 都直接读 position.array 与 index.array，
         缺失会让后续渲染崩掉，这里提前拦住给出可读的错误 */
      var meshes;
      try {
        meshes = (res.meshes || []).map(function (m) {
          return { name: m.name, stats: S.meshStats(m) };
        });
      } catch (e) {
        st.err = "解析结果不完整（网格缺少顶点或索引数据），文件可能已损坏";
        st.parsed = false; mount(); return;
      }
      if (!meshes.length || !res.root) {
        st.err = "解析完成但没有可显示的几何：模型可能为空，或只含不支持的实体";
        st.parsed = false; mount(); return;
      }
      var flat = S.flatten(res.root, meshes);
      st.parts = flat.parts;
      st.tree = flat.tree;
      st.meshes = res.meshes;
      st.geom = meshes;
      var bb = [0, 0, 0], tris = 0;
      st.parts.forEach(function (p) {
        tris += p.tris;
        for (var c = 0; c < 3; c++) bb[c] = Math.max(bb[c], p.dim[c]);
      });
      st.info = {
        file: file.name,
        size: S.fix(mb, mb < 1 ? 2 : 1) + " MB",
        bbox: bb.map(function (x) { return S.fix(x, 0); }).join(" × "),
        tris: tris
      };
      st.parsed = true;
      st.needMesh = false;
      /* 同名文件：自动套用上次对它做的配置（材料 / 共模 / 开模设置） */
      try {
        var prev = matchSaved(file.name, file.size);
        if (prev) {
          var hit = applyConfigToParts(st.parts, prev);
          if (hit) st.applyMsg = "已自动套用上次对「" + file.name + "」的配置（" + hit + " 个零件）";
        }
      } catch (e2) {}
      mount();
      autoSave(400);
    }).catch(function (err) {
      st.busy = false; st.parsed = false;
      st.err = err && err.message ? err.message : "解析出错";
      mount();
    });
  }

  function bindResult() {
    bindWorkspace();
    var again = $("stAgain");
    if (again) again.onclick = function () { st.parsed = false; st.parts = []; st.sel = -1; st.err = ""; mount(); };

    var tree = $("stTree");
    if (tree) {
      /* 材料下拉 */
      tree.addEventListener("change", function (e) {
        var sel = e.target.closest(".st-sel");
        if (sel) { st.parts[+sel.dataset.mat].mat = sel.value; refreshAll(); return; }
        var c = e.target.closest("[data-c]");
        if (c) applyCfg(c);
      });
      /* 开模设置里的数字输入 */
      tree.addEventListener("input", function (e) {
        var c = e.target.closest("[data-c]");
        if (c && e.target.tagName === "INPUT") applyCfg(c);
      });
      /* 点击：勾选 / 展开开模设置 */
      tree.addEventListener("click", function (e) {
        /* 共模多选标签 */
        var sh = e.target.closest("[data-share]");
        if (sh) {
          var ab = sh.dataset.share.split("|");
          S.toggleShare(st.parts, +ab[0], +ab[1]);
          refreshAll();
          return;
        }
        var cl = e.target.closest("[data-shareclear]");
        if (cl) { S.leaveMold(st.parts, +cl.dataset.shareclear); refreshAll(); return; }
        if (e.target.closest(".st-sel") || e.target.closest("[data-c]")) return;
        var tg = e.target.closest("[data-toggle]");
        if (tg) {
          var it = +tg.dataset.toggle;
          st.parts[it].on = !st.parts[it].on;
          refreshAll();
          return;
        }
        var row = e.target.closest(".st-tr.part");
        if (!row) return;
        var i = +row.dataset.i;
        if (st.open[i]) { delete st.open[i]; } else { st.open[i] = 1; }   // 再点一次收起
        st.sel = st.open[i] ? i : -1;
        refreshTree();
        updateSelection();
        refreshAll(true);
      });
    }

    var pp = document.querySelectorAll("[data-p]");
    Array.prototype.forEach.call(pp, function (inp) {
      inp.addEventListener("input", function () {
        var v = parseFloat(inp.value);
        if (isFinite(v)) { st.params[inp.dataset.p] = v; refreshAll(true); }
      });
    });

    var pb = $("stPrompt"), cb = $("stCsv");
    if (pb) pb.onclick = function () {
      var p = S.buildPrompt(st.info, st.parts, S.estimate(st.parts, st.params), st.params);
      $("stPromptBox").innerHTML = '<div class="st-tools" style="margin-bottom:10px">'
        + '<button class="pill" id="stCopyPrompt"><svg class="ic" aria-hidden="true"><use href="#i-clipboard"/></svg>复制提示词</button></div>'
        + '<div class="st-prompt">' + esc(p) + '</div>';
      $("stCopyPrompt").onclick = function () {
        copyText(p, $("stCopyPrompt"));
      };
    };
    if (cb) cb.onclick = function () {
      var csv = S.toCSV(st.info, st.parts, S.estimate(st.parts, st.params), st.params);
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = String(st.info.file).replace(/\.[^.]+$/, "") + "-成本估算.csv";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
  }

  /* ══════ 方案 / 单价库 / 报价单 的交互绑定 ══════ */
  function bindWorkspace() {
    var w = W(); if (!w) return;

    /* 方案名 + 保存 */
    var nameEl = $("stPlanName");
    if (nameEl) nameEl.addEventListener("input", function () {
      st.planName = nameEl.value.trim();
      autoSave();
    });
    var saveBtn = $("stPlanSave");
    if (saveBtn) saveBtn.onclick = function () {
      var nm = (nameEl && nameEl.value.trim()) || (st.info && st.info.file) || "未命名方案";
      var cur = st.planId ? w.getPlan(st.planId) : null;
      var same = !!(cur && cur.name === nm);
      var rec = packPlan(nm);
      /* 名字没变 → 更新原来那个方案；改了名字 → 另存为新方案（否则会覆盖掉上一版） */
      rec.id = same ? st.planId : "";
      var saved = w.savePlan(rec);
      st.planId = saved.id; st.planName = saved.name;
      refreshWorkspace();
      flash(saveBtn, same ? "已更新" : "已另存为新方案");
    };

    /* 重新选文件（恢复的方案想看 3D） */
    var rp = $("stReloadPick"), rf = $("stFile2");
    if (rp && rf) {
      rp.onclick = function () { rf.click(); };
      rf.onchange = function () { if (rf.files && rf.files[0]) handle(rf.files[0]); };
    }

    /* 报价单打印 */
    var qp = $("stQuotePrint");
    if (qp) qp.onclick = printQuote;
    ["stQCustomer", "stQValid", "stQNote"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", function () {
        st.quote = {
          customer: ($("stQCustomer") || {}).value || "",
          valid: parseFloat(($("stQValid") || {}).value) || 30,
          note: ($("stQNote") || {}).value || ""
        };
      });
    });

    bindPrice();
    bindPlans();
  }

  /* 单价库：改一个数 → 立刻影响报价（只刷新金额区，不重绘输入框，避免失焦） */
  function bindPrice() {
    var w = W(); if (!w) return;
    var box = document.querySelector(".st-price");
    if (!box) return;
    box.addEventListener("input", function (e) {
      var el = e.target;
      if (el.dataset.wp) {
        w.setMat(el.dataset.wid, el.value === "" ? "" : parseFloat(el.value), el.dataset.wp === "den" ? "d" : "p");
      } else if (el.dataset.wt) {
        w.setTool(el.dataset.wt, el.value === "" ? "" : parseFloat(el.value));
      } else if (el.dataset.wr !== undefined && el.dataset.wr !== null && el.hasAttribute("data-wr")) {
        w.setRate(+el.dataset.wr, el.value === "" ? "" : parseFloat(el.value));
      } else return;
      refreshAll(true);
      autoSave(600);
    });
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-wreset]");
      if (b) {
        var sc = b.dataset.wreset;
        if (!confirm(sc === "mat" ? "把材料单价与密度恢复成行业参考值？" : "把这一组恢复成默认值？")) return;
        w.resetPrice(sc); mount(); return;
      }
      var a = e.target.closest("[data-wact2]");
      if (!a) return;
      var act = a.dataset.wact2;
      if (act === "resetAll") {
        if (!confirm("把单价库全部恢复成行业参考值？你改过的所有单价都会丢。")) return;
        w.resetPrice("all"); mount();
      } else if (act === "export") {
        var data = JSON.stringify(w.exportPrice(), null, 2);
        var blob = new Blob([data], { type: "application/json;charset=utf-8" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "单价库-" + today() + ".json";
        document.body.appendChild(link); link.click();
        setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
      } else if (act === "import") {
        var f = $("stPriceFile"); if (f) f.click();
      }
    });
    var pf = $("stPriceFile");
    if (pf) pf.onchange = function () {
      var file = pf.files && pf.files[0];
      if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        var res;
        try { res = w.importPrice(JSON.parse(String(fr.result))); }
        catch (e2) { res = { ok: false, msg: "文件不是有效的 JSON" }; }
        alert(res.ok ? "已导入 " + res.n + " 项单价" : "导入失败：" + res.msg);
        if (res.ok) mount();
      };
      fr.readAsText(file);
      pf.value = "";
    };
  }

  /* 方案列表：载入 / 改名 / 删除 / 对比 */
  function bindPlans() {
    var w = W(); if (!w) return;
    var box = document.querySelector("#stepBody");
    if (!box) return;
    /* 台账输入：用 change 事件写回（避免每敲一个字就重绘） */
    if (!box.dataset.projBound) {
      box.dataset.projBound = "1";
      box.addEventListener("change", function (e) {
        var el = e.target.closest("[data-pj]");
        if (!el) return;
        var ww = W(), j = ww.getProject(el.dataset.jid);
        if (!j) return;
        var patch = { id: j.id, name: j.name, customer: j.customer, qty: j.qty, mat: j.mat,
          unitCost: j.unitCost, moldCost: j.moldCost, price: j.price, status: j.status,
          note: j.note, planId: j.planId };
        var k2 = el.dataset.pj;
        patch[k2] = (el.type === "number") ? parseFloat(el.value) || 0 : el.value;
        ww.saveProject(patch);
        refreshSection("项目台账", '<h3><svg class="ic" aria-hidden="true"><use href="#i-briefcase"/></svg>项目台账 <span class="st-h3n">在跑的产品的报价记录</span></h3>' + projectsHTML());
      });
    }
    if (box.dataset.planBound) return;
    box.dataset.planBound = "1";
    box.addEventListener("click", function (e) {
      /* 联动：把这个零件带进成本估算 */
      var pu = e.target.closest("[data-push]");
      if (pu) { pushToCalc(+pu.dataset.push); return; }
      /* 台账操作 */
      var ja = e.target.closest("[data-jact]");
      if (ja) {
        var act2 = ja.dataset.jact, w2 = W();
        if (act2 === "add") {
          w2.saveProject({ name: "新产品", status: "报价中" });
        } else if (act2 === "fromquote") {
          projectFromQuote(); return;
        } else if (act2 === "del") {
          var jj = w2.getProject(ja.dataset.jid);
          if (!confirm("删除台账里的「" + (jj ? jj.name : "") + "」？")) return;
          w2.removeProject(ja.dataset.jid);
        } else if (act2 === "clear") {
          if (!confirm("清空整个项目台账？这个操作不可恢复。")) return;
          w2.projects().forEach(function (x) { w2.removeProject(x.id); });
        } else if (act2 === "csv") {
          var blob2 = new Blob([projCsv()], { type: "text/csv;charset=utf-8" });
          var a2 = document.createElement("a");
          a2.href = URL.createObjectURL(blob2);
          a2.download = "项目台账-" + today() + ".csv";
          document.body.appendChild(a2); a2.click();
          setTimeout(function () { URL.revokeObjectURL(a2.href); a2.remove(); }, 1000);
          return;
        }
        refreshSection("项目台账", '<h3><svg class="ic" aria-hidden="true"><use href="#i-briefcase"/></svg>项目台账 <span class="st-h3n">在跑的产品的报价记录</span></h3>' + projectsHTML());
        return;
      }
      var b = e.target.closest("[data-pact]");
      if (!b) return;
      var act = b.dataset.pact, id = b.dataset.pid;
      if (act === "load") {
        var rec = w.getPlan(id);
        if (!rec) return;
        if (st.parts.length && !confirm("载入方案「" + rec.name + "」会覆盖当前的结果，继续？")) return;
        applyPlan(rec);
      } else if (act === "rename") {
        var cur = w.getPlan(id);
        var nm = prompt("新的方案名：", cur ? cur.name : "");
        if (nm && nm.trim()) { w.renamePlan(id, nm.trim()); if (st.planId === id) st.planName = nm.trim(); refreshWorkspace(); }
      } else if (act === "del") {
        var r2 = w.getPlan(id);
        if (!confirm("删除方案「" + (r2 ? r2.name : "") + "」？删了就找不回来了。")) return;
        w.removePlan(id);
        if (st.planId === id) { st.planId = ""; }
        refreshWorkspace();
      } else if (act === "compare") {
        var ids = [];
        Array.prototype.forEach.call(document.querySelectorAll("[data-pcmp]"), function (c) { if (c.checked) ids.push(c.dataset.pcmp); });
        var out = $("stCompare");
        if (out) out.innerHTML = compareHTML(ids);
        if (ids.length < 2) alert("至少勾选 2 个方案才能对比。");
        else if (out && out.scrollIntoView) { try { out.scrollIntoView({ block: "nearest" }); } catch (e3) {} }
      }
    });
  }

  /* 局部刷新：方案名与方案列表（不重绘整个结果页，避免正在输入时被打断） */
  function refreshWorkspace() {
    var bar = document.querySelector(".st-planbar");
    if (bar) {
      var inp = $("stPlanName");
      if (inp) inp.value = st.planName || "";
      var cnt = bar.querySelector(".st-pb-n");
      var w = W();
      if (cnt && w) cnt.textContent = "已存 " + w.plans().length + " 个";
    }
    var host = document.querySelector(".st-sec .st-privacy");
    /* 方案区块整体重绘（它不含正在输入的控件） */
    var secs = document.querySelectorAll("#stepBody .st-sec");
    Array.prototype.forEach.call(secs, function (sec) {
      var h = sec.querySelector("h3");
      if (h && h.textContent.indexOf("方案与对比") >= 0) {
        sec.innerHTML = '<h3><svg class="ic" aria-hidden="true"><use href="#i-layers"/></svg>方案与对比</h3>' + plansSecHTML();
      }
    });
  }

  /* 按钮上临时显示一个反馈文字 */
  function flash(btn, txt) {
    if (!btn) return;
    if (!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = txt;
    setTimeout(function () { if (btn.dataset.orig) btn.innerHTML = btn.dataset.orig; }, 1200);
  }

  function copyText(txt, btn) {
    var done = function () {
      var old = btn.innerHTML;
      btn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-check-square"/></svg>已复制';
      setTimeout(function () { btn.innerHTML = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      ta.remove();
    }
  }

  /* 选中零件 → 3D 里画出它的包围盒线框，并在提示行显示尺寸 */
  function updateSelection() {
    var p = st.sel >= 0 ? st.parts[st.sel] : null;
    if (viewer) {
      viewer.setBox(p ? p.min : null, p ? p.max : null);
      viewer.draw();
    }
    var h = $("stHint");
    if (h) {
      h.textContent = p
        ? "已选：" + p.name
          + "　包围盒 " + p.dim.map(function (d) { return S.fix(d, 1); }).join(" × ")
          + " mm（最大 " + S.fix(Math.max(p.dim[0], p.dim[1], p.dim[2]), 1) + "）"
          + "　体积 " + S.vol(p.vol) + "　（再点空白处取消）"
        : "拖拽旋转 · 滚轮缩放 · 点击零件查看该零件包围盒";
    }
  }

  /* 只更新概览卡片 */
  function refreshMeta() {
    var meta = document.querySelector(".st-meta");
    if (meta) {
      var e = S.estimate(st.parts, st.params);
      meta.innerHTML = '<div><span>零件数</span><b>' + e.n + ' 个</b></div>'
        + '<div><span>总体积</span><b>' + S.vol(e.volSum) + '</b></div>'
        + '<div><span>总重量</span><b>' + S.grams(e.weighted) + '</b></div>'
        + '<div><span>总表面积</span><b>' + S.area(e.areaSum) + '</b></div>'
        + '<div><span>三角形</span><b>' + st.info.tris + '</b></div>'
        + '<div><span>包围盒 (mm)</span><b>' + st.info.bbox + '</b></div>';
    }
  }

  function refreshTree() {
    var t = $("stTree");
    if (t) t.innerHTML = treeHTML();
  }

  /* keepTree = true 时不重绘装配树，避免正在输入的输入框失焦 */
  function refreshAll(keepTree) {
    var c = $("stCost"); if (c) c.innerHTML = costHTML();
    var m = $("stMolds"); if (m) m.innerHTML = moldsHTML();
    var ti = $("stTiers"); if (ti) ti.innerHTML = tiersHTML();
    var sa = $("stSanity"); if (sa) sa.innerHTML = sanityHTML();
    refreshMeta();
    if (keepTree) {
      for (var k in st.open) if (st.open.hasOwnProperty(k)) updateCfgNote(+k);
    } else {
      refreshTree();
    }
    autoSave();
  }

  function updateCfgNote(i) {
    var el = document.querySelector('.st-cfg[data-i="' + i + '"] .st-cfg-note');
    if (el) el.innerHTML = cfgNoteHTML(i);
  }

  /* 把开模设置里的一项写回零件并刷新 */
  function applyCfg(el) {
    var i = +el.dataset.i, k = el.dataset.c, v;
    if (k === "quote") {
      v = el.value === "" ? null : +el.value;
      if (v !== null && (!isFinite(v) || v < 0)) return;
    } else if (k === "cav" || k === "slides" || k === "lifters" || k === "post") {
      v = el.value === "" ? 0 : +el.value;
      if (!isFinite(v) || v < 0) return;
      if (k === "cav" && v < 1) v = 1;
    } else {
      v = el.value;
    }
    st.parts[i].tool[k] = v;
    refreshAll(true);
  }

  /* 主入口：由 app.js 的 renderAll 调用 */
  window.renderStep = function () {
    mount();
  };

  /* 主题切换时同步 3D 背景 */
  window.KB_STEP_THEME = function (dark) {
    if (viewer) { viewer.setBg(dark ? [0.08, 0.11, 0.17] : [0.96, 0.97, 0.99]); viewer.draw(); }
  };
})();
