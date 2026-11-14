import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost:8081/' });
globalThis.localStorage = dom.window.localStorage;
localStorage.setItem('accessToken', 'test-token');
localStorage.setItem('userId', '42');
const { getCurrentUser, loadCurrentUser, setCurrentUserProfile } = await import('../public/js/shared/auth.ts');

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