import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost:8081/' });
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
const { getCurrentUser, loadCurrentUser, setCurrentUserProfile, login } = await import('../public/js/shared/auth.ts');
const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, UserID: 42 })).toString('base64url')}.x`;
globalThis.fetch = async (url) => String(url).endsWith('/auth/login')
  ? Response.json({ accessToken: token, userId: 42 }) : Response.json({ avatarUrl: '/media/media/avatar.png', name: 'Buyer' });
await login('buyer@example.com', 'password');

test('profile and header avatar URLs are refreshed after upload and profile reload', async () => {
  setCurrentUserProfile({ avatarUrl: '/media/media/avatar.png', telephone: '' }, '42');
  const initialUrl = getCurrentUser().avatarSrc;
  setCurrentUserProfile({ avatarUrl: '/media/media/avatar.png', telephone: '' }, '42');
  const afterUploadUrl = getCurrentUser().avatarSrc;
  assert.notEqual(initialUrl, afterUploadUrl);
  assert.match(afterUploadUrl, /[?&]v=\d+/);

  globalThis.fetch = async () => Response.json({ avatarUrl: '/media/media/avatar.png', name: 'Buyer' });
  await loadCurrentUser();
  const afterReloadUrl = getCurrentUser().avatarSrc;
  assert.notEqual(afterUploadUrl, afterReloadUrl);
  assert.match(afterReloadUrl, /[?&]v=\d+/);
});
