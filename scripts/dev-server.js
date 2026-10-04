import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { log } from 'node:console';
import process from 'node:process';
import { pipeline } from 'node:stream';

const publicDirectory = resolve('public');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.hbs': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const requestedPath = pathname.replace(/^\/+/, '') || 'index.html';
  let filePath = resolve(publicDirectory, requestedPath);
  if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    if (statSync(filePath).isDirectory()) {
      filePath = resolve(filePath, 'index.html');
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    pipeline(createReadStream(filePath), response, (error) => {
      if (error && !response.headersSent) {
        response.writeHead(404).end('Not found');
      }
    });
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT || 8081);
server.listen(port, () => {
  log(`Frontend: http://localhost:${port}`);
});
