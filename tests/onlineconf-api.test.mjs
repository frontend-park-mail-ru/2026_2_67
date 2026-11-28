import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost:8081/' });
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
const calls = [];
const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, UserID: 7 })).toString('base64url')}.x`;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).endsWith('/auth/refresh')) return Response.json({ accessToken: token });
  if (String(url).endsWith('/onlineconf/admin/me')) return Response.json({ userId: 7, role: 'admin' });
  if (String(url).includes('/onlineconf/admin/configs?')) return Response.json({ configs: [] });
  if (String(url).endsWith('/onlineconf/admin/flags') && options.method === 'POST') return Response.json({ id: 2 }, { status: 201 });
  if (String(url).endsWith('/onlineconf/admin/flags')) return Response.json({ flags: [] });
  if (String(url).endsWith('/onlineconf/admin/configs') && options.method === 'POST') return Response.json({ id: 1 }, { status: 201 });
  if (String(url).endsWith('/onlineconf/admin/configs/1') && options.method === 'PUT') return Response.json({ id: 1 });
  if (String(url).endsWith('/onlineconf/admin/configs/1') && options.method === 'DELETE') return new Response(null, { status: 204 });
  if (String(url).endsWith('/onlineconf/admin/flags/2') && options.method === 'PUT') return Response.json({ id: 2 });
  if (String(url).endsWith('/onlineconf/admin/flags/2') && options.method === 'DELETE') return new Response(null, { status: 204 });
  if (String(url).includes('/onlineconf/admin/flags/2/evaluate')) return Response.json({ flagId: 2, enabled: true, reason: 'whitelist', bucket: 0 });
  if (String(url).includes('/onlineconf/admin/history?')) return Response.json({ history: [] });
  if (String(url).endsWith('/onlineconf/runtime/frontend')) return Response.json({ configs: {}, flags: {} });
  throw new Error(`Unexpected request: ${url}`);
};
const { restoreSession } = await import('../public/js/shared/auth.ts');
const { onlineConfApi, getRuntimeFrontend } = await import('../public/js/onlineconf/api.ts');

test('admin client sends documented paths, JSON and bearer token', async () => {
  await restoreSession();
  assert.deepEqual(await onlineConfApi.me(), { userId: 7, role: 'admin' });
  assert.deepEqual(await onlineConfApi.list('configs', 'cart', 'frontend'), []);
  await onlineConfApi.create({ key: 'cart.min_order_amount', scope: 'frontend', valueType: 'number', value: 1000, description: '' });
  await onlineConfApi.update(1, { valueType: 'number', value: 1200, description: '' });
  await onlineConfApi.remove('configs', 1);
  await onlineConfApi.createFlag({ key: 'checkout.enabled', scope: 'frontend', enabled: true, rolloutPercent: 25, whitelist: [7], blacklist: [], description: '' });
  await onlineConfApi.updateFlag(2, { enabled: false, rolloutPercent: 0, whitelist: [], blacklist: [], description: '' });
  await onlineConfApi.remove('flags', 2);
  await onlineConfApi.evaluate(2, 7);
  await onlineConfApi.history('flag', 2);
  await getRuntimeFrontend();
  assert.match(calls.find((call) => call.url.endsWith('/onlineconf/admin/me')).options.headers.Authorization, /^Bearer /);
  assert.match(calls.find((call) => call.url.includes('/configs?')).url, /scope=frontend/);
  assert.equal(JSON.parse(calls.find((call) => call.url.endsWith('/onlineconf/admin/configs') && call.options.method === 'POST').options.body).value, 1000);
  assert.equal(calls.find((call) => call.options.method === 'PUT').url, '/api/v1/onlineconf/admin/configs/1');
  assert.equal(calls.find((call) => call.options.method === 'DELETE').url, '/api/v1/onlineconf/admin/configs/1');
  assert.match(calls.find((call) => call.url.includes('/evaluate?')).url, /userId=7/);
});
