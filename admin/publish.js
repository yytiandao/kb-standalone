/* ══════════════════════════════════════════════════════════════════════
 * admin/publish.js —— 在线发布：把改动直接提交到 GitHub，Actions 自动构建上线
 *
 * 用法（后台顶栏「发布上线」）：
 *   1. 首次使用先在弹窗里填 GitHub Token（建议 fine-grained PAT：
 *      只勾选本仓库、权限只给 Contents: Read and write）
 *   2. 点「发布上线」→ 走与导出完全相同的校验门禁 → 确认提交信息 → 提交
 *   3. push 到 main 后 Actions 自动构建，约 2 分钟后线上生效
 *
 * 提交走 Git Data API（blobs → tree → commit → ref），多个文件合成一个提交。
 * Token 存本机 localStorage，只在你自己的浏览器里，不会发给本站之外的
 * 第三方（API 请求只发往 api.github.com）。
 *
 * 注意：线上发布后本地仓库会落后，本地继续改之前先 git pull。
 * ══════════════════════════════════════════════════════════════════════ */
window.KBPublish = (function () {
  "use strict";
  var C = window.KBCore;
  var A = window.KBAdmin;
  var CFG_KEY = "kb-admin-gh";
  var BRANCH = "main";

  /* ── 配置（token / repo）── */
  function cfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveCfg(o) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(o)); } catch (e) {}
  }

  /* ── GitHub API 封装 ── */
  function api(path, opts) {
    var c = cfg();
    if (!c.token) return Promise.reject(new Error("尚未配置 GitHub Token"));
    var repo = c.repo || "yytiandao/kb-standalone";
    opts = opts || {};
    return fetch("https://api.github.com/repos/" + repo + path, {
      method: opts.method || "GET",
      headers: {
        "Authorization": "Bearer " + c.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: opts.body
    }).then(function (r) {
      if (r.ok) return r.status === 204 ? null : r.json();
      return r.json().catch(function () { return {}; }).then(function (j) {
        var hint = r.status === 401 ? "（Token 无效或过期）"
          : r.status === 403 ? "（Token 权限不足：fine-grained PAT 需勾选本仓库 Contents 读写）"
          : r.status === 404 ? "（仓库不存在？检查设置里的仓库路径）" : "";
        throw new Error("GitHub API " + r.status + "：" + (j.message || "请求失败") + hint);
      });
    });
  }

  /* UTF-8 文本 → base64（TextEncoder 保证中文等多字节字符编码正确） */
  function b64(text) {
    var bytes = new TextEncoder().encode(text), s = "", i;
    for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  /* 普通表 file 不带目录前缀（items.js），QA 拆分文件带（data/qa-x.js），归一化成仓库相对路径 */
  function repoPath(f) {
    return f.file.indexOf("data/") === 0 ? f.file : "data/" + f.file;
  }

  /* 多文件合成一个提交：blobs → tree(基于当前) → commit → 快进 ref */
  function commitFiles(files, message) {
    var headSha, treeSha;
    return api("/git/ref/heads/" + BRANCH).then(function (ref) {
      headSha = ref.object.sha;
      return api("/git/commits/" + headSha);
    }).then(function (commit) {
      treeSha = commit.tree.sha;
      return Promise.all(files.map(function (f) {
        return api("/git/blobs", { method: "POST", body: JSON.stringify({ content: b64(f.text), encoding: "base64" }) });
      }));
    }).then(function (blobs) {
      return api("/git/trees", { method: "POST", body: JSON.stringify({
        base_tree: treeSha,
        tree: files.map(function (f, i) {
          return { path: repoPath(f), mode: "100644", type: "blob", sha: blobs[i].sha };
        })
      }) });
    }).then(function (tree) {
      return api("/git/commits", { method: "POST", body: JSON.stringify({
        message: message, tree: tree.sha, parents: [headSha]
      }) });
    }).then(function (nc) {
      return api("/git/refs/heads/" + BRANCH, { method: "PATCH", body: JSON.stringify({ sha: nc.sha, force: false }) });
    });
  }

  /* ── 小对话框（复用后台样式）── */
  function dialog(title, bodyHtml) {
    var back = document.createElement("div");
    back.className = "af-dlg-backdrop";
    back.innerHTML =
      '<div class="af-dlg" role="dialog" aria-label="' + C.esc(title) + '">' +
      '  <h4>' + C.esc(title) + '</h4>' +
      '  <div class="af-dlg-body">' + bodyHtml + '</div>' +
      '  <div class="af-dlg-acts"></div>' +
      '</div>';
    document.body.appendChild(back);
    return {
      root: back,
      acts: back.querySelector(".af-dlg-acts"),
      btn: function (label, cls, fn) {
        var b = document.createElement("button");
        b.className = "af-btn" + (cls ? " " + cls : "");
        b.textContent = label;
        b.addEventListener("click", fn);
        this.acts.appendChild(b);
        return b;
      },
      close: function () { back.remove(); }
    };
  }

  /* ── Token 设置 ── */
  function openSettings() {
    var c = cfg();
    var d = dialog("GitHub 发布设置",
      '<div class="af-dlg-row"><label>仓库</label><input name="repo" value="' + C.esc(c.repo || "yytiandao/kb-standalone") + '" placeholder="用户名/仓库名"></div>' +
      '<div class="af-dlg-row"><label>Token</label><input name="token" type="password" placeholder="fine-grained PAT（只勾本仓库 · Contents 读写）"></div>' +
      '<div class="af-dlg-tip">Token 只保存在本机浏览器。生成：github.com → Settings → Developer settings → Fine-grained tokens → 仓库限 kb-standalone、Contents: Read and write。清除请留空保存。</div>');
    var tokenInput = d.root.querySelector('[name="token"]');
    var repoInput = d.root.querySelector('[name="repo"]');
    d.btn("保存", "", function () {
      saveCfg({ repo: repoInput.value.trim(), token: tokenInput.value.trim() });
      d.close();
      C.toast(tokenInput.value.trim() ? "已保存发布配置" : "已清除 Token", "ok");
    });
    d.btn("取消", "af-ghost", d.close);
    tokenInput.focus();
  }

  /* ── 主流程 ── */
  function doPublish() {
    var files = A.collectFiles(true);
    if (!files.length) { C.toast("没有改动需要发布"); return; }
    /* 与导出同一道全量校验门禁：有错误不发布 */
    var R = C.validateAll();
    if (R.errs.length) {
      A.showProblems(R.errs, "发布被拦截（先修复以下错误）");
      C.toast("校验发现 " + R.errs.length + " 个错误，已阻止发布", "err");
      return;
    }
    if (!cfg().token) {
      C.toast("首次发布请先填写 GitHub Token", "err");
      openSettings();
      return;
    }
    var now = new Date();
    var pad = function (n) { return ("0" + n).slice(-2); };
    var defMsg = "内容更新：在线发布 " + files.length + " 个文件（" +
      now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + "）";
    var list = files.map(function (f) { return "<li>" + C.esc(repoPath(f)) + "</li>"; }).join("");
    var d = dialog("发布到 GitHub（main 分支）",
      '<div class="af-dlg-files"><ul>' + list + '</ul></div>' +
      '<div class="af-dlg-row"><label>提交说明</label><textarea name="msg" rows="2">' + C.esc(defMsg) + '</textarea></div>' +
      '<div class="af-dlg-tip">提交后 Actions 自动构建，约 2 分钟后线上生效；本地仓库改之前记得先 git pull。</div>');
    var msgInput = d.root.querySelector('[name="msg"]');
    var goBtn = d.btn("确认发布", "", function () {
      goBtn.disabled = true;
      goBtn.textContent = "提交中…";
      commitFiles(files, msgInput.value.trim() || defMsg).then(function () {
        d.close();
        C.store.commit();          /* 与导出一致：提交后落盘草稿并清理 */
        C.storage.clear();
        A.renderAll();
        C.toast("已提交 GitHub，约 2 分钟后自动上线（Actions 构建中）", "ok");
      }).catch(function (err) {
        goBtn.disabled = false;
        goBtn.textContent = "确认发布";
        C.toast("发布失败：" + (err && err.message ? err.message : "网络错误"), "err");
      });
    });
    d.btn("取消", "af-ghost", d.close);
    msgInput.focus();
  }

  function bind() {
    var pub = document.getElementById("afPublish");
    if (pub) pub.addEventListener("click", doPublish);
    var set = document.getElementById("afPubSet");
    if (set) set.addEventListener("click", openSettings);
  }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", bind);
  else bind();

  return { publish: doPublish, settings: openSettings, commit: commitFiles };
})();
