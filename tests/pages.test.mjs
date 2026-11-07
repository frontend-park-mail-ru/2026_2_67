import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:8081/profile' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'HTMLButtonElement', 'HTMLAnchorElement',
  'HTMLInputElement', 'Element', 'Node', 'localStorage']) globalThis[key] = key === 'localStorage' ? dom.window.localStorage : dom.window[key];
globalThis.Handlebars = Handlebars;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.x`;
localStorage.setItem('accessToken', token);
localStorage.setItem('userId', '42');

let profile = { name: 'Иван', surname: 'Иванов', telephone: '+70000000000', email: 'a@example.test',
  birthDate: '2000-01-01 00:00:00 +0000 UTC', description: 'Сохранить описание', avatarUrl: '' };
let basket = [
  { id: 1, category: '', name: 'Первый', pictureUrl: '', price: 10, discount: 0, priceResult: 10, count: 6 },
  { id: 2, category: '', name: 'Второй', pictureUrl: '', price: 20, discount: 0, priceResult: 20, count: 1 },
];
let profileStatus = 200;
let pendingPatch = null;
let previewBody = null;
let pendingOrder = null;
const postFailures = new Map([[4, 1]]);
let nonStockPatch422 = false;
const requests = [];
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.startsWith('file:')) return new Response(readFileSync(new URL(path), 'utf8'));
  requests.push({ path, options });
  if (path.endsWith('/profile')) {
    if (options.method === 'PATCH') {
      if (pendingPatch) await pendingPatch;
      if (profileStatus === 405) return new Response(null, { status: 405 });
      if (profileStatus === 422) return Response.json({ nameErrMessage: 'Неверное имя' }, { status: 422 });
      profile = { ...profile, ...JSON.parse(options.body) };
    }
    return Response.json(profile);
  }
  if (path.endsWith('/basket')) return Response.json({ basketProducts: basket, basketSum: 40, basketSumResult: 40 });
  if (path.endsWith('/basket/products') && options.method === 'POST') {
    const { productId } = JSON.parse(options.body);
    if (productId === 3) return new Response(null, { status: 422 });
    const failures = postFailures.get(productId) ?? 0;
    if (failures > 0) {
      postFailures.set(productId, failures - 1);
      return new Response(productId === 4 ? 'validation failure' : null, { status: 422 });
    }
    if (productId === 4) {
      basket.push({ id: productId, category: '', name: `Product ${productId}`, pictureUrl: '', price: 30,
        discount: 0, priceResult: 30, count: 1 });
      return new Response(null, { status: 200 });
    }
    throw new Error('Unexpected product');
  }
  if (path.includes('/basket/products/')) {
    const productId = Number(path.split('/').at(-1));
    const count = JSON.parse(options.body).count;
    if (productId === 2 && nonStockPatch422) {
      nonStockPatch422 = false;
      return new Response('validation failure', { status: 422 });
    }
    if (productId === 1 && count > 6) return new Response(null, { status: 422 });
    basket = basket.map((item) => item.id === productId ? { ...item, count } : item);
    return new Response(null, { status: 200 });
  }
  if (path.endsWith('/basket/preview')) return previewBody
    ? Response.json(previewBody, { status: 422 }) : Response.json({ pickupPoint: { longitude: 1, latitude: 2 } });
  if (path === '/api/v1/orders/') {
    if (pendingOrder) await pendingOrder;
    return Response.json({ orderId: 9 });
  }
  if (path.startsWith('/api/v1/products')) return Response.json({ products: [...basket, { id: 3, name: 'Третий', priceResult: 30 }, { id: 4, name: 'Четвёртый', priceResult: 30 }].map((item) => ({
    id: item.id, name: item.name, pictureUrls: [''], priceResult: item.priceResult, rating: 0, reviewsCount: 0,
  })), nextCursor: '' });
  throw new Error(`Unexpected request: ${path}`);
};

const { loadTemplates } = await import('../public/js/templates/templates.ts');
const { restoreSession, setCurrentUserProfile } = await import('../public/js/shared/auth.ts');
const { renderProfilePage } = await import('../public/js/pages/profile/profile.ts');
const { renderCartPage } = await import('../public/js/pages/cart/cart-page.ts');
const { renderCatalogPage } = await import('../public/js/pages/catalog/catalog.ts');
const { renderCheckoutPage } = await import('../public/js/pages/checkout/checkout-page.ts');
await loadTemplates();
await restoreSession();
const app = document.querySelector('#app');
const tick = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(resolve, 0)); };

test('profile keeps input on 405/422 and updates visible data only after 200', async () => {
  renderProfilePage(app);
  await tick();
  document.querySelector('[data-open-profile-editor]').click();
  const editor = document.querySelector('.profile-edit-dialog');
  const name = editor.querySelector('input[name="name"]');
  assert.equal(editor.querySelector('input[name="birthDate"]').value, '2000-01-01');
  name.value = 'Пётр';
  profileStatus = 405;
  editor.querySelector('.profile-edit-dialog__apply').click();
  await tick();
  assert.equal(name.value, 'Пётр');
  assert.equal(document.querySelector('.profile-page__name').textContent, 'Иван');
  assert.match(editor.querySelector('.profile-edit-dialog__message').textContent, /не поддерживается/);
  profileStatus = 422;
  editor.querySelector('.profile-edit-dialog__apply').click();
  await tick();
  assert.equal(editor.querySelector('[data-profile-error="name"]').textContent, 'Неверное имя');
  assert.equal(name.value, 'Пётр');
  profileStatus = 200;
  editor.querySelector('.profile-edit-dialog__apply').click();
  await tick();
  assert.equal(document.querySelector('.profile-page__name').textContent, 'Пётр');
  const patch = requests.filter((request) => request.path.endsWith('/profile') && request.options.method === 'PATCH').at(-1);
  assert.equal(JSON.parse(patch.options.body).description, 'Сохранить описание');
  assert.equal(JSON.parse(patch.options.body).telephone, '+70000000000');
  assert.equal('avatar' in JSON.parse(patch.options.body), false);
});

test('email and phone editors preserve the other fields', async () => {
  renderProfilePage(app);
  await tick();
  document.querySelector('[data-open-email-editor]').click();
  const emailDialog = document.querySelector('#profile-email-dialog');
  emailDialog.querySelector('input').value = 'new@example.test';
  emailDialog.querySelector('.profile-edit-dialog__apply').click();
  await tick();
  let patch = requests.filter((request) => request.path.endsWith('/profile') && request.options.method === 'PATCH').at(-1);
  assert.deepEqual(JSON.parse(patch.options.body), {
    name: 'Пётр', surname: 'Иванов', telephone: '+70000000000', email: 'new@example.test',
    birthDate: '2000-01-01 00:00:00 +0000 UTC', description: 'Сохранить описание',
  });
  document.querySelector('[data-open-phone-editor]').click();
  const phoneDialog = document.querySelector('#profile-phone-dialog');
  phoneDialog.querySelector('input').value = '+79999999999';
  phoneDialog.querySelector('.profile-edit-dialog__apply').click();
  await tick();
  patch = requests.filter((request) => request.path.endsWith('/profile') && request.options.method === 'PATCH').at(-1);
  assert.equal(JSON.parse(patch.options.body).telephone, '+79999999999');
  assert.equal(JSON.parse(patch.options.body).email, 'new@example.test');
  assert.equal(JSON.parse(patch.options.body).description, 'Сохранить описание');
  assert.match(document.querySelector('.profile-page__account-facts').textContent, /\+79999999999/);
});

test('profile editor prevents duplicate PATCH while saving', async () => {
  renderProfilePage(app);
  await tick();
  document.querySelector('[data-open-email-editor]').click();
  const editor = document.querySelector('#profile-email-dialog');
  editor.querySelector('input').value = 'waiting@example.test';
  let release;
  pendingPatch = new Promise((resolve) => { release = resolve; });
  const before = requests.filter((request) => request.path.endsWith('/profile') && request.options.method === 'PATCH').length;
  const apply = editor.querySelector('.profile-edit-dialog__apply');
  apply.click();
  apply.click();
  assert.equal(apply.disabled, true);
  assert.equal(requests.filter((request) => request.path.endsWith('/profile') && request.options.method === 'PATCH').length, before + 1);
  release();
  pendingPatch = null;
  await tick();
  assert.match(document.querySelector('.profile-page__account-facts').textContent, /waiting@example.test/);
});

test('POST 422 does not pretend first addition succeeded', async () => {
  dom.window.history.replaceState({}, '', '/');
  renderCatalogPage(app);
  await tick();
  const third = () => document.querySelector('[data-product-id="3"]');
  third().querySelector('.product-card__add-to-cart').click();
  await tick();
  assert.equal(third().querySelector('.product-card__quantity'), null);
  assert.equal(third().querySelector('.product-card__add-to-cart'), null);
  assert.equal(third().querySelector('[data-cart-controls] button'), null);
  assert.match(third().textContent, /Нет в наличии/);
  assert.equal(basket.some((item) => item.id === 3), false);
  assert.equal(document.querySelector('[data-product-id="2"] .product-card__increase').disabled, false);
  const postCount = requests.filter((request) => request.path.endsWith('/basket/products') && JSON.parse(request.options.body).productId === 3).length;
  third().querySelector('.product-card__stock-warning').click();
  await tick();
  assert.equal(requests.filter((request) => request.path.endsWith('/basket/products') && JSON.parse(request.options.body).productId === 3).length, postCount);
});

test('non-stock 422 leaves other products and retry controls available', async () => {
  dom.window.history.replaceState({}, '', '/');
  renderCatalogPage(app);
  await tick();
  const fourth = () => document.querySelector('[data-product-id="4"]');
  fourth().querySelector('.product-card__add-to-cart').click();
  await tick();
  assert.equal(fourth().querySelector('.product-card__stock-warning'), null);
  assert.equal(fourth().querySelector('.product-card__add-to-cart').disabled, false);
  assert.equal(basket.some((item) => item.id === 4), false);
  fourth().querySelector('.product-card__add-to-cart').click();
  await tick();
  assert.equal(fourth().querySelector('.product-card__quantity').textContent, '1');
  assert.equal(document.querySelector('[data-product-id="1"] .product-card__increase').disabled, false);
  basket = basket.filter((item) => item.id !== 4);

  dom.window.history.replaceState({}, '', '/cart');
  renderCartPage(app);
  await tick();
  nonStockPatch422 = true;
  const second = () => document.querySelector('.cart-page__items [data-cart-item-id="2"]');
  second().querySelector('.cart-item__increase').click();
  await tick();
  assert.equal(second().querySelector('.cart-item__quantity').textContent, '1');
  assert.equal(second().querySelector('.cart-item__stock-warning'), null);
  assert.equal(second().querySelector('.cart-item__increase').disabled, false);
  second().querySelector('.cart-item__increase').click();
  await tick();
  assert.equal(second().querySelector('.cart-item__quantity').textContent, '2');
  basket = basket.map((item) => item.id === 2 ? { ...item, count: 1 } : item);
});

test('cart 422 preserves count, blocks one product across views, and decrease clears limit', async () => {
  dom.window.history.replaceState({}, '', '/cart');
  renderCartPage(app);
  await tick();
  const first = () => document.querySelector('.cart-page__items [data-cart-item-id="1"]');
  const second = () => document.querySelector('.cart-page__items [data-cart-item-id="2"]');
  first().querySelector('.cart-item__increase').click();
  await tick();
  assert.equal(first().querySelector('.cart-item__quantity').textContent, '6');
  assert.equal(first().querySelector('.cart-item__increase').disabled, true);
  assert.equal(second().querySelector('.cart-item__increase').disabled, false);
  assert.match(first().textContent, /В наличии больше нет/);
  const countRequests = () => requests.filter((request) => request.path.endsWith('/basket/products/1') && JSON.parse(request.options.body).count === 7).length;
  const before = countRequests();
  first().querySelector('.cart-item__increase').click();
  await tick();
  assert.equal(countRequests(), before);
  renderCartPage(app);
  await tick();
  assert.equal(first().querySelector('.cart-item__increase').disabled, true);
  dom.window.history.replaceState({}, '', '/');
  renderCatalogPage(app);
  await tick();
  assert.equal(document.querySelector('[data-product-id="1"] .product-card__increase').disabled, true);
  assert.equal(document.querySelector('[data-product-id="2"] .product-card__increase').disabled, false);
  dom.window.history.replaceState({}, '', '/checkout');
  renderCheckoutPage(app);
  await tick();
  assert.match(document.querySelector('.checkout-page__basket-items [data-cart-item-id="1"]').textContent, /В наличии больше нет/);
  dom.window.history.replaceState({}, '', '/cart');
  renderCartPage(app);
  await tick();
  first().querySelector('.cart-item__decrease').click();
  await tick();
  assert.equal(first().querySelector('.cart-item__quantity').textContent, '5');
  assert.equal(first().querySelector('.cart-item__increase').disabled, false);
  first().querySelector('.cart-item__increase').click();
  await tick();
  assert.equal(first().querySelector('.cart-item__quantity').textContent, '6');
  assert.equal(first().querySelector('.cart-item__increase').disabled, true);
  const atLimit = countRequests();
  first().querySelector('.cart-item__increase').click();
  await tick();
  assert.equal(first().querySelector('.cart-item__quantity').textContent, '6');
  assert.equal(first().querySelector('.cart-item__increase').disabled, true);
  assert.equal(countRequests(), atLimit);
  second().querySelector('.cart-item__increase').click();
  await tick();
  assert.equal(second().querySelector('.cart-item__quantity').textContent, '2');
});

test('checkout preview product errors stay beside item and block ordering', async () => {
  previewBody = { errMessage: 'при создании заказа произошла ошибка',
    productsErr: [{ productId: 2, name: 'Второй', seller: 'Продавец', errMessage: 'Товар закончился' }] };
  dom.window.navigator.geolocation = { getCurrentPosition: (success) => success({ coords: { longitude: 1, latitude: 2 } }) };
  dom.window.history.replaceState({}, '', '/checkout');
  renderCheckoutPage(app);
  await tick();
  document.querySelector('.checkout-page__pickup-button').click();
  await tick();
  assert.match(document.querySelector('.checkout-page__basket-items [data-cart-item-id="2"]').textContent, /Товар закончился/);
  assert.doesNotMatch(document.querySelector('.checkout-page__basket-items [data-cart-item-id="1"]').textContent, /Товар закончился/);
  assert.equal(document.querySelector('.checkout-page__submit').disabled, true);
  assert.equal(requests.filter((request) => request.path === '/api/v1/orders/').length, 0);
});

test('checkout combines stock and preview warnings once per product', async () => {
  dom.window.history.replaceState({}, '', '/cart');
  renderCartPage(app);
  await tick();
  document.querySelector('.cart-page__items [data-cart-item-id="1"] .cart-item__increase').click();
  await tick();

  previewBody = { productsErr: [
    { productId: 1, errMessage: 'В наличии больше нет' },
    { productId: 2, errMessage: 'Товар временно недоступен' },
  ] };
  dom.window.navigator.geolocation = { getCurrentPosition: (success) => success({ coords: { longitude: 1, latitude: 2 } }) };
  dom.window.history.replaceState({}, '', '/checkout');
  renderCheckoutPage(app);
  await tick();
  const item = (id) => document.querySelector(`.checkout-page__basket-items [data-cart-item-id="${id}"]`);
  assert.deepEqual([...item(1).querySelectorAll('.cart-item__stock-warning')].map((warning) => warning.textContent), ['В наличии больше нет']);
  assert.equal(item(2).querySelector('.cart-item__stock-warning'), null);

  document.querySelector('.checkout-page__pickup-button').click();
  await tick();
  assert.deepEqual([...item(1).querySelectorAll('.cart-item__stock-warning')].map((warning) => warning.textContent), ['В наличии больше нет']);
  assert.deepEqual([...item(2).querySelectorAll('.cart-item__stock-warning')].map((warning) => warning.textContent), ['Товар временно недоступен']);
  assert.equal(document.querySelector('.checkout-page__submit').disabled, true);

  previewBody = { productsErr: [{ productId: 1, errMessage: 'Уточните доступное количество у продавца' }] };
  document.querySelector('.checkout-page__pickup-button').click();
  await tick();
  const warnings = item(1).querySelectorAll('.cart-item__stock-warning');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].textContent, /В наличии больше нет/);
  assert.match(warnings[0].textContent, /Уточните доступное количество у продавца/);
  assert.equal(item(2).querySelector('.cart-item__stock-warning'), null);

  previewBody = null;
  renderCheckoutPage(app);
  await tick();
  assert.deepEqual([...item(1).querySelectorAll('.cart-item__stock-warning')].map((warning) => warning.textContent), ['В наличии больше нет']);
  assert.equal(item(2).querySelector('.cart-item__stock-warning'), null);
});

test('checkout stays disabled while repeat preview and order request are pending', async () => {
  previewBody = null;
  dom.window.ymaps3 = {
    ready: Promise.resolve(),
    YMap: class { addChild() {} },
    YMapDefaultSchemeLayer: class {},
    YMapDefaultFeaturesLayer: class {},
    YMapMarker: class {},
  };
  dom.window.history.replaceState({}, '', '/checkout');
  renderCheckoutPage(app);
  await tick();
  document.querySelector('.checkout-page__pickup-button').click();
  await tick();
  const submit = document.querySelector('.checkout-page__submit');
  assert.equal(submit.disabled, false);
  let release;
  pendingOrder = new Promise((resolve) => { release = resolve; });
  const before = requests.filter((request) => request.path === '/api/v1/orders/').length;
  submit.click();
  await tick();
  assert.equal(submit.disabled, true);
  submit.click();
  assert.equal(requests.filter((request) => request.path === '/api/v1/orders/').length, before + 1);
  release();
  pendingOrder = null;
  await tick();
  assert.match(document.querySelector('.checkout-page__order-status').textContent, /Заказ №9 оформлен/);
});

test('profile editor does not send blank fields when profile data is missing', async () => {
  setCurrentUserProfile({}, '42');
  dom.window.history.replaceState({}, '', '/profile');
  renderProfilePage(app);
  await tick();
  document.querySelector('[data-open-profile-editor]').click();
  const before = requests.filter((request) => request.path.endsWith('/profile') && request.options.method === 'PATCH').length;
  document.querySelector('.profile-edit-dialog__apply').click();
  await tick();
  assert.equal(requests.filter((request) => request.path.endsWith('/profile') && request.options.method === 'PATCH').length, before);
  assert.match(document.querySelector('.profile-edit-dialog__message').textContent, /Не удалось загрузить профиль/);
});
