/* ══════════════════════════════════════════════════════════════════════
 * serve.js —— 本地开发用的静态服务器（零依赖），仅开发时使用
 *
 * 为什么要单独写一个：
 *   数据文件是「改完直接替换」的，而静态托管（python -m http.server、GitHub Pages）
 *   通常不发 Cache-Control，浏览器就会按 Last-Modified 做「启发式缓存」——
 *   刚替换的 app.js / data/*.js 可能几十分钟内仍返回旧内容，
 *   表现为「我明明改了，页面却还是旧的」，非常容易误判成改错了。
 *
 *   本服务器对 HTML / JS / CSS 一律发 no-store，改完刷新即生效。
 *   sw.js 里也做了同样的加固（network-first 带 cache:"no-cache"），
 *   所以线上部署后同样不会有这个问题。
 *
 * 用法：  node serve.js           → http://127.0.0.1:8124
 *        node serve.js 9000      → 换端口
 * ══════════════════════════════════════════════════════════════════════ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8124;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.map': 'application/json'
};

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { p = '/'; }
  if (p.endsWith('/')) p += 'index.html';
  /* 防目录穿越：resolve 归一化后用 path.relative 判边界（startsWith 会误放行
     同前缀目录，如 kb-standalone-evil），并拒绝点开头路径与 .git 等敏感目录 */
  const root = path.resolve(ROOT);
  const file = path.resolve(root, '.' + p.replace(/\\/g, '/'));
  const rel = path.relative(root, file);
  const risky = rel.split(path.sep).some(seg => seg === '.git' || seg === '_archive' || seg === '_testfiles' || seg.startsWith('.'));
  if (rel.startsWith('..') || path.isAbsolute(rel) || risky) { res.writeHead(403).end('forbidden'); return; }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + p); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': type, 'Last-Modified': st.mtime.toUTCString() };
    /* 代码与页面一律不缓存（图片仍可缓存，它们基本不变且数量大） */
    if (/\.(jpe?g|png|gif|webp|svg|ico|woff2)$/i.test(file)) head['Cache-Control'] = 'public, max-age=3600';
    else head['Cache-Control'] = 'no-store, must-revalidate';
    /* 支持 304：浏览器带 If-Modified-Since 且文件没变时省掉传输 */
    if (req.headers['if-modified-since'] && !/no-store/.test(head['Cache-Control'])) {
      const since = Date.parse(req.headers['if-modified-since']);
      if (since && st.mtime.getTime() <= since + 999) { res.writeHead(304).end(); return; }
    }
    res.writeHead(200, head);
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('开发服务器已启动：http://127.0.0.1:' + PORT + '/');
  console.log('  · 页面与脚本发 no-store，改完刷新即生效（不会再出现"改了看不到"）');
  console.log('  · 后台入口：http://127.0.0.1:' + PORT + '/admin.html');
  console.log('  · Ctrl+C 停止');
});
