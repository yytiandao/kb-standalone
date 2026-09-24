# 部署说明（GitHub Pages 自动发布）

站点地址：**https://yytiandao.github.io/kb-standalone/**

发布链路：push 到 `main` → GitHub Actions 自动跑内容门禁 + 构建 → 只把 `dist/` 发布到 Pages。
admin 后台、维护脚本保留在仓库里但**不会出现在线上**（Actions 只发布 dist）。

## 一次性设置（首次部署前）

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**
2. 之后每次 push 到 main，Actions 自动构建发布，约 2 分钟上线

## 日常发版流程

```
1. 本地改数据 / 内容（data/*.js 或 admin 后台导出替换）
2. node content-check.js          # 内容门禁，必须全绿
3. sw.js 里 CACHE 版本号 +1       # 如 struct-kb-v30 → v31，保证老用户缓存刷新
4. git add -A && git commit -m "…" && git push
5. 等 Actions 跑完，强刷浏览器（Ctrl+F5）验证
```

## 后台登录（admin.html）

后台（本地使用，不部署到线上）已加账号登录门禁：

```
node admin/set-auth.js <用户名> <密码>    # 新增/更新账号（PBKDF2-SHA256 · 12 万轮）
node admin/set-auth.js --list            # 列出账号
node admin/set-auth.js --del <用户名>     # 删除账号
```

- 登录后会话存 localStorage，12 小时内免登录；顶栏「退出登录」立即清除
- **安全边界要有数**：纯静态站点没有服务端，这道门禁挡的是「随手打开乱点」，
  挡不住会读源码绕过的人（哈希随公开仓库可见，弱密码可被离线爆破——用强密码）。
  后台本身只能改浏览器内存并导出文件，即使被绕过也动不了线上站点

## 上线验收清单

- [ ] 手机浏览器打开正常（响应式布局）
- [ ] 浏览器地址栏「安装应用」可用（PWA：manifest + sw.js 已内置，HTTPS 下自动具备）
- [ ] STEP 成本评估模块能加载（vendor/occt 的 7.6MB wasm 正常拉取）
- [ ] 断网后仍能打开（Service Worker 离线缓存）
- [ ] `https://yytiandao.github.io/kb-standalone/admin.html` 返回 404（后台不在线上）
- [ ] 打印预览页脚二维码扫码能打开站点（images/qr-site.svg 指向本站地址）

## 换域名 / 换托管平台（将来如需）

需要改的只有 5 处绝对 URL + 二维码 + 重新构建：

1. `index.html`：canonical（:11）、og:image（:19）、og:url（:22）、twitter:image（:27）
   —— 全文搜索 `yytiandao.github.io/kb-standalone` 替换为新地址即可
2. `index.html` 打印页脚 `pf-url` 的显示文案（:422 附近）
3. 重新生成二维码（任意装了 qrcode 的环境，临时目录装、不进项目）：
   ```
   npm init -y && npm i qrcode
   node -e "require('qrcode').toString('https://新地址/',{type:'svg',margin:1,width:120}).then(t=>require('fs').writeFileSync('images/qr-site.svg',t))"
   ```
4. `node release.js build` 后按新平台方式上传 dist/
   - 静态托管（Cloudflare Pages / 腾讯 EdgeOne Pages 等）：拖拽或 CLI 上传 dist 即可，
     HTTPS / CDN / wasm MIME 都是平台自动处理的
   - 自有服务器（Nginx）：注意补 `application/wasm` 与 `application/manifest+json` 的
     MIME 映射，HTML/js 用 no-cache 协商缓存，图片/wasm 可长缓存

## 备注

- **不蒜子访问统计**：按域名计数，换地址后从零开始，无需处理
- **standards/ 标准子站**（424MB）：在 .gitignore 里排除，不入库不上线，本地照常使用；
  将来要上线需单独方案（对象存储 / 单独仓库），不要直接塞进本仓库
- **收款码图片**（images/qr-alipay.jpg、qr-wechat.jpg）：旧版遗留、全项目无引用，
  .gitignore 与 release.js 双重排除，不公开
- **旧站** https://zjf030210.github.io/structure-eng-kb/ 仍是旧版本（214 条塑料灯具版），
  与本站独立，去留自行决定
