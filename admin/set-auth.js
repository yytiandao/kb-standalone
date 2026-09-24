/* ══════════════════════════════════════════════════════════════════════
 * admin/set-auth.js —— 后台账号管理（维护用，零依赖）
 *
 * 用法：
 *   node admin/set-auth.js <用户名> <密码>    新增或更新账号（随机盐重新哈希）
 *   node admin/set-auth.js --list            列出账号（只显示用户名与盐，不显示哈希全文）
 *   node admin/set-auth.js --del <用户名>     删除账号
 *
 * 哈希参数与 admin/auth.js 的浏览器校验一致：PBKDF2-SHA256 · 12 万轮 · 32 字节
 * 改完无需其它操作，刷新 admin.html 即生效（auth.js 是 defer 直接读）。
 * ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'auth.js');
const START = '/* __ACCOUNTS_START__ */';
const END = '/* __ACCOUNTS_END__ */';

function readAuth() {
  const src = fs.readFileSync(FILE, 'utf8');
  const m = src.match(/iters:\s*(\d+)/);
  if (!m) { console.error('❌ auth.js 里找不到 iters 配置'); process.exit(1); }
  return { src, iters: parseInt(m[1], 10) };
}
function parseAccounts(src) {
  const body = src.slice(src.indexOf(START) + START.length, src.indexOf(END));
  const out = [];
  const re = /\{\s*user:\s*"([^"]+)",\s*salt:\s*"([0-9a-f]+)",\s*hash:\s*"([0-9a-f]+)",?\s*(?:iters:\s*(\d+),?\s*)?\}/g;
  let m;
  while ((m = re.exec(body))) out.push({ user: m[1], salt: m[2], hash: m[3], iters: m[4] ? parseInt(m[4], 10) : undefined });
  return out;
}
function writeAccounts(src, list, iters) {
  const lines = list.map(a =>
    '    { user: "' + a.user + '", salt: "' + a.salt + '", hash: "' + a.hash + '"' +
    (a.iters && a.iters !== iters ? ', iters: ' + a.iters : '') + ' }'
  );
  const next = src.slice(0, src.indexOf(START) + START.length) + '\n' +
    (lines.length ? lines.join(',\n') + ',\n' : '') +
    '    ' + src.slice(src.indexOf(END));
  fs.writeFileSync(FILE, next);
}

const cmd = process.argv[2];
const { src, iters } = readAuth();
const accounts = parseAccounts(src);

if (cmd === '--list') {
  if (!accounts.length) { console.log('（没有账号）'); return; }
  console.log('账号 ' + accounts.length + ' 个：');
  accounts.forEach(a => console.log('  · ' + a.user + (a.iters ? '（iters=' + a.iters + '）' : '') + '  salt=' + a.salt.slice(0, 8) + '…'));
  return;
}
if (cmd === '--del') {
  const user = process.argv[3];
  if (!user) { console.log('用法: node admin/set-auth.js --del <用户名>'); process.exit(1); }
  const next = accounts.filter(a => a.user !== user);
  if (next.length === accounts.length) { console.log('没有这个账号: ' + user); process.exit(1); }
  writeAccounts(src, next, iters);
  console.log('✓ 已删除 ' + user + '（现剩 ' + next.length + ' 个账号）');
  return;
}

const user = cmd, pass = process.argv[3];
if (!user || !pass) {
  console.log('用法: node admin/set-auth.js <用户名> <密码>\n      node admin/set-auth.js --list | --del <用户名>');
  process.exit(1);
}
if (user === '--' || /[{}"\\/]/.test(user)) { console.error('❌ 用户名不要包含引号/反斜杠/花括号'); process.exit(1); }
if (pass.length < 6) { console.error('❌ 密码至少 6 位（哈希随仓库公开，弱密码可被离线爆破，请用强密码）'); process.exit(1); }

const salt = crypto.randomBytes(16).toString('hex');
/* 盐必须按字节（Buffer 解码十六进制）传入，与浏览器端 new Uint8Array(saltHex) 一致；
   直接传 hex 字符串会被当作原始字符字节，两端就对不上了 */
const hash = crypto.pbkdf2Sync(pass, Buffer.from(salt, 'hex'), iters, 32, 'sha256').toString('hex');
const exists = accounts.some(a => a.user === user);
const next = accounts.filter(a => a.user !== user).concat([{ user, salt, hash }]);
writeAccounts(src, next, iters);
console.log('✓ ' + (exists ? '已更新' : '已新增') + '账号「' + user + '」（PBKDF2-SHA256 · ' + iters + ' 轮），刷新 admin.html 生效');
