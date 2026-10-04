import { createReadStream, statSync } from 'node:fs';
import { createServer, request as createRequest } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { log } from 'node:console';
import process from 'node:process';
import { pipeline } from 'node:stream';

const publicDirectory = resolve('public');
const backendUrl = new URL(process.env.API_TARGET || 'http://localhost:8080');
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
  const requestUrl = new URL(request.url, 'http://localhost');

  if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
    const upstream = createRequest(new URL(requestUrl.pathname + requestUrl.search, backendUrl), {
      method: request.method,
      headers: { ...request.headers, host: backendUrl.host },
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      pipeline(upstreamResponse, response, () => {});
    });

    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      response.end(JSON.stringify({ error: 'Backend недоступен на localhost:8080.' }));
    });
    request.pipe(upstream);
    return;
  }

  const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  let filePath = resolve(publicDirectory, requestedPath || 'index.html');
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
  log(`API proxy: /api -> ${backendUrl.origin}`);
});