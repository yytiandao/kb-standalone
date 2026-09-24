#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kb-standalone 图片查重工具（只读：不移动、不删除、不改 data/）

语料特点：白底线稿类技术图 + 同一 PPT/文章的系列图（同模板不同内容）。
实测结论（见工具目录下调试记录）：
  - pHash/DCT 频域哈希区分度差（白底主导低频，数百张不同图连成一团），弃用；
  - 全局 dHash 会被"同模板不同页"骗过（缩到 9×8 后模板布局主导哈希）；
  - 全图灰度 NCC 区间重叠（同图缩放变体 0.79 < 同模板不同页 0.90）；
  - 【分块局部匹配】分离度最好：同图变体 0.70+，同模板不同页 ≤0.59，完全不同 ≤0.35。

流程：每图 EXIF 转正 + 裁均匀留白 → dHash(64bit) + MD5；
以 dHash ≤ D_CAND 预筛候选对 → 分块匹配分数 m 定夺。

判定层次：
  A 类 完全相同 —— 组内所有文件 MD5 相同
  B 类 视觉相同 —— 块匹配 m ≥ M_B（同图的不同版本：转码/缩放/水印/裁剪）
  C 类 疑似对   —— m ∈ [M_C, M_B)，按【对】报告，人工判断（同模板系列图多落此区）

用法：
  node  dump-kbimg.js    # 生成 kbimg.json（KB_IMG/KB_ITEMS 元数据）
  python dedupe.py       # 生成 index.json / report.md / groups.html
"""
import hashlib
import html
import itertools
import json
import math
import os
import sys
import time

from PIL import Image, ImageOps

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(BASE, "..", ".."))
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
D_CAND = 20     # dHash 候选窗口（配对预筛，超出基本不是同图）
M_B = 0.65      # 块匹配确认同图
M_C = 0.50      # 块匹配达到此值进疑似区
BM_SIZE = 160   # 块匹配基准分辨率
BM_GRID = 4     # 4×4 块
BM_FLAT_SD = 12  # 块内 std 低于此视为纯背景块，跳过
MAX_C_HTML = 150  # C 类在对照页里最多展示的对数

SCOPES = [
    ("ref", os.path.join("images", "ref"), "素材库 ref"),
    ("img", "images", "条目配图 images/"),
]
SCOPE_LABEL = {s: l for s, _r, l in SCOPES}


def file_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def trimmed(im, tol=12, min_keep=0.36):
    """裁掉四周与角落背景色接近的均匀留白（内容至少保留 min_keep 面积，防误裁）"""
    g = im.convert("L")
    w, h = g.size
    bg = g.getpixel((0, 0))
    mask = g.point(lambda v: 255 if abs(v - bg) > tol else 0)
    bbox = mask.getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    if (x1 - x0) * (y1 - y0) < min_keep * w * h:
        return im
    return im.crop(bbox)


def dhash_im(im, s=8):
    g = im.convert("L").resize((s + 1, s), Image.Resampling.LANCZOS)
    px = list(g.getdata())
    v = 0
    for r in range(s):
        for c in range(s):
            v = (v << 1) | (1 if px[r * (s + 1) + c] > px[r * (s + 1) + c + 1] else 0)
    return v


def hashes(p):
    """返回 (dhash, w, h) —— 哈希前 EXIF 转正 + 裁均匀留白"""
    with Image.open(p) as im:
        im = ImageOps.exif_transpose(im)
        w, h = im.size
        return dhash_im(trimmed(im)), w, h


def block_vecs(p, cache={}):
    """4×4 分块去均值向量（跳过纯背景块），用于局部匹配"""
    if p in cache:
        return cache[p]
    with Image.open(p) as im:
        im = ImageOps.exif_transpose(im)
        g = trimmed(im).convert("L").resize((BM_SIZE, BM_SIZE), Image.Resampling.LANCZOS)
        px = list(g.getdata())
    bs = BM_SIZE // BM_GRID
    out = []
    for by in range(BM_GRID):
        for bx in range(BM_GRID):
            v = [px[y * BM_SIZE + x]
                 for y in range(by * bs, (by + 1) * bs)
                 for x in range(bx * bs, (bx + 1) * bs)]
            m = sum(v) / len(v)
            sd = math.sqrt(sum((x - m) ** 2 for x in v) / len(v))
            if sd < BM_FLAT_SD:
                continue
            out.append([(x - m) / sd for x in v])
    cache[p] = out
    return out


def bmatch(A, B):
    """A 每块在 B 的对应邻域(±1块)内找最佳余弦，取均值（方向不对称）"""
    tot, cnt = 0.0, 0
    for i, a in enumerate(A):
        ay, ax = divmod(i, BM_GRID)
        best = -1.0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if 0 <= ay + dy < BM_GRID and 0 <= ax + dx < BM_GRID:
                    j = (ay + dy) * BM_GRID + ax + dx
                    if j < len(B):
                        c = sum(x * y for x, y in zip(a, B[j])) / len(a)
                        if c > best:
                            best = c
        if best > -1:
            tot += best
            cnt += 1
    return tot / cnt if cnt else 0.0


def bmatch_sym(va, vb):
    """对称分：双向取平均。单向高分+反向低分 = 部分包含（裁剪子图），会落到 C 区"""
    return (bmatch(va, vb) + bmatch(vb, va)) / 2


def ham(a, b):
    return bin(a ^ b).count("1")


def build_index():
    files, bad = [], []
    for scope, rel, _label in SCOPES:
        d = os.path.join(ROOT, rel)
        names = [n for n in sorted(os.listdir(d))
                 if os.path.isfile(os.path.join(d, n))
                 and os.path.splitext(n)[1].lower() in EXTS]
        for k, name in enumerate(names, 1):
            p = os.path.join(d, name)
            rp = (rel + "/" + name).replace("\\", "/")
            try:
                dh, w, h = hashes(p)
                files.append({"f": rp, "p": p, "scope": scope, "w": w, "h": h,
                              "bytes": os.path.getsize(p), "md5": file_md5(p),
                              "hash": dh})
            except Exception as e:
                bad.append({"f": rp, "err": f"{type(e).__name__}: {e}"})
            if k % 200 == 0:
                print(f"  {rel}: {k}/{len(names)}")
    return files, bad


def load_meta():
    """kbimg.json -> (ref 图元数据 f->[ {cat,t,s} ], 条目配图 f->[条目名])"""
    meta, items_by_img = {}, {}
    with open(os.path.join(BASE, "kbimg.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    for cat, arr in (data.get("KB_IMG") or {}).items():
        for it in arr:
            meta.setdefault(it["f"], []).append(
                {"cat": cat, "t": it.get("t", ""), "s": it.get("s", "")})
    for it in data.get("KB_ITEMS") or []:
        im = it.get("img")
        if im:
            items_by_img.setdefault(im, []).append(it.get("name", ""))
    return meta, items_by_img


class UF:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def norm_title(t):
    return "".join(t.split())


def title_related(a, b):
    a, b = norm_title(a), norm_title(b)
    if not a or not b:
        return False
    if len(a) < 8 or len(b) < 8:
        return a == b
    return a == b or a in b or b in a


def cluster(files):
    """返回 (高置信组列表, C 类对列表)"""
    n = len(files)
    uf = UF(n)
    by_md5 = {}
    for i, r in enumerate(files):
        by_md5.setdefault(r["md5"], []).append(i)
    for idxs in by_md5.values():
        for a, b in itertools.combinations(idxs, 2):
            uf.union(a, b)

    c_pairs = []
    for i in range(n):
        ri = files[i]
        for j in range(i + 1, n):
            if uf.find(i) == uf.find(j):
                continue
            d = ham(ri["hash"], files[j]["hash"])
            if d > D_CAND:
                continue
            m = bmatch_sym(block_vecs(ri["p"]), block_vecs(files[j]["p"]))
            if m >= M_B:
                uf.union(i, j)
            elif m >= M_C:
                c_pairs.append({"a": i, "b": j, "d": d, "m": round(m, 3)})
    c_pairs.sort(key=lambda e: -e["m"])

    comps = {}
    for i in range(n):
        comps.setdefault(uf.find(i), []).append(i)
    hi_groups = []
    for idxs in comps.values():
        if len(idxs) < 2:
            continue
        md5s = {files[i]["md5"] for i in idxs}
        hi_groups.append({"type": "A" if len(md5s) == 1 else "B", "idx": sorted(idxs)})
    return hi_groups, c_pairs


def pick_keep(files, idxs):
    """建议保留：分辨率最高，其次文件更大"""
    return max(idxs, key=lambda i: (files[i]["w"] * files[i]["h"], files[i]["bytes"]))


def group_info(files, g):
    """补充展示信息：范围/分类/同文异源/多分类复用/保留者/到保留者的距离与匹配分"""
    idxs = g["idx"]
    keep = pick_keep(files, idxs)
    scopes = {files[i]["scope"] for i in idxs}
    scope_label = "跨范围" if len(scopes) > 1 else SCOPE_LABEL[scopes.pop()]
    cats = []
    for i in idxs:
        for m in files[i]["meta"]:
            if m["cat"] not in cats:
                cats.append(m["cat"])
    domains = {m["s"] for i in idxs for m in files[i]["meta"]}
    titles = [m["t"] for i in idxs for m in files[i]["meta"]]
    cross_src = (len(domains) > 1
                 and any(title_related(a, b) for a, b in itertools.combinations(titles, 2)))
    multi_cat = any(len(files[i]["meta"]) > 1 for i in idxs)
    for i in idxs:
        if i == keep:
            files[i]["dist"] = 0
            files[i]["m"] = 1.0
        else:
            files[i]["dist"] = ham(files[i]["hash"], files[keep]["hash"])
            files[i]["m"] = round(bmatch_sym(block_vecs(files[i]["p"]),
                                             block_vecs(files[keep]["p"])), 3)
    g.update({"keep": keep, "scope_label": scope_label, "cats": cats,
              "cross_src": cross_src, "multi_cat": multi_cat})


def kb(b):
    return f"{b / 1024:.0f}KB"


def title_of(r):
    if r["meta"]:
        return r["meta"][0].get("t", "")
    if r["items"]:
        return "条目：" + "、".join(r["items"])
    return ""


def write_report(files, bad, hi_groups, c_pairs, stats, orphans, path):
    L = []
    ap = L.append
    ap("# 图片查重报告\n")
    ap(f"- 生成：{time.strftime('%Y-%m-%d %H:%M')} · 工具：`tools/img-dedupe/dedupe.py`（只读，未做任何清理）")
    ap(f"- 范围：`images/ref/`（素材库）+ `images/` 根层（条目配图），有效 {len(files)} 张，坏图 {len(bad)} 张")
    ap(f"- 口径：每图先 EXIF 转正 + 裁均匀留白；dHash≤{D_CAND} 预筛候选对后按【分块局部匹配分 m】定夺。"
       f"A=组内 MD5 全同；B=m≥{M_B}（同图的转码/缩放/水印/裁剪版本）；"
       f"C=疑似对（m {M_C}~{M_B}，同模板系列图多落此区），按对报告不做传递合并\n")
    for label, gs in (("A 完全相同", [g for g in hi_groups if g["type"] == "A"]),
                      ("B 视觉相同", [g for g in hi_groups if g["type"] == "B"])):
        ap(f"- {label}：{len(gs)} 组 / {sum(len(g['idx']) for g in gs)} 张")
    ap(f"- C 疑似：{len(c_pairs)} 对（按匹配分降序，人工判断）")
    ap("\n其它发现：")
    for k, v in stats:
        ap(f"- {k}：{v}")

    def table(gi, g):
        ap(f"\n### 组 {gi} · {g['type']} 类 · {len(g['idx'])} 张 · {g['scope_label']}"
           + (f" · 分类：{'、'.join(g['cats'][:3])}" if g["cats"] else ""))
        flags = []
        if g["cross_src"]:
            flags.append("同文异源")
        if g["multi_cat"]:
            flags.append("含多分类复用")
        if flags:
            ap(f"> {' ｜ '.join(flags)}")
        ap("| 图片 | 尺寸 | 大小 | 来源 | 文章 | 相似度 | 建议 |")
        ap("|---|---|---|---|---|---|---|")
        for i in g["idx"]:
            r = files[i]
            t = title_of(r)
            if len(t) > 30:
                t = t[:30] + "…"
            sug = "✅ 保留" if i == g["keep"] else "可去重"
            src = r["meta"][0].get("s", "") if r["meta"] else ""
            sim = "—" if i == g["keep"] else f"d={r['dist']} m={r['m']}"
            ap(f"| `{r['f']}` | {r['w']}×{r['h']} | {kb(r['bytes'])} | {src} | {t} | {sim} | {sug} |")

    ap("\n## 一、高置信重复组（A/B，建议清理）")
    for gi, g in enumerate(sorted(hi_groups,
                                  key=lambda g: (-len(g["idx"]), g["type"], files[g["idx"][0]]["f"])), 1):
        table(gi, g)

    ap("\n## 二、疑似重复对（C，人工判断）")
    ap("| # | 图 A | 图 B | dHash | 匹配分 m | 备注 |")
    ap("|---|---|---|---|---|---|")
    for k, e in enumerate(c_pairs, 1):
        ra, rb = files[e["a"]], files[e["b"]]
        ta, tb = title_of(ra), title_of(rb)
        note = "同文" if (ta and tb and title_related(ta, tb)) else ""
        ap(f"| C{k} | `{ra['f']}` | `{rb['f']}` | {e['d']} | {e['m']} | {note} |")

    if bad:
        ap("\n## 三、坏图（无法解码）")
        for b in bad:
            ap(f"- `{b['f']}` —— {b['err']}")
    if orphans:
        ap(f"\n## 附：ref 孤儿文件（未被 KB_IMG 引用，共 {len(orphans)} 个，列前 50）")
        for f in orphans[:50]:
            ap(f"- `{f}`")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(L) + "\n")


def thumb_src(r):
    base = os.path.basename(r["f"])
    if r["scope"] == "ref":
        return "../../images/ref/thumb/" + base
    return "../../images/thumb/" + base


def write_html(files, bad, hi_groups, c_pairs, path):
    def card(i, g, d=None, m=None):
        r = files[i]
        full = "../../" + r["f"]
        t = html.escape(title_of(r))
        if len(t) > 44:
            t = t[:44] + "…"
        keep_cls = " keep" if i == g["keep"] else ""
        tag = '<span class="keep-tag">✔ 建议保留</span>' if i == g["keep"] else ""
        if d is None:
            d, m = r.get("dist") or 0, r.get("m")
        sim = "—" if not d else f"d={d} m={m}"
        multi = " · 多分类复用" if len(r["meta"]) > 1 else ""
        src = html.escape(r["meta"][0].get("s", "")) if r["meta"] else ""
        return (f'<a class="card{keep_cls}" href="{full}" target="_blank">'
                f'<img loading="lazy" src="{thumb_src(r)}" '
                f"onerror=\"this.onerror=null;this.src=this.src.replace('/thumb/','/')\">"
                f'<div class="cap"><b>{os.path.basename(r["f"])}</b> · {sim}{multi} · '
                f'{r["w"]}×{r["h"]} · {kb(r["bytes"])} {tag}<br>'
                f'<span class="src">{src}</span><br>{t}</div></a>')

    def flags_html(g):
        s = '<span class="flag">同文异源</span>' if g["cross_src"] else ""
        if g["multi_cat"]:
            s += '<span class="flag blue">多分类复用</span>'
        return s

    hi_sorted = sorted(hi_groups, key=lambda g: (-len(g["idx"]), g["type"], files[g["idx"][0]]["f"]))
    nA = sum(len(g["idx"]) for g in hi_groups)

    H = []
    ap = H.append
    ap("<!doctype html><html lang=zh><meta charset=utf-8>")
    ap("<meta name=viewport content='width=device-width,initial-scale=1'>")
    ap("<title>图片查重对照页</title>")
    ap("""<style>
body{font-family:system-ui,'Microsoft YaHei',sans-serif;margin:0;background:#f5f6f8;color:#222}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;z-index:9}
header h1{font-size:16px;margin:0}
header .sum{font-size:13px;color:#666}
label{font-size:13px;cursor:pointer}
.grp{background:#fff;margin:14px auto;max-width:1180px;border-radius:8px;padding:10px 14px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.grp h3{font-size:14px;margin:4px 0 10px;color:#444;font-weight:600}
details.grp summary{cursor:pointer;font-size:14px;color:#444;font-weight:600;padding:2px 0}
.flag{background:#c0392b;color:#fff;border-radius:4px;font-size:12px;padding:1px 6px;margin-left:6px}
.flag.blue{background:#2980b9}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
.card{width:225px;border:2px solid #ddd;border-radius:6px;overflow:hidden;text-decoration:none;color:#222;background:#fafafa}
.card.keep{border-color:#27ae60}
.card img{width:100%;height:140px;object-fit:contain;background:#eee;display:block}
.cap{font-size:12px;padding:6px 8px;line-height:1.5;word-break:break-all}
.src{color:#7c4dff}
.keep-tag{color:#27ae60;font-weight:600}
</style>""")
    ap("<script>function flt(c,el){document.querySelectorAll('.cls-'+c)"
       ".forEach(function(e){e.style.display=el.checked?'':'none'})}</script>")
    ap(f"<header><h1>图片查重对照页</h1>"
       f"<span class=sum>高置信 {len(hi_sorted)} 组 / {nA} 张 · 疑似 {len(c_pairs)} 对 · "
       f"坏图 {len(bad)} 张 · 点击图片看原图</span>"
       f"<label><input type=checkbox checked onchange=\"flt('hi',this)\">A/B 高置信</label>"
       f"<label><input type=checkbox checked onchange=\"flt('c',this)\">C 疑似</label></header>")
    ap('<main style="padding-bottom:40px">')
    for gi, g in enumerate(hi_sorted, 1):
        cats = f" · {'、'.join(html.escape(c) for c in g['cats'][:3])}" if g["cats"] else ""
        cards = '<div class="cards">' + "".join(card(i, g) for i in g["idx"]) + "</div>"
        ap(f'<section class="grp cls-hi"><h3>组 {gi} · {g["type"]} 类 · {len(g["idx"])} 张'
           f' · {html.escape(g["scope_label"])}{cats}{flags_html(g)}</h3>{cards}</section>')
    if len(c_pairs) > MAX_C_HTML:
        ap(f'<section class="grp cls-c"><h3>疑似对共 {len(c_pairs)} 对，'
           f'以下仅展示匹配分最高的前 {MAX_C_HTML} 对，完整清单见 report.md</h3></section>')
    for k, e in enumerate(c_pairs[:MAX_C_HTML], 1):
        g = {"idx": [e["a"], e["b"]], "keep": e["a"]}
        body = ('<div class="cards">' + card(e["a"], g, 0, 1)
                + card(e["b"], g, e["d"], e["m"]) + "</div>")
        ap(f'<details class="grp cls-c"><summary>对 C{k} · dHash={e["d"]} · 匹配分 m={e["m"]}'
            f'</summary>{body}</details>')
    if bad:
        ap('<section class="grp cls-hi"><h3>坏图（无法解码）</h3>' +
           "<br>".join(f"`{b['f']}` {html.escape(b['err'])}" for b in bad) + "</section>")
    ap("</main>")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(H) + "\n")


def write_index(files, bad, hi_groups, c_pairs, orphans, multi_cat,
                missing_ref, item_missing, path):
    def pub(r):
        return {"f": r["f"], "md5": r["md5"], "hash": r["hash"],
                "w": r["w"], "h": r["h"], "bytes": r["bytes"], "scope": r["scope"]}

    out = {
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "thresholds": {"d_cand": D_CAND, "m_B": M_B, "m_C": M_C},
        "bad": bad,
        "groups": [{"id": k, "type": g["type"], "keep": files[g["keep"]]["f"],
                    "members": [dict(pub(files[i]), dist=files[i]["dist"], m=files[i]["m"])
                                for i in g["idx"]]}
                   for k, g in enumerate(hi_groups, 1)],
        "c_pairs": [{"a": files[e["a"]]["f"], "b": files[e["b"]]["f"],
                     "d": e["d"], "m": e["m"]} for e in c_pairs],
        "orphans": orphans,
        "multi_cat": multi_cat,
        "missing_kbimg_refs": missing_ref,
        "missing_item_imgs": item_missing,
    }
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    t0 = time.time()
    if not os.path.exists(os.path.join(BASE, "kbimg.json")):
        sys.exit("缺少 kbimg.json，先运行: node dump-kbimg.js")

    print("[1/4] 建索引（留白裁剪 + dHash + MD5）…")
    files, bad = build_index()
    print(f"  有效 {len(files)} 张，坏图 {len(bad)} 张，{time.time() - t0:.1f}s")
    meta, items_by_img = load_meta()
    for r in files:
        r["meta"] = meta.get(r["f"], [])
        r["items"] = items_by_img.get(r["f"], [])

    fileset = {r["f"] for r in files}
    orphans = [r["f"] for r in files if r["scope"] == "ref" and not r["meta"]]
    missing_ref = sorted(f for f in meta if f not in fileset)
    item_missing = sorted(f for f in items_by_img if f not in fileset)
    multi_cat = sorted(f for f, v in meta.items() if len(v) > 1)

    print("[2/4] 聚类 + 候选对分块匹配复核 …")
    hi_groups, c_pairs = cluster(files)
    for g in hi_groups:
        group_info(files, g)
    print(f"  高置信 {len(hi_groups)} 组，疑似 {len(c_pairs)} 对，{time.time() - t0:.1f}s")

    stats = [
        ("同一文件被多个分类引用（KB_IMG 跨分类复用）", f"{len(multi_cat)} 个文件"),
        ("ref 孤儿文件（未被 KB_IMG 引用）", f"{len(orphans)} 个"),
    ]
    if missing_ref:
        stats.append(("KB_IMG 引用但文件缺失", f"{len(missing_ref)} 个（如 {missing_ref[0]}）"))
    if item_missing:
        stats.append(("条目 img 指向的文件缺失", f"{len(item_missing)} 个"))

    print("[3/4] 写 report.md / groups.html / index.json …")
    write_report(files, bad, hi_groups, c_pairs, stats, orphans,
                 os.path.join(BASE, "report.md"))
    write_html(files, bad, hi_groups, c_pairs, os.path.join(BASE, "groups.html"))
    write_index(files, bad, hi_groups, c_pairs, orphans, multi_cat,
                missing_ref, item_missing, os.path.join(BASE, "index.json"))
    print(f"[4/4] 完成，总耗时 {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
