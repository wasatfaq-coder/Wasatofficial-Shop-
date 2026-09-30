const s = require(process.argv[2]);
const parts = s.nodeParts; const metas = s.nodeMetas;
// find bundle names
const byBundle = {};
for (const [id, m] of Object.entries(metas)) {
  for (const [bundle, uid] of Object.entries(m.moduleParts)) {
    const p = parts[uid]; (byBundle[bundle] ??= []).push({ id: m.id, r: p.renderedLength, g: p.gzipLength });
  }
}
const main = Object.keys(byBundle).find(b => /assets\/index-.*\.js$/.test(b));
console.log('main', main);
const mods = byBundle[main];
const grp = {};
for (const m of mods) {
  let k;
  const nm = m.id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (nm) k = 'pkg:' + nm[1] + (nm[1]==='@firebase'? '/' + m.id.split('@firebase/')[1].split('/')[0] : '');
  else k = m.id.replace(/.*perf-wt\//, '');
  (grp[k] ??= { r: 0, g: 0, n: 0 }); grp[k].r += m.r; grp[k].g += m.g; grp[k].n++;
}
const rows = Object.entries(grp).sort((a, b) => b[1].r - a[1].r);
let tr = 0; for (const [, v] of rows) tr += v.r;
console.log('total rendered', (tr/1024).toFixed(0), 'KB');
for (const [k, v] of rows.slice(0, 60)) console.log((v.r/1024).toFixed(1).padStart(7), (v.g/1024).toFixed(1).padStart(6), k);
// other bundles in initial
for (const b of Object.keys(byBundle)) if (/react-|createLucide|inventory|react-dom/.test(b)) { const g = {}; for (const m of byBundle[b]) { const nm = m.id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/); const k = nm? nm[1]: m.id.replace(/.*perf-wt\//,''); g[k]=(g[k]||0)+m.r; } console.log('\n', b, JSON.stringify(Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>[k,Math.round(v/1024)]))); }
