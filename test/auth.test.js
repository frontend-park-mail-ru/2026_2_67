import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';
import { JSDOM } from 'jsdom';

const source = new URL('../public/js/shared/auth.ts', import.meta.url);
const code = (await transformFileAsync(fileURLToPath(source), { presets: ['@babel/preset-typescript'] })).code;
let moduleNumber = 0;

async function freshAuth() {
  const codeWithId = `${code}\n// isolated test module ${moduleNumber++}`;
  return import(`data:text/javascript;base64,${Buffer.from(codeWithId).toString('base64')}`);
}

test('authentication preserves session, refresh, failures and logout', async (t) => {
  const dom = new JSDOM('', { url: 'http://localhost/' });
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
    if (previousFetch) Object.defineProperty(globalThis, 'fetch', previousFetch);
    else delete globalThis.fetch;
    dom.window.close();
  });

  const calls = [];
  let responses = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    assert.ok(response, `Unexpected request: ${url}`);
    return response;
  };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const auth = await freshAuth();
  assert.equal(auth.getCurrentUser(), null);

  responses = [json({ accessToken: 'old', userId: 7 }), json({ name: 'Ира', telephone: '123' })];
  assert.deepEqual(await auth.login('ira@example.com', 'secret'), { ok: true });
  assert.equal(calls[0].url, '/api/v1/auth/login');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'ira@example.com', password: 'secret' });
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[1].url, '/api/v1/buyers/7/profile');
  assert.deepEqual(auth.getCurrentUser(), { name: 'Ира', telephone: '123', phoneNumber: '123', userId: '7' });
  assert.equal(localStorage.getItem('accessToken'), 'old');
  assert.equal(localStorage.getItem('userId'), '7');

  responses = [json({}, 401), json({ accessToken: 'new' }), json({ ok: true })];
  const response = await auth.authorizedFetch('/protected', { method: 'GET' });
  assert.equal(response.status, 200);
  assert.equal(calls[2].options.headers.Authorization, 'Bearer old');
  assert.equal(calls[3].url, '/api/v1/auth/refresh');
  assert.equal(calls[3].options.credentials, 'include');
  assert.equal(calls[4].options.headers.Authorization, 'Bearer new');
  assert.equal(localStorage.getItem('userId'), '7');
  assert.equal(localStorage.getItem('accessToken'), 'new');

  responses = [json({ emailErrMessage: 'занято' }, 409)];
  assert.deepEqual(await auth.register('ira@example.com', 'secret'), {
    ok: false, status: 409, errors: { emailErrMessage: 'занято' },
  });
  assert.deepEqual(JSON.parse(calls[5].options.body), { email: 'ira@example.com', password: 'secret' });

  responses = [json({ errMessage: 'нет токена' })];
  assert.deepEqual(await auth.login('ira@example.com', 'secret'), { ok: false, errors: { form: 'нет токена' } });
  responses = [new Response('not-json')];
  assert.deepEqual(await auth.login('ira@example.com', 'secret'), {
    ok: false, errors: { form: 'Сервер не вернул токен авторизации.' },
  });
  globalThis.fetch = async () => { throw new Error('network'); };
  await assert.rejects(auth.logout(), /network/);
  assert.equal(auth.getCurrentUser(), null);
  assert.equal(localStorage.getItem('accessToken'), null);
  assert.equal(localStorage.getItem('userId'), null);
});

test('restores a saved user with a refreshed token and partial profile', async (t) => {
  const dom = new JSDOM('', { url: 'http://localhost/' });
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
    if (previousFetch) Object.defineProperty(globalThis, 'fetch', previousFetch);
    else delete globalThis.fetch;
    dom.window.close();
  });
  localStorage.setItem('userId', '9');
  let calls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify(calls++ === 0 ? { accessToken: 'restored' } : { name: 'Анна' }));
  const auth = await freshAuth();
  assert.deepEqual(auth.getCurrentUser(), { userId: '9' });
  assert.deepEqual(await auth.restoreSession(), { name: 'Анна', phoneNumber: undefined });
  assert.deepEqual(auth.getCurrentUser(), { name: 'Анна', phoneNumber: undefined, userId: '9' });
  assert.equal(localStorage.getItem('accessToken'), 'restored');
});
