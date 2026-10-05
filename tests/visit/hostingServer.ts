// The emulator build served as Firebase Hosting serves the shop (firebase.json): files compressed (gzip), /assets
// cached for a year, index.html for every other path. `vite preview` sends files uncompressed, and on the slow phone
// profile of the speed measure (speed.spec.ts) that would triple the time of the scripts. Local only: 127.0.0.1
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../../dist-e2e');
const PORT = Number(process.env.SPEED_PORT ?? 4176);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const COMPRESSED = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt', '.xml']);
const gzipped = new Map<string, Buffer>();

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  let file = path.join(ROOT, pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  const ext = path.extname(file);
  res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'max-age=3600');
  if (COMPRESSED.has(ext) && /gzip/.test(String(req.headers['accept-encoding']))) {
    // a new build replaces the files: the key carries the time of the file
    const key = `${file}:${fs.statSync(file).mtimeMs}`;
    let body = gzipped.get(key);
    if (!body) gzipped.set(key, (body = gzipSync(fs.readFileSync(file), { level: 9 })));
    res.setHeader('Content-Encoding', 'gzip');
    res.end(body);
    return;
  }
  res.end(fs.readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}`));
