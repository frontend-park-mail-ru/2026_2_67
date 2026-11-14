import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { JSDOM } from 'jsdom';

const { validateSignup, getMissingPasswordRequirements, getEmailError } =
  await import('../public/js/shared/forms/validation.ts');
const { getAvatarFileError } = await import('../public/js/pages/profile/avatar-file-validation.ts');

test('email validation checks structure without a TLD allowlist', () => {
  for (const email of [
    'test@@example.com', 'first..last@example.com', 'first@example..com',
    '.first@example.com', 'first.@example.com', 'first@example.com ',
    ' first@example.com', 'first@', '@example.com', '\u043a\u0438\u0440\u0438\u043b\u043b\u0438\u0446\u0430@example.com',
    'first@\u043f\u0440\u0438\u043c\u0435\u0440.\u0440\u0444', 'first@-example.com', 'first@example-.com',
    'first..name+tag@example.com',
  ]) assert.notEqual(getEmailError(email), '', `${email} should be rejected`);

  for (const email of [
    'first@example.com', 'test@gmail.com1212', 'first+shop23@mail-2.example.co.uk',
    'First.Last+tag@Sub.Domain-2.Example.COM',
  ]) assert.equal(getEmailError(email), '', `${email} should be accepted`);
});

test('signup validation enforces printable ASCII password rules and length 8 through 72', () => {
  assert.equal(getMissingPasswordRequirements('Vibe2026!'), '');
  assert.equal(getMissingPasswordRequirements('ValidPass1!/#@-'), '');
  assert.equal(getMissingPasswordRequirements(`Aa1!${'x'.repeat(68)}`), '');
  assert.notEqual(getMissingPasswordRequirements(`Aa1!${'x'.repeat(69)}`), '');
  for (const password of ['D21/w', 'Vibe2026 !', 'Vibe2026!\t', 'Vibe2026!я', 'Vibe2026!😀']) {
    assert.notEqual(getMissingPasswordRequirements(password), '', `${JSON.stringify(password)} should be rejected`);
  }
  assert.match(getMissingPasswordRequirements('Vibe2026!я'), /ASCII/);
  assert.equal(validateSignup({ email: 'user@example.com', password: 'ValidPass1!', passwordRepeat: 'other' }).passwordRepeat !== undefined, true);
  assert.equal(validateSignup({ email: 'test@gmail.com1212', password: 'Vibe2026!', passwordRepeat: 'Vibe2026!' }).email, undefined);
});

test('invalid signup values never send a registration request', async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:8081/' });
  for (const name of ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLFormElement', 'HTMLInputElement', 'localStorage']) {
    globalThis[name] = dom.window[name];
  }
  globalThis.FormData = dom.window.FormData;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return Response.json({}); };
  const { renderAuthPage } = await import('../public/js/shared/forms/render-auth-page.ts');
  const app = dom.window.document.querySelector('#app');
  renderAuthPage(app, () => '<form data-auth-form="signup"><input name="email"><p data-error-for="email"></p><input name="password"><p data-error-for="password"></p><input name="passwordRepeat"><p data-error-for="passwordRepeat"></p><button type="submit">Join</button><p data-form-message></p></form>', validateSignup, () => {});
  const form = app.querySelector('form');
  for (const [name, value] of Object.entries({ email: 'bad@@example.com', password: 'D21/w', passwordRepeat: 'D21/w' })) {
    form.elements.namedItem(name).value = value;
  }
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests, 0);
  assert.notEqual(form.querySelector('[data-error-for="email"]').textContent, '');
  assert.notEqual(form.querySelector('[data-error-for="password"]').textContent, '');
});
test('avatar validation checks extension, MIME, real signature, and exact supported formats', async () => {
  const validFiles = [
    new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'photo.png', { type: 'image/png' }),
    new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], 'photo.jpg', { type: 'image/jpeg' }),
    new File([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], 'photo.jpeg', { type: 'image/jpeg' }),
    new File([Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])], 'photo.gif', { type: 'image/gif' }),
  ];
  for (const file of validFiles) assert.equal(await getAvatarFileError(file), '');
  assert.match(await getAvatarFileError(new File(['plain text'], 'photo.png', { type: 'image/png' })), /корректный файл/);
  assert.match(await getAvatarFileError(new File([new Uint8Array()], 'empty.gif', { type: 'image/gif' })), /пуст/);
  assert.match(await getAvatarFileError(new File(['x'], 'wrong.webp', { type: 'image/webp' })), /корректный файл/);
  const tooLarge = { name: 'large.png', type: 'image/png', size: 16 * 1024 * 1024 + 1,
    slice: () => new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]) };
  assert.match(await getAvatarFileError(tooLarge), /16 МБ/);
});
