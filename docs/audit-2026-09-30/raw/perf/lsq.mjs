import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
const srv = http.createServer((q, r) => { r.end('<html></html>'); }).listen(3399);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage(); await p.goto('http://127.0.0.1:3399/');
console.log(await p.evaluate(() => { const chunk = 'A'.repeat(100000); let n = 0; try { for (;;) { localStorage.setItem('k' + n, chunk); n++; } } catch (e) { return { chars: n * 100000, err: e.name }; } }));
await b.close(); srv.close();
