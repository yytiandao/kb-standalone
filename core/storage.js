/* ============================================================
 * core/storage.js —— 后台草稿的本地持久化（框架层）
 *
 * 后台是纯前端：改动先存本地草稿，导出成数据文件后由你自己覆盖回项目。
 * 优先用 IndexedDB（内容量大，localStorage 只有 5MB）；
 * file:// 下 IndexedDB 在部分浏览器被禁，则退回 localStorage，再不行就内存。
 *
 * 接口一律 async，调用方不用关心后端是哪一种。
 *   await KBCore.storage.load()        → 草稿对象 或 null
 *   await KBCore.storage.save(obj)     → 写入
 *   await KBCore.storage.clear()       → 清空
 *   KBCore.storage.backend             → "indexeddb" | "localstorage" | "memory"
 * ============================================================ */
window.KBCore = window.KBCore || {};

(function (C) {
  "use strict";

  const DB = "kb-admin";
  const STORE = "drafts";
  const KEY = "current";
  const LS_KEY = "kb-admin-draft-v1";

  let backend = "memory";
  let dbP = null;
  let mem = null;

  function openDB() {
    if (dbP) return dbP;
    dbP = new Promise(resolve => {
      if (!window.indexedDB) return resolve(null);
      let req;
      try { req = indexedDB.open(DB, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbP;
  }

  async function load() {
    const db = await openDB();
    if (db) {
      backend = "indexeddb";
      const v = await new Promise(resolve => {
        try {
          const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
          tx.onsuccess = () => resolve(tx.result || null);
          tx.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
      return v;
    }
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) { backend = "localstorage"; return JSON.parse(s); }
      backend = "localstorage";
      return null;
    } catch (e) { backend = "memory"; return mem; }
  }

  async function save(obj) {
    const db = await openDB();
    if (db) {
      backend = "indexeddb";
      return await new Promise(resolve => {
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(obj, KEY);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); backend = "localstorage"; return true; }
    catch (e) { mem = obj; backend = "memory"; return false; }
  }

  async function clear() {
    const db = await openDB();
    if (db) {
      backend = "indexeddb";
      await new Promise(resolve => {
        try {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(KEY);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      });
      return true;
    }
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    mem = null;
    return true;
  }

  /* 稳定的内容指纹：用来判断草稿是否与当前磁盘数据一致 */
  function fingerprint(tables) {
    let h = 2166136261;
    const s = JSON.stringify(tables);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + "-" + s.length;
  }

  C.storage = {
    load: load, save: save, clear: clear, fingerprint: fingerprint,
    get backend() { return backend; }
  };
})(window.KBCore);
