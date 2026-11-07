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

const validationSource = new URL('../public/js/shared/forms/validation.ts', import.meta.url);
const validationCode = await transformFileAsync(fileURLToPath(validationSource), { presets: ['@babel/preset-typescript'] });
const { validateLogin, validateSignup } = await import(moduleUrl(validationCode.code));

const authUrl = moduleUrl('export const login = (...args) => globalThis.authFormMock.login(...args); export const register = (...args) => globalThis.authFormMock.register(...args);');
const errorsUrl = new URL('../public/js/shared/forms/render-field-errors.js', import.meta.url).href;
const formSource = new URL('../public/js/shared/forms/render-auth-page.ts', import.meta.url);
const formCode = await transformFileAsync(fileURLToPath(formSource), { presets: ['@babel/preset-typescript'] });
const source = formCode.code
  .replace('./render-field-errors.js', errorsUrl)
  .replace('../auth.js', authUrl);
const { renderAuthPage } = await import(moduleUrl(source));
const loginSource = await readFile(new URL('../public/js/templates/login.hbs', import.meta.url), 'utf8');
const signupSource = await readFile(new URL('../public/js/templates/signup.hbs', import.meta.url), 'utf8');
Handlebars.registerPartial('siteFooter', '');

test('email forms validate, display API errors and keep password controls', async (t) => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' });
  const saved = new Map();
  for (const key of ['document', 'FormData', 'HTMLFormElement', 'HTMLInputElement', 'HTMLButtonElement', 'authFormMock']) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  globalThis.document = dom.window.document;
  globalThis.FormData = dom.window.FormData;
  globalThis.HTMLFormElement = dom.window.HTMLFormElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });

  const requests = [];
  globalThis.authFormMock = {
    login: async (...args) => { requests.push(['login', ...args]); return { ok: false, status: 401, errors: {} }; },
    register: async (...args) => { requests.push(['register', ...args]); return { ok: false, status: 409, errors: { emailErrMessage: 'занята' } }; },
  };
  const app = dom.window.document.querySelector('#app');
  renderAuthPage(app, Handlebars.compile(loginSource), validateLogin, () => assert.fail('unexpected success'));
  let form = app.querySelector('form');
  assert.equal(form.elements.namedItem('loginOrEmail'), null);
  form.elements.namedItem('email').value = 'nickname';
  form.elements.namedItem('password').value = 'x';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(requests.length, 0);
  assert.equal(form.querySelector('[data-error-for="email"]').textContent, 'Введите корректный email');
  form.elements.namedItem('email').value = 'user@example.com';
  const fileInput = dom.window.document.createElement('input');
  fileInput.type = 'file';
  fileInput.name = 'email';
  const emailInput = form.elements.namedItem('email');
  emailInput.replaceWith(fileInput);
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(requests.length, 0);
  assert.equal(form.querySelector('[data-error-for="email"]').textContent, 'Введите почту.');
  fileInput.replaceWith(emailInput);
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(form.querySelector('[type="submit"]').disabled, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(form.querySelector('[type="submit"]').disabled, false);
  assert.deepEqual(requests[0], ['login', 'user@example.com', 'x']);
  assert.equal(form.elements.namedItem('email').getAttribute('aria-invalid'), 'true');
  assert.equal(form.elements.namedItem('password').getAttribute('aria-invalid'), 'true');
  assert.equal(form.querySelector('[data-form-message]').textContent, 'Неверный email или пароль');

  renderAuthPage(app, Handlebars.compile(signupSource), validateSignup, () => assert.fail('unexpected success'));
  form = app.querySelector('form');
  assert.equal(form.elements.namedItem('login'), null);
  const password = form.elements.namedItem('password');
  password.value = 'Strong1!';
  form.elements.namedItem('email').value = 'user@example.com';
  form.elements.namedItem('passwordRepeat').value = 'wrong';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(requests.length, 1);
  assert.equal(password.getAttribute('aria-invalid'), 'true');
  assert.equal(form.elements.namedItem('passwordRepeat').getAttribute('aria-invalid'), 'true');
  assert.equal(form.querySelector('[data-error-for="passwordRepeat"]').textContent, 'Пароли не совпадают');
  form.querySelector('.password-toggle').click();
  assert.equal(password.type, 'text');
  form.querySelector('.password-toggle').click();
  assert.equal(password.type, 'password');
  form.elements.namedItem('passwordRepeat').value = 'Strong1!';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requests[1], ['register', 'user@example.com', 'Strong1!']);
  assert.equal(form.querySelector('[data-error-for="email"]').textContent, 'Занята');
});
