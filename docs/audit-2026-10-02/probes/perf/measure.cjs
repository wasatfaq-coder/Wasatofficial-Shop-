// node measure.cjs <label> <runs> [--repeat] [--transitions] [--timeout ms]
const {chromium}=require('/opt/node22/lib/node_modules/playwright');const fs=require('fs'),os=require('os'),path=require('path');
const [label,runsS]=process.argv.slice(2);const runs=+runsS||3;const REPEAT=process.argv.includes('--repeat');const TR=process.argv.includes('--transitions');
const tIdx=process.argv.indexOf('--timeout');const TIMEOUT=tIdx>0?+process.argv[tIdx+1]:240000;
const URL='http://127.0.0.1:5480/';const ALLURLS=[];
function cls(u){if(u.includes(':8480'))return 'firestore';if(u.includes(':9490'))return 'auth';if(/googleapis|google\.com|gstatic|firebaseapp/.test(u))return 'google';if(/\.js(\?|$)/.test(u))return 'js';if(/\.css/.test(u))return 'css';if(/\.woff2?/.test(u))return 'font';if(u.startsWith('data:'))return 'data';return 'other';}
async function setup(page){const c=await page.context().newCDPSession(page);await c.send('Network.enable');
 await c.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6e6/8,uploadThroughput:750e3/8});
 await c.send('Emulation.setCPUThrottlingRate',{rate:4});
 const reqs={};const bytes={};let n=0;const fonts=[];const jsFiles=[];
 c.on('Network.requestWillBeSent',e=>{reqs[e.requestId]=e.request.url;if(!/:5480|:8480|^data:/.test(e.request.url))ALLURLS.push(e.request.url.slice(0,120));if(!e.request.url.startsWith('data:'))n++;});
 c.on('Network.dataReceived',e=>{const k=cls(reqs[e.requestId]||'');bytes[k]=(bytes[k]||0)+e.encodedDataLength;});
 c.on('Network.loadingFinished',e=>{const u=reqs[e.requestId]||'';if(cls(u)==='font')fonts.push(path.basename(u));if(cls(u)==='js')jsFiles.push(path.basename(u)+':'+e.encodedDataLength);});
 return {c,stats:()=>({bytes:{...bytes},requests:n,fonts:[...fonts],jsFiles:[...jsFiles]})};}
async function load(page){
 await page.addInitScript(()=>{window.__lt=[];window.__lcp=0;try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push([e.startTime,e.duration]))).observe({type:'longtask',buffered:true});
  new PerformanceObserver(l=>l.getEntries().forEach(e=>{window.__lcp=e.startTime;window.__lcpEl=(e.element&&e.element.tagName)||''})).observe({type:'largest-contentful-paint',buffered:true});}catch(e){}});
 const t0=Date.now();await page.goto(URL,{waitUntil:'commit'});
 const marks={};
 const poll=async()=>{while(Date.now()-t0<TIMEOUT){const s=await page.evaluate(()=>({skel:!!document.querySelector('[aria-hidden="true"].grid'),card:!!document.querySelector('a[href^="#/product/"]'),
   img:[...document.querySelectorAll('a[href^="#/product/"]')].length,notcfg:/Товары появятся здесь/.test(document.body.innerText)})).catch(()=>null);
  const t=Date.now()-t0;if(s){if(s.skel&&!marks.skeleton)marks.skeleton=t;if(s.notcfg&&!marks.emptyText)marks.emptyText=t;if(s.card){marks.cards=t;marks.cardCount=s.img;break;}}await new Promise(r=>setTimeout(r,50));}};
 await poll();await page.waitForTimeout(1500);
 const perf=await page.evaluate(()=>{const nav=performance.getEntriesByType('navigation')[0];const fcp=performance.getEntriesByName('first-contentful-paint')[0];
  return {lcp:Math.round(window.__lcp),lcpEl:window.__lcpEl,fcp:fcp&&Math.round(fcp.startTime),dcl:Math.round(nav.domContentLoadedEventEnd),longTasks:window.__lt.length,longTaskSum:Math.round(window.__lt.reduce((a,b)=>a+b[1],0)),heapMB:+(performance.memory.usedJSHeapSize/1048576).toFixed(1),dom:document.getElementsByTagName('*').length}});
 return {marks,perf};}
async function transitions(page){const out={};
 const step=async(name,act,waitSel)=>{await page.evaluate(()=>{window.__lt=[]});const t=Date.now();await act();if(typeof waitSel==='function')await page.waitForFunction(waitSel,null,{timeout:60000});else await page.waitForSelector(waitSel,{timeout:60000});await page.waitForTimeout(1500);
  const lt=await page.evaluate(()=>[window.__lt.reduce((a,b)=>a+b[1],0),Math.max(0,...window.__lt.map(x=>x[1]))]);out[name]={ms:Date.now()-t,longTaskSum:Math.round(lt[0]),longest:Math.round(lt[1])};};
 // track long tasks again after reset
 await page.evaluate(()=>{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push([e.startTime,e.duration]))).observe({type:'longtask'});});
 await step('home→catalog',()=>page.click('nav[aria-label="Основная навигация"] button[aria-label="Каталог"]'),'main a[href^="#/product/"]');
 await step('catalog→product',()=>page.locator('a[href^="#/product/"]').first().click(),'h1');
 await step('product→cart',()=>page.click('nav[aria-label="Основная навигация"] button[aria-label="Корзина"]'),()=>location.hash.includes('cart')&&!!document.querySelector('main h1, main h2'));
 out.heapMBafter=await page.evaluate(()=>+(performance.memory.usedJSHeapSize/1048576).toFixed(1));out.lsChars=await page.evaluate(()=>Object.keys(localStorage).reduce((a,k)=>a+localStorage[k].length,0));
 return out;}
(async()=>{const results=[];
 for(let i=0;i<runs;i++){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pw-perf-'));
  const ctx=await chromium.launchPersistentContext(dir,{executablePath:'/opt/pw-browsers/chromium',viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,args:['--enable-precise-memory-info'],...(process.argv.includes('--android')?{userAgent:'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'}:{})});
  let page=ctx.pages()[0]||await ctx.newPage();let s=await setup(page);const first=await load(page);first.net=s.stats();
  const r={run:i,first};
  if(TR){try{r.transitions=await transitions(page);}catch(e){r.transitions={error:String(e).slice(0,200)};}}
  if(REPEAT){await page.close();page=await ctx.newPage();s=await setup(page);const rep=await load(page);rep.net=s.stats();r.repeat=rep;}
  await ctx.close();fs.rmSync(dir,{recursive:true,force:true});results.push(r);console.log(JSON.stringify(r));}
 console.log('OTHER URLS',JSON.stringify([...new Set(ALLURLS)]));fs.writeFileSync(path.join(__dirname,'raw-'+label+'.json'),JSON.stringify(results,null,1));
})();
