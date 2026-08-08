import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 4174);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.svg', 'image/svg+xml'],
]);

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = pathname === '/' ? 'jogo-geiger.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relative);

  if (!target.startsWith(root + path.sep) || !statSafe(target)) {
    response.writeHead(404).end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': types.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(target).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Static server: http://127.0.0.1:${port}`);
});

function statSafe(target) {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}
