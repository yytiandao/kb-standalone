/* ══════════════════════════════════════════════════════════════════════
 * admin/auth.js —— 后台登录门禁
 *
 * 边界要说清楚：本项目部署在静态托管上，没有服务端，这道门禁挡的是
 * 「随手打开后台乱点」，挡不住会读源码绕过的人（账号哈希随仓库公开）。
 * 后台本身不部署到线上（release.js 不把 admin.* 放进 dist），主要本地用。
 *
 * · 密码以 PBKDF2-SHA256（12 万轮 + 随机盐）哈希存储，明文不落盘
 * · 登录后会话存 localStorage，12 小时有效；「退出登录」立即清除
 * · 账号管理：node admin/set-auth.js <用户名> <密码>（新增/更新）
 *            node admin/set-auth.js --list / --del <用户名>
 * ══════════════════════════════════════════════════════════════════════ */
window.KB_ADMIN_AUTH = {
  iters: 120000,
  accounts: [
    /* __ACCOUNTS_START__ */
    { user: "admin", salt: "fc10806a4d47fa734c431866d2cf4f4d", hash: "3e26d6b881aba4eebed0888cb4801c14def8daa3fca7616f28827fb6b537523f" },
    /* __ACCOUNTS_END__ */
  ]
};

window.KBAuth = (function () {
  "use strict";
  var SS_KEY = "kb-admin-auth";
  var TTL_MS = 12 * 60 * 60 * 1000;

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ("0" + b.toString(16)).slice(-2);
    }).join("");
  }
  /* 与 admin/set-auth.js 的 crypto.pbkdf2Sync 参数一致，哈希才对得上 */
  function derive(password, saltHex, iters) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.reject(new Error("当前浏览器不支持 Web Crypto，请用新版 Chrome / Edge / Firefox 打开"));
    var salt = new Uint8Array((saltHex.match(/../g) || []).map(function (h) { return parseInt(h, 16); }));
    return subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
      .then(function (key) {
        return subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iters }, key, 256);
      })
      .then(hex);
  }

  function session() {
    try {
      var s = JSON.parse(localStorage.getItem(SS_KEY) || "null");
      if (s && s.user && s.exp > Date.now()) return s;
    } catch (e) { /* 坏数据当未登录 */ }
    return null;
  }
  function saveSession(user) {
    try { localStorage.setItem(SS_KEY, JSON.stringify({ user: user, exp: Date.now() + TTL_MS })); } catch (e) {}
  }
  function clearSession() { try { localStorage.removeItem(SS_KEY); } catch (e) {} }

  /* 顶栏「退出登录」按钮（admin.html 里渲染，这里绑定行为） */
  function bindLogout() {
    var btn = document.getElementById("afLogout");
    if (!btn || btn.__authBound) return;
    btn.__authBound = true;
    var s = session();
    if (s) btn.textContent = "退出(" + s.user + ")";
    btn.addEventListener("click", function () { clearSession(); location.reload(); });
  }

  function buildOverlay(onOk) {
    var root = document.createElement("div");
    root.className = "af-login";
    root.innerHTML =
      '<form class="af-login-card">' +
      '  <div class="af-login-title">内容管理 · 登录</div>' +
      '  <input name="u" placeholder="账号" autocomplete="username" autofocus>' +
      '  <input name="p" type="password" placeholder="密码" autocomplete="current-password">' +
      '  <button type="submit" class="af-btn">登 录</button>' +
      '  <div class="af-login-msg"></div>' +
      '  <div class="af-login-note">静态门禁仅防随手打开 · 改密：node admin/set-auth.js 用户名 密码</div>' +
      '</form>';
    document.body.appendChild(root);
    var form = root.querySelector("form");
    var uIn = form.querySelector('[name="u"]'), pIn = form.querySelector('[name="p"]');
    var btn = form.querySelector("button"), msg = root.querySelector(".af-login-msg");
    uIn.focus();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var user = uIn.value.trim(), pass = pIn.value;
      msg.textContent = "";
      if (!user || !pass) { msg.textContent = "请输入账号和密码"; return; }
      var acc = (window.KB_ADMIN_AUTH.accounts || []).filter(function (a) { return a.user === user; })[0];
      if (!acc) { msg.textContent = "账号或密码不对"; return; }
      btn.disabled = true;
      derive(pass, acc.salt, acc.iters || window.KB_ADMIN_AUTH.iters).then(function (h) {
        if (h === acc.hash) {
          saveSession(user);
          root.remove();
          bindLogout();
          onOk(user);
        } else {
          msg.textContent = "账号或密码不对";
          pIn.value = ""; pIn.focus();
          /* 失败停顿一下，拖住快速试密码 */
          setTimeout(function () { btn.disabled = false; }, 600);
        }
      }).catch(function (err) {
        msg.textContent = err && err.message ? err.message : "登录失败";
        btn.disabled = false;
      });
    });
  }

  /* admin.js 启动前调用：已登录立即放行，否则出登录门 */
  function gate() {
    return new Promise(function (resolve) {
      var s = session();
      if (s) { bindLogout(); resolve(s.user); return; }
      buildOverlay(resolve);
    });
  }

  return {
    gate: gate,
    logout: function () { clearSession(); location.reload(); },
    user: function () { var s = session(); return s && s.user; }
  };
})();
