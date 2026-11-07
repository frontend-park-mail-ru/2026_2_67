import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

function moduleUrl(code) {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

async function transform(path) {
  const source = new URL(path, import.meta.url);
  return (await transformFileAsync(fileURLToPath(source), { presets: ['@babel/preset-typescript'] })).code;
}

const profileTemplate = Handlebars.compile(await readFile(new URL('../public/js/templates/profile.hbs', import.meta.url), 'utf8'));
Handlebars.registerPartial('siteHeader', '<form data-catalog-search></form>');
Handlebars.registerPartial('siteFooter', '');
const templatesUrl = moduleUrl('export const profileTemplate = (...args) => globalThis.profileTest.template(...args);');
const authUrl = moduleUrl('export const getCurrentUser = () => ({ userId: "7" });');
const cartUrl = moduleUrl('export const initCart = (...args) => globalThis.profileTest.initCart(...args);');
const validationUrl = moduleUrl(await transform('../public/js/shared/forms/validation.ts'));
const code = (await transform('../public/js/pages/profile/profile.ts'))
  .replace('../../shared/auth.js', authUrl)
  .replace('../../templates/templates.js', templatesUrl)
  .replace('../../components/cart/cart.js', cartUrl)
  .replace('../../shared/forms/validation.js', validationUrl);
const { renderProfilePage } = await import(moduleUrl(code));

test('profile opens dialogs and updates password requirements', (t) => {
  const dom = new JSDOM('<div id="app"></div>');
  const saved = new Map();
  for (const key of ['HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'profileTest']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  for (const key of ['HTMLElement', 'HTMLDialogElement', 'HTMLInputElement']) globalThis[key] = dom.window[key];
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    dom.window.close();
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  let cartUser;
  globalThis.profileTest = { template: profileTemplate, initCart: (page, userId) => { cartUser = userId; } };
  const app = dom.window.document.querySelector('#app');
  renderProfilePage(app);
  assert.equal(cartUser, '7');
  app.querySelector('[data-open-password-editor]').click();
  const dialog = app.querySelector('#profile-password-dialog');
  const input = dialog.querySelector('input[name="newPassword"]');
  assert.equal(dialog.open, true);
  assert.match(dialog.querySelector('#profile-new-password-rules').textContent, /не менее 8 символов/);
  input.value = 'Strong1!';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(input.getAttribute('aria-invalid'), 'false');
  assert.equal(dialog.querySelector('#profile-new-password-rules').textContent, '');
  dialog.querySelector('.profile-edit-dialog__cancel').click();
  assert.equal(dialog.open, false);
});
