const fs=require('fs'),zlib=require('zlib');
const {SourceMapConsumer}=require('/home/user/Wasatofficial-Shop-/node_modules/source-map-js');
const file=process.argv[2];
const code=fs.readFileSync(file,'utf8');const map=JSON.parse(fs.readFileSync(file+'.map','utf8'));
const smc=new SourceMapConsumer(map);
const lines=code.split('\n');const lineStart=[];let o=0;for(const l of lines){lineStart.push(o);o+=l.length+1;}
const maps=[];smc.eachMapping(m=>maps.push(m));
maps.sort((a,b)=>a.generatedLine-b.generatedLine||a.generatedColumn-b.generatedColumn);
const parts={};
function group(s){if(!s)return '(no source)';s=s.replace(/^(\.\.\/)+/,'');
 let m=s.match(/node_modules\/(?:\.bun\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);if(m)return 'npm:'+m[1];
 m=s.match(/src\/(views|components\/admin|components|utils|shared|context)\/([^/]+)/); if(m) return 'src/'+m[1]+'/'+m[2].replace(/\.(tsx?|css)$/,'');
 return s;}
for(let i=0;i<maps.length;i++){const m=maps[i],n=maps[i+1];
 const st=lineStart[m.generatedLine-1]+m.generatedColumn;
 const en=n?lineStart[n.generatedLine-1]+n.generatedColumn:code.length;
 const g=group(m.source);(parts[g]=parts[g]||[]).push(code.slice(st,en));}
const total=zlib.gzipSync(code,{level:9}).length;
const rows=Object.entries(parts).map(([g,a])=>{const s=a.join('');return [g,s.length,zlib.gzipSync(s,{level:9}).length]});
rows.sort((a,b)=>b[2]-a[2]);
console.log('file',file,'raw',code.length,'gz',total,'sum-of-group-gz',rows.reduce((x,r)=>x+r[2],0));
for(const r of rows.slice(0,+process.argv[3]||60))console.log((r[2]/1024).toFixed(1).padStart(7),'KBgz',(r[1]/1024).toFixed(0).padStart(6),'KB',r[0]);
