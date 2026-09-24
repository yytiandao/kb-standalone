/* dump-kbimg.js —— 把 data/img.js、data/items.js 的表导出为 kbimg.json，供 dedupe.py 反查图片来源
 * 用法: node dump-kbimg.js   （生成同目录 kbimg.json，属中间产物，不入库）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const out = {};
for (const name of ['img', 'items']) {
  const src = fs.readFileSync(path.join(ROOT, 'data', name + '.js'), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src)(sandbox.window);
  Object.assign(out, sandbox.window);
}
fs.writeFileSync(path.join(__dirname, 'kbimg.json'), JSON.stringify(out));
console.log('tables:', Object.keys(out)
  .map(k => `${k}(${Array.isArray(out[k]) ? out[k].length : Object.keys(out[k]).length})`)
  .join(', '));
