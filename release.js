/* ══════════════════════════════════════════════════════════════════════
 * release.js —— 发布门禁与生产目录构建（维护用，零依赖）
 *
 * 用法：
 *   node release.js check   只做资源完整性检查（发布前必跑）
 *   node release.js build   检查通过后生成 dist/（不含后台与维护文件）
 *
 * check 覆盖：
 *   · index.html / admin.html 引用的本地 js/css 存在
 *   · app.js 懒加载清单（LAZY_MODS）里的文件存在
 *   · sw.js CORE 预缓存清单里的文件存在
 *   · data/manifest.js 声明的数据文件存在
 *   · data/img.js 引用的图片文件存在（含缩略图）
 *   · manifest.webmanifest 的图标存在
 *
 * build 的生产目录排除：admin.html、admin/、core/（仅后台用）、维护脚本、
 * deploy/ 与 README.md（仓库文档）、本地说明文档、点开头文件（.nojekyll 除外）。
 * standards/ 子站（424MB，主站无链接）默认不复制，需要时自行同步。
 * ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const errs = [], warns = [];
const exists = p => fs.existsSync(path.join(DIR, p));

/* ── ① HTML 里引用的本地资源 ── */
function checkHtml(file) {
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');
  const refs = [];
  let m;
  const re = /(?:src|href)="([^"]+)"/g;
  while ((m = re.exec(html))) refs.push(m[1]);
  refs.filter(r => !/^(https?:|data:|#|mailto:|\/\/)/.test(r)).forEach(r => {
    if (r.endsWith('/') || r === './') return;
    if (!exists(r.split(/[?#]/)[0])) errs.push(file + ' 引用的 ' + r + ' 不存在');
  });
}

/* ── ② 懒加载清单 ── */
function checkLazy() {
  const src = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
  const m = src.match(/const LAZY_MODS = \{[\s\S]*?\n\};/);
  if (!m) { errs.push('app.js 里找不到 LAZY_MODS 懒加载清单（结构变了？）'); return; }
  const re = /"([^"]+\.js)"/g;
  let f;
  while ((f = re.exec(m[0]))) if (!exists(f[1])) errs.push('懒加载文件 ' + f[1] + ' 不存在');
}

/* ── ③ sw.js 预缓存清单 ── */
function checkSw() {
  const src = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
  const m = src.match(/const CORE = \[([\s\S]*?)\];/);
  if (!m) { errs.push('sw.js 里找不到 CORE 预缓存清单'); return; }
  const re = /"([^"]+)"/g;
  let f;
  while ((f = re.exec(m[1]))) {
    const p = f[1].replace(/^\.\//, '');
    if (p === '' || p === 'index.html' ? !exists(p === '' ? 'index.html' : p) : !exists(p)) errs.push('sw.js CORE 里的 ' + p + ' 不存在');
  }
}

/* ── ④ manifest 声明的数据文件 ── */
function checkManifest() {
  const src = fs.readFileSync(path.join(DIR, 'data/manifest.js'), 'utf8');
  const re = /file: "([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] === '__split__') continue;
    if (!exists('data/' + m[1])) errs.push('manifest 声明的 data/' + m[1] + ' 不存在');
  }
}

/* ── ⑤ 图片引用 ──
 * KB_IMG[条目名] = [{f: "images/ref/xxx.jpg", t: 标题, s: 来源}, …]
 * 缩略图派生规则与 app.js 的 refThumbOf 保持一致 */
function refThumbOf(p) {
  if (!p || p.indexOf('images/ref/') !== 0) return p || '';
  return p.replace('images/ref/', 'images/ref/thumb/').replace(/\.(jpe?g|png)$/i, '.jpg');
}
function checkImages() {
  const s = { window: null, console: { log() {}, warn() {}, error() {} } };
  s.window = s;
  require('vm').createContext(s);
  require('vm').runInContext(fs.readFileSync(path.join(DIR, 'data/img.js'), 'utf8'), s);
  const KB_IMG = s.KB_IMG || {};
  let n = 0;
  Object.values(KB_IMG).forEach(list => (list || []).forEach(rec => {
    const img = rec && rec.f;
    if (!img) return;
    n++;
    if (!exists(img)) errs.push('参考图缺失 ' + img);
    else {
      const t = refThumbOf(img);
      if (t !== img && !exists(t)) warns.push('缩略图缺失 ' + t + '（列表会回退原图）');
    }
  }));
  return { n };
}

/* ── ⑥ PWA 图标 ── */
function checkPwa() {
  const mf = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.webmanifest'), 'utf8'));
  (mf.icons || []).forEach(i => { if (!exists(i.src.replace(/^\.\//, ''))) errs.push('PWA 图标 ' + i.src + ' 不存在'); });
}

function runCheck() {
  checkHtml('index.html');
  checkHtml('admin.html');
  checkLazy();
  checkSw();
  checkManifest();
  const img = checkImages();
  checkPwa();
  console.log('资源完整性检查\n');
  if (warns.length) { console.log('⚠️ 提示 ' + warns.length + ' 条:'); warns.slice(0, 20).forEach(x => console.log('   · ' + x)); console.log(''); }
  if (errs.length) {
    console.log('❌ 发现 ' + errs.length + ' 个问题（前 40 条）:');
    errs.slice(0, 40).forEach(x => console.log('   · ' + x));
    process.exit(1);
  }
  console.log('✓ HTML 引用 / 懒加载 / SW 预缓存 / manifest 数据 / 参考图 ' + img.n + ' 张 / PWA 图标 全部存在');
}

/* ── 构建 dist/ ── */
const EXCLUDE = new Set([
  'admin.html', 'admin', 'core',                      // 后台与仅后台用的框架层
  'content-check.js', 'qa-check.js', 'release.js', 'serve.js',   // 维护脚本
  'deploy',                                            // 部署文档，不进线上
  'README.md',                                         // 仓库说明，不进线上
  '使用说明.txt', '功能测试用例.md', '功能测试用例.csv',   // 本地文档，不进线上
  'standards'                                           // 424MB 独立子站，另行同步
]);
function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  fs.readdirSync(srcDir, { withFileTypes: true }).forEach(e => {
    const s = path.join(srcDir, e.name), d = path.join(dstDir, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
}
function runBuild() {
  runCheck();   // 构建前先过资源门禁
  const dist = path.join(DIR, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  fs.readdirSync(DIR, { withFileTypes: true }).forEach(e => {
    if (EXCLUDE.has(e.name) || e.name === 'dist' ||
        (e.name.startsWith('.') && e.name !== '.nojekyll')) return;   // 点文件不发布，.nojekyll 例外
    const s = path.join(DIR, e.name), d = path.join(dist, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
  const size = require('child_process').execSync(
    process.platform === 'win32' ? `powershell -Command "(Get-ChildItem -Recurse '${dist}' | Measure-Object Length -Sum).Sum"` : `du -sb ${dist}`,
    { encoding: 'utf8' }
  );
  console.log('\n✓ dist/ 已生成（不含 admin/维护脚本/归档；standards/ 子站未包含，需要时另行同步）');
  console.log('  体积约: ' + (parseInt(size.trim().split(/\s+/).pop()) / 1024 / 1024).toFixed(1) + ' MB');
}

const cmd = process.argv[2] || 'check';
if (cmd === 'check') runCheck();
else if (cmd === 'build') runBuild();
else { console.log('用法: node release.js check | build'); process.exit(1); }
