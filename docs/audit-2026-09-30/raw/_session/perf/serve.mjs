// Tiny static server for dist/ with gzip (like Firebase Hosting) and SPA fallback.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const ROOT = process.argv[2]; const PORT = Number(process.argv[3] || 3200);
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const cache = new Map();
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  const ext = path.extname(file);
  let body = fs.readFileSync(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache' };
  if (/gzip/.test(req.headers['accept-encoding'] || '') && /\.(js|css|html|json|svg)$/.test(ext)) {
    if (!cache.has(file)) cache.set(file, zlib.gzipSync(body, { level: 9 }));
    body = cache.get(file); headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers); res.end(body);
}).listen(PORT, '127.0.0.1', () => console.log('serving', ROOT, PORT));
