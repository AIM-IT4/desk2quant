// Minimal local dev server for the Desk2Quant static site.
// - Serves the repo root with a directory index (index.html).
// - BLOCKS anything that must never leave disk over HTTP: dotfiles
//   (e.g. .env.local), underscore-prefixed entries (_private_notes,
//   _couponfix_backup, _da*, _op, _ot), tmp/, temp/, test/, graft/,
//   supabase/, node_modules/ and .claude/.
// - No dependencies. Usage: npm run dev  (PORT env overrides the default).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
};

// Top-level path segments that are never served (secrets, answer keys, junk).
const BLOCKED_SEGMENTS = new Set([
  '.env', '.env.local', '.freebuff', '.git', '.vercel', '.claude',
  '_da', '_da2', '_op', '_ot', '_private_notes', '_couponfix_backup',
  'tmp', 'temp', 'test', 'graft', 'supabase', 'node_modules',
]);

function blocked(segments) {
  return segments.some((seg) => {
    if (!seg) return false;
    if (seg.startsWith('.') || seg.startsWith('_')) return true;
    return BLOCKED_SEGMENTS.has(seg);
  });
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const segments = url.pathname.split('/').filter(Boolean);
    if (blocked(segments)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let filePath = path.normalize(path.join(ROOT, ...segments));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Desk2Quant dev server: http://localhost:${PORT}/`);
});
