#!/usr/bin/env python3
"""Кусок графа graphify — страница для телефона.

graph.html из graphify рисует весь граф (тысячи узлов) с боковой панелью 280 px:
на телефоне это узкая полоса и долгий расчёт раскладки. Этот скрипт берёт из
graphify-out/graph.json только узлы вокруг нужных сущностей и пишет страницу,
которую Claude публикует как Artifact (граф сверху, карточка узла и список ниже).

Только стандартная библиотека Python. Читает graph.json, пишет один HTML-файл,
в сеть не ходит. Сама страница загружает vis-network с unpkg.com.

Пример:
  python3 .claude/skills/graph-pilot/phone_view.py \
    --seed "AuthProvider()" --seed "isAdmin()" --depth 1 --max-nodes 45 \
    --title "Авторизация в магазине" --note-file answer.md --out auth-graph.html
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

PALETTE = ["#3E6B9A", "#B5654A", "#4F8A5B", "#8A5FA8", "#B08A2E", "#3F8C8C", "#A84F6E", "#6B7280"]


def load_graph(path: Path) -> tuple[dict[str, dict], list[dict], str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in data.get("nodes", [])}
    links = data.get("links") or data.get("edges") or []
    return nodes, links, data.get("built_at_commit", "")


def find_seed(nodes: dict[str, dict], query: str) -> str:
    q = query.strip().lower()
    exact = [i for i, n in nodes.items() if n.get("label", "").lower() == q or i.lower() == q]
    if exact:
        # одинаковые имена в разных файлах: код магазина (src/) важнее тестов и документов
        exact.sort(key=lambda i: not (nodes[i].get("source_file") or "").startswith("src/"))
        if len(exact) > 1:
            print(f"«{query}»: {len(exact)} узла с таким именем, беру {nodes[exact[0]].get('source_file')}", file=sys.stderr)
        return exact[0]
    partial = [i for i, n in nodes.items() if q in n.get("label", "").lower()]
    if len(partial) == 1:
        return partial[0]
    hint = ", ".join(sorted({nodes[i]["label"] for i in partial})[:12]) or "нет похожих"
    sys.exit(f"Узел «{query}» не найден однозначно. Похожие: {hint}")


def is_package(node: dict) -> bool:
    src = node.get("source_file") or ""
    return src.endswith("package.json") or not src


def pick_nodes(nodes, links, seeds, depth, max_nodes, keep_packages):
    adj: dict[str, set[str]] = defaultdict(set)
    for e in links:
        s, t = e.get("source"), e.get("target")
        if s in nodes and t in nodes and s != t:
            adj[s].add(t)
            adj[t].add(s)
    chosen = list(dict.fromkeys(seeds))
    frontier = list(chosen)
    for _ in range(depth):
        candidates: dict[str, int] = defaultdict(int)
        for n in frontier:
            for m in adj[n]:
                if m in chosen or (not keep_packages and is_package(nodes[m])):
                    continue
                candidates[m] += 1
        ranked = sorted(candidates, key=lambda m: (-candidates[m], -len(adj[m])))
        room = max_nodes - len(chosen)
        frontier = ranked[: max(room, 0)]
        chosen.extend(frontier)
        if room <= 0:
            break
    keep = set(chosen)
    edges = []
    seen = set()
    for e in links:
        s, t = e.get("source"), e.get("target")
        if s in keep and t in keep and s != t:
            key = (s, t, e.get("relation"))
            if key in seen:
                continue
            seen.add(key)
            edges.append(e)
    degree = {n: len(adj[n]) for n in chosen}
    return chosen, edges, degree


def color_for(file: str) -> str:
    h = int(hashlib.md5(file.encode()).hexdigest(), 16)
    return PALETTE[h % len(PALETTE)]


def note_to_html(text: str) -> str:
    """Маленький markdown: абзацы, списки «- », `код`, **жирный**."""
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [l for l in block.splitlines() if l.strip()]
        if not lines:
            continue
        def inline(s: str) -> str:
            s = html.escape(s)
            s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
            return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        if all(l.lstrip().startswith("- ") for l in lines):
            items = "".join(f"<li>{inline(l.lstrip()[2:])}</li>" for l in lines)
            out.append(f"<ul>{items}</ul>")
        elif lines[0].startswith("## "):
            out.append(f"<h2>{inline(lines[0][3:])}</h2>")
            if lines[1:]:
                out.append(f"<p>{inline(' '.join(lines[1:]))}</p>")
        else:
            out.append(f"<p>{inline(' '.join(lines))}</p>")
    return "\n".join(out)


def build_page(nodes, chosen, edges, degree, seeds, title, note_html, commit):
    files = sorted({nodes[n].get("source_file") or "внешний пакет" for n in chosen})
    file_color = {f: color_for(f) for f in files}
    vis_nodes = []
    for n in chosen:
        node = nodes[n]
        src = node.get("source_file") or "внешний пакет"
        vis_nodes.append({
            "id": n,
            "label": node.get("label", n),
            "file": src,
            "loc": node.get("source_location") or "",
            "color": file_color[src],
            "seed": n in seeds,
            "degree": degree.get(n, 0),
        })
    vis_edges = [{
        "from": e["source"], "to": e["target"],
        "rel": e.get("relation") or "",
        "inferred": (e.get("confidence") or "") != "EXTRACTED",
    } for e in edges]
    payload = json.dumps({"nodes": vis_nodes, "edges": vis_edges, "files": file_color}, ensure_ascii=False)
    payload = payload.replace("</", "<\\/")
    t = html.escape(title)
    commit_note = f" · коммит <code>{html.escape(commit[:8])}</code>" if commit else ""
    return TEMPLATE.replace("__TITLE__", t).replace("__NOTE__", note_html).replace(
        "__DATA__", payload).replace("__STATS__", f"{len(vis_nodes)} узлов · {len(vis_edges)} связей{commit_note}")


TEMPLATE = r"""<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=JetBrains+Mono:wght@400;600&display=swap">
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"></script>
<style>
/* Раскладка: одна колонка — ответ, карта связей, карточка выбранного узла, список по файлам */
:root {
  --bg: #F3F5F8; --surface: #FFFFFF; --ink: #17202B; --muted: #4E5C70; --line: #D5DCE5;
  --accent: #2C4A6B; --seed: #C2410C;
  --display: "Manrope", "Segoe UI", system-ui, sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0F151C; --surface: #18212C; --ink: #E6ECF2; --muted: #A3B1C2; --line: #2B3747;
  --accent: #8FB4DB; --seed: #F59E6B; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #0F151C; --surface: #18212C; --ink: #E6ECF2; --muted: #A3B1C2; --line: #2B3747;
  --accent: #8FB4DB; --seed: #F59E6B; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font: 15px/1.55 var(--body); }
.wrap { max-width: 760px; margin: 0 auto; padding-inline: 16px; padding-block: 20px 40px; display: grid; gap: 20px; }
h1, h2 { font-family: var(--display); font-weight: 800; text-wrap: balance; line-height: 1.2; }
h1 { font-size: 1.6rem; margin: 0; }
h2 { font-size: 1.1rem; margin: 18px 0 6px; font-weight: 700; }
.eyebrow { font: 600 11px/1.4 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
.note p, .note ul { margin: 0 0 10px; max-width: 65ch; }
.note ul { padding-left: 20px; }
code { font: 0.86em var(--mono); background: color-mix(in srgb, var(--accent) 12%, transparent); padding: 1px 4px; border-radius: 4px; overflow-wrap: anywhere; }
.map { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
#graph { height: min(62vh, 560px); min-height: 320px; }
.map-foot { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.key { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.dot.seed { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--seed); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; min-width: 0; }
.card h3 { font: 600 1rem var(--mono); margin: 0 0 4px; overflow-wrap: anywhere; }
.where { font: 12px var(--mono); color: var(--muted); overflow-wrap: anywhere; margin: 0 0 10px; }
.nb { display: flex; flex-wrap: wrap; gap: 6px; }
button.chip { font: 12px var(--mono); color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; min-height: 32px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; max-width: 100%; }
button.chip:hover { border-color: var(--accent); }
button.chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rel { color: var(--muted); }
.files { display: grid; gap: 14px; }
.file h4 { font: 600 12px var(--mono); margin: 0 0 6px; display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
.stats { font-size: 12px; color: var(--muted); }
.empty { color: var(--muted); margin: 0; }
</style>

<main class="wrap">
  <header>
    <p class="eyebrow">Карта кода · graphify</p>
    <h1>__TITLE__</h1>
    <p class="stats">__STATS__</p>
  </header>
  <section class="note">__NOTE__</section>
  <section class="map" aria-label="Карта связей">
    <div id="graph" role="img" aria-label="Граф связей; тот же список узлов — ниже по файлам"></div>
    <div class="map-foot" id="legend"></div>
  </section>
  <section class="card" id="info" aria-live="polite">
    <p class="empty">Нажмите на узел на карте или в списке ниже — здесь появятся файл, строка и связи.</p>
  </section>
  <section>
    <h2>Узлы по файлам</h2>
    <div class="files" id="files"></div>
  </section>
</main>

<script>
const DATA = __DATA__;
const byId = new Map(DATA.nodes.map(n => [n.id, n]));
const links = new Map(DATA.nodes.map(n => [n.id, []]));
DATA.edges.forEach(e => {
  links.get(e.from)?.push({ id: e.to, rel: e.rel, dir: 'out', inferred: e.inferred });
  links.get(e.to)?.push({ id: e.from, rel: e.rel, dir: 'in', inferred: e.inferred });
});
const css = getComputedStyle(document.documentElement);
const tok = name => css.getPropertyValue(name).trim();
const REL = { calls: 'вызывает', imports: 'импортирует', contains: 'содержит', uses: 'использует', inherits: 'наследует', references: 'ссылается' };

function chip(id, extra) {
  const n = byId.get(id);
  const b = document.createElement('button');
  b.className = 'chip'; b.type = 'button';
  const dot = document.createElement('span'); dot.className = 'dot' + (n.seed ? ' seed' : ''); dot.style.background = n.color;
  b.append(dot);
  if (extra) { const r = document.createElement('span'); r.className = 'rel'; r.textContent = extra; b.append(r); }
  b.append(document.createTextNode(n.label));
  b.addEventListener('click', () => select(id, true));
  return b;
}

let network = null;
function select(id, focus) {
  const n = byId.get(id);
  const info = document.getElementById('info');
  info.replaceChildren();
  const h = document.createElement('h3'); h.textContent = n.label;
  const w = document.createElement('p'); w.className = 'where'; w.textContent = n.file + (n.loc ? ':' + n.loc.replace(/^L/, '') : '') + ' · связей в проекте: ' + n.degree;
  const nb = document.createElement('div'); nb.className = 'nb';
  (links.get(id) || []).forEach(l => {
    const verb = REL[l.rel] || l.rel;
    nb.append(chip(l.id, l.dir === 'out' ? verb + ' →' : '← ' + verb));
  });
  info.append(h, w, nb);
  if (network) {
    network.selectNodes([id]);
    if (focus) network.focus(id, { scale: 1.1, animation: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  }
}

const legend = document.getElementById('legend');
Object.entries(DATA.files).forEach(([file, color]) => {
  const k = document.createElement('span'); k.className = 'key';
  const d = document.createElement('span'); d.className = 'dot'; d.style.background = color;
  const t = document.createElement('span'); t.textContent = file; t.style.overflowWrap = 'anywhere';
  k.append(d, t); legend.append(k);
});
const seedKey = document.createElement('span'); seedKey.className = 'key';
const sd = document.createElement('span'); sd.className = 'dot seed'; sd.style.background = 'transparent';
seedKey.append(sd, document.createTextNode('с чего начали поиск'));
legend.append(seedKey);

const filesEl = document.getElementById('files');
const groups = {};
DATA.nodes.forEach(n => (groups[n.file] ||= []).push(n));
Object.keys(groups).sort().forEach(file => {
  const box = document.createElement('div'); box.className = 'file';
  const h = document.createElement('h4');
  const d = document.createElement('span'); d.className = 'dot'; d.style.background = DATA.files[file];
  h.append(d, document.createTextNode(file));
  const nb = document.createElement('div'); nb.className = 'nb';
  groups[file].sort((a, b) => a.label.localeCompare(b.label)).forEach(n => nb.append(chip(n.id)));
  box.append(h, nb); filesEl.append(box);
});

if (window.vis) {
  const nodes = new vis.DataSet(DATA.nodes.map(n => ({
    id: n.id, label: n.label,
    color: { background: n.color, border: n.seed ? tok('--seed') : n.color, highlight: { background: n.color, border: tok('--ink') } },
    borderWidth: n.seed ? 4 : 1,
    size: n.seed ? 18 : 8 + Math.min(10, Math.sqrt(n.degree)),
    font: { color: tok('--ink'), face: 'JetBrains Mono, monospace', size: n.seed ? 14 : 11, strokeWidth: 3, strokeColor: tok('--surface') },
  })));
  const edges = new vis.DataSet(DATA.edges.map((e, i) => ({
    id: i, from: e.from, to: e.to, dashes: e.inferred,
    arrows: { to: { enabled: true, scaleFactor: 0.4 } },
    color: { color: tok('--line'), highlight: tok('--accent') }, width: 1,
  })));
  network = new vis.Network(document.getElementById('graph'), { nodes, edges }, {
    nodes: { shape: 'dot' },
    edges: { smooth: false },
    physics: { solver: 'forceAtlas2Based', stabilization: { iterations: 250 }, forceAtlas2Based: { gravitationalConstant: -60, springLength: 90 } },
    interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true },
  });
  network.once('stabilizationIterationsDone', () => network.setOptions({ physics: false }));
  network.on('click', p => { if (p.nodes.length) select(p.nodes[0], false); });
} else {
  document.getElementById('graph').innerHTML = '<p class="empty" style="padding:16px">Карта не загрузилась (нет связи с unpkg.com). Список узлов и связей — ниже.</p>';
}
const firstSeed = DATA.nodes.find(n => n.seed);
if (firstSeed) select(firstSeed.id, false);
</script>
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--graph", default="graphify-out/graph.json")
    ap.add_argument("--seed", action="append", required=True, help="имя узла, как в graphify query/explain")
    ap.add_argument("--depth", type=int, default=1)
    ap.add_argument("--max-nodes", type=int, default=45)
    ap.add_argument("--keep-packages", action="store_true", help="оставить узлы npm-пакетов (react и т. п.)")
    ap.add_argument("--title", required=True)
    ap.add_argument("--note-file", help="ответ в маленьком markdown: абзацы, «- » списки, `код`, **жирный**, ## заголовок")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    graph_path = Path(a.graph)
    nodes, links, commit = load_graph(graph_path)
    seeds = [find_seed(nodes, s) for s in a.seed]
    chosen, edges, degree = pick_nodes(nodes, links, seeds, a.depth, a.max_nodes, a.keep_packages)
    note = note_to_html(Path(a.note_file).read_text(encoding="utf-8")) if a.note_file else ""
    Path(a.out).write_text(build_page(nodes, chosen, edges, degree, set(seeds), a.title, note, commit), encoding="utf-8")
    print(f"{a.out}: {len(chosen)} узлов, {len(edges)} связей")


if __name__ == "__main__":
    main()
