import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import webpack from 'webpack';
import config from '../webpack.config.js';

test('built service worker precaches the shell, isolates API requests and updates caches', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vibemarket-worker-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const compiler = webpack({ ...config, mode: 'development', output: { ...config.output, path: directory } });
  const stats = await new Promise((resolve, reject) => {
    compiler.run((error, result) => compiler.close((closeError) => {
      if (error || closeError) reject(error || closeError);
      else resolve(result);
    }));
  });
  assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
  const script = await readFile(path.join(directory, 'service-worker.js'), 'utf8');
  const main = await readFile(path.join(directory, 'main.js'), 'utf8');
  assert.match(main, /register\('\/service-worker\.js'\)/);
  assert.doesNotMatch(script, /__OFFLINE_(ASSETS|VERSION)__/);

  const handlers = {};
  const deleted = [];
  let manifest;
  let cacheName;
  let claimed = false;
  const cached = new Map([['/index.html', 'shell'], ['/main.js', 'script']]);
  const cache = {
    addAll: async (urls) => { manifest = [...urls]; },
    match: async (request) => cached.get(typeof request === 'string' ? request : new URL(request.url).pathname),
  };
  const caches = {
    open: async (name) => { cacheName = name; return cache; },
    keys: async () => ['vibemarket-static-old', cacheName, 'another-app-cache'],
    delete: async (name) => { deleted.push(name); return true; },
  };
  const context = {
    addEventListener: (name, handler) => { handlers[name] = handler; },
    location: { origin: 'http://localhost:8081' },
    clients: { claim: async () => { claimed = true; } },
    caches, URL, Response,
    fetch: async () => { throw new Error('offline'); },
  };
  vm.runInNewContext(script, context);
  async function lifetime(name) {
    let pending;
    handlers[name]({ waitUntil: (promise) => { pending = promise; } });
    await pending;
  }
  await lifetime('install');
  assert.match(cacheName, /^vibemarket-static-[a-f0-9]{16}$/);
  for (const url of ['/index.html', '/main.js', '/css/main.css', '/templates/catalog.hbs', '/vendor/handlebars/handlebars.min.js', '/images/cart-icon.png']) {
    assert.ok(manifest.includes(url), url);
  }
  assert.ok(manifest.every((url) => url.startsWith('/') && !url.startsWith('/api/')));
  await lifetime('activate');
  assert.deepEqual(deleted, ['vibemarket-static-old']);
  assert.equal(claimed, true);

  function dispatch(url, mode = 'cors', method = 'GET') {
    let response;
    handlers.fetch({ request: { url, mode, method }, respondWith: (value) => { response = value; } });
    return response;
  }
  assert.equal(await dispatch('http://localhost:8081/cart', 'navigate'), 'shell');
  assert.equal(await dispatch('http://localhost:8081/main.js'), 'script');
  assert.equal(dispatch('http://localhost:8081/api/v1/basket'), undefined);
  assert.equal(dispatch('http://localhost:8081/api/v1/auth/login', 'navigate'), undefined);
  assert.equal(dispatch('http://localhost:8081/main.js', 'cors', 'POST'), undefined);
  assert.equal(dispatch('https://api-maps.yandex.ru/v3/'), undefined);
  assert.equal(dispatch('http://localhost:8081/unlisted'), undefined);
});
