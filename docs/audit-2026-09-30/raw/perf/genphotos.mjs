import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
const out = await p.evaluate(async () => {
  const gen = (seed, amp) => {
    const c = document.createElement('canvas'); c.width = 750; c.height = 1000; const g = c.getContext('2d');
    let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const gr = g.createLinearGradient(0, 0, 750, 1000); gr.addColorStop(0, `hsl(${seed * 37 % 360},25%,80%)`); gr.addColorStop(1, `hsl(${seed * 53 % 360},30%,35%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 750, 1000);
    // "garment": a few shapes with folds
    for (let i = 0; i < 40; i++) { g.fillStyle = `hsla(${rnd() * 360},30%,${30 + rnd() * 50}%,0.35)`; g.beginPath(); g.ellipse(rnd() * 750, rnd() * 1000, 20 + rnd() * 200, 20 + rnd() * 200, rnd() * 3, 0, 7); g.fill(); }
    // fabric texture: fine weave lines + noise
    const d = g.getImageData(0, 0, 750, 1000); const a = d.data;
    for (let y = 0; y < 1000; y++) for (let x = 0; x < 750; x++) { const i = (y * 750 + x) * 4; const w = ((x + y) % 4 < 2 ? 6 : -6) + (rnd() - 0.5) * amp; a[i] += w; a[i + 1] += w; a[i + 2] += w; }
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.8);
  };
  // tune amplitude for ~170 KB base64
  let lo = 0, hi = 120, amp = 30;
  for (let k = 0; k < 12; k++) { amp = (lo + hi) / 2; const l = gen(1, amp).length; if (l > 174000) hi = amp; else lo = amp; }
  const imgs = []; for (let i = 1; i <= 12; i++) imgs.push(gen(i, amp));
  return { amp, imgs };
});
fs.writeFileSync(process.argv[2], JSON.stringify(out.imgs));
console.log('amp', out.amp.toFixed(1), out.imgs.map((x) => Math.round(x.length / 1024)).join(' '));
await b.close();
