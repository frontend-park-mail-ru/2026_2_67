import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost:8081/' });
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
localStorage.setItem('accessToken', 'legacy-token');
sessionStorage.setItem('accessToken', 'legacy-token');
const { login, logout, restoreSession, authorizedFetch, getCurrentUser, loadCurrentUser } = await import('../public/js/shared/auth.ts');
const token = (seconds) => `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, UserID: 42 })).toString('base64url')}.x`;
let refreshes = 0;
let logouts = 0;
let profileRequests = 0;
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.endsWith('/auth/login')) return Response.json({ accessToken: token(60), userId: 42 });
  if (path.endsWith('/auth/refresh')) { refreshes += 1; return Response.json({ accessToken: token(60) }); }
  if (path.endsWith('/auth/logout')) { logouts += 1; return new Response(null, { status: 200 }); }
  if (path.endsWith('/profile')) { profileRequests += 1; return Response.json({ name: 'Buyer', telephone: '' }); }
  return new Response(null, { status: 200, headers: { 'X-Sent-Authorization': String(new Headers(options.headers).get('Authorization')) } });
};

test('legacy tokens are removed and F5 restoration uses the refresh cookie', async () => {
  assert.equal(localStorage.getItem('accessToken'), null);
  assert.equal(sessionStorage.getItem('accessToken'), null);
  const user = await restoreSession();
  assert.equal(user.name, 'Buyer');
  assert.equal(getCurrentUser().userId, '42');
  assert.equal(refreshes, 1);
  assert.equal(profileRequests, 1);
  assert.equal(localStorage.getItem('accessToken'), null);
  assert.equal(sessionStorage.getItem('accessToken'), null);
});

test('expired access token refreshes once for parallel requests and logout clears memory', async (t) => {
  await login('buyer@example.com', 'password');
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 120000);
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/auth/refresh')) { refreshes += 1; return Response.json({ accessToken: token(60) }); }
    if (path.endsWith('/auth/logout')) { logouts += 1; return new Response(null, { status: 200 }); }
    return new Response(null, { status: 200, headers: { 'X-Sent-Authorization': String(new Headers(options.headers).get('Authorization')) } });
  };
  const before = refreshes;
  const responses = await Promise.all([authorizedFetch('/one'), authorizedFetch('/two')]);
  assert.equal(refreshes, before + 1);
  assert.ok(responses.every((response) => response.headers.get('X-Sent-Authorization')?.startsWith('Bearer ')));
  await logout();
  assert.equal(logouts, 1);
  assert.equal(getCurrentUser(), null);
  assert.equal(localStorage.getItem('accessToken'), null);
  assert.equal(sessionStorage.getItem('accessToken'), null);
});

test('logout aborts an in-flight refresh and prevents session resurrection', async () => {
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/auth/login')) return Response.json({ accessToken: token(60), userId: 42 });
    if (path.endsWith('/auth/refresh')) return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
    if (path.endsWith('/auth/logout')) return new Response(null, { status: 200 });
    if (path.endsWith('/profile')) return Response.json({ name: 'Buyer', telephone: '' });
    return new Response(null, { status: 401 });
  };
  await login('buyer@example.com', 'password');
  const request = authorizedFetch('/protected');
  await new Promise((resolve) => setImmediate(resolve));
  await logout();
  await request;
  assert.equal(getCurrentUser(), null);
  assert.equal(localStorage.getItem('accessToken'), null);
});

test('late login response after logout cannot restore the local session', async () => {
  let finishLogin;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/login')) return new Promise((resolve) => { finishLogin = resolve; });
    return new Response(null, { status: 200 });
  };
  const pending = login('buyer@example.com', 'password');
  await logout();
  finishLogin(Response.json({ accessToken: token(60), userId: 42 }));
  assert.equal((await pending).ok, false);
  assert.equal(getCurrentUser(), null);
});

test('profile survives a 401 followed by a successful refresh', async () => {
  let firstProfile = true;
  let refreshed = 0;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith('/auth/login')) return Response.json({ accessToken: token(60), userId: 42 });
    if (path.endsWith('/auth/refresh')) { refreshed += 1; return Response.json({ accessToken: token(60) }); }
    if (path.endsWith('/profile')) {
      if (firstProfile) { firstProfile = false; return new Response(null, { status: 401 }); }
      return Response.json({ name: 'Buyer', telephone: '' });
    }
    return new Response(null, { status: 200 });
  };
  await login('buyer@example.com', 'password');
  assert.equal((await loadCurrentUser()).name, 'Buyer');
  assert.equal(refreshed, 1);
});
