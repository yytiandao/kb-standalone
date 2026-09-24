/* ============================================================
 * core/dom.js —— 渲染与 DOM 工具（框架层，与业务无关）
 *
 * 只放「任何页面都用得上」的东西：转义、建元素、选择器、事件委托、下载。
 * 主站 (app.js) 与后台 (admin/) 共用；不依赖任何业务数据。
 * ============================================================ */
window.KBCore = window.KBCore || {};

(function (C) {
  "use strict";

  /* 转义：凡是把用户/数据里的文本拼进 HTML，必须过这一层 */
  function esc(s) {
    return (s == null ? "" : String(s))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* h("div", {class:"a", "data-x":1}, [子节点或字符串]) —— 需要真节点时用；
     纯字符串拼接的场景（主站渲染器）直接模板字符串 + esc 即可。 */
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null || c === false) return;
        el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
      });
    }
    return el;
  }

  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* 事件委托：在容器上挂一个监听，命中选择器才调 handler(el, event) */
  function delegate(root, type, sel, handler) {
    root.addEventListener(type, function (e) {
      const el = e.target.closest(sel);
      if (el && root.contains(el)) handler(el, e);
    });
  }

  /* 触发下载（后台导出用）。file:// 与 http 都能用 */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  /* 底部浮出的轻提示（后台用；主站有自己的 lazy-note 样式） */
  let toastTimer = null;
  function toast(msg, kind) {
    let el = document.getElementById("kbToast");
    if (!el) {
      el = h("div", { id: "kbToast", class: "kb-toast" });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = "kb-toast on" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "kb-toast"; }, 2600);
  }

  /* 深拷贝：数据在 store 里会被反复克隆，避免引用串味 */
  function clone(v) {
    if (v == null || typeof v !== "object") return v;
    return JSON.parse(JSON.stringify(v));
  }

  C.esc = esc;
  C.h = h;
  C.q = q;
  C.qa = qa;
  C.delegate = delegate;
  C.download = download;
  C.toast = toast;
  C.clone = clone;
})(window.KBCore);
