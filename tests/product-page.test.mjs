import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:8081/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'HTMLAnchorElement',
  'HTMLInputElement', 'HTMLImageElement', 'Element', 'Node', 'localStorage', 'sessionStorage']) {
  globalThis[key] = dom.window[key];
}
globalThis.Handlebars = Handlebars;
const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.x`;
localStorage.setItem('accessToken', token);
localStorage.setItem('userId', '42');

let basket = [];
let basketFails = false;
let patchFails = false;
let validityUnavailable = [];
let validityFails = false;
let pendingPost = null;
let pendingPatch = null;
let detailProduct = null;
let catalogPages = null;
const requests = [];
const product = { id: 9, name: 'Speaker', pictureUrls: ['/one.jpg', '/two.jpg'], priceResult: 85.49,
  sellerName: 'AppleVibe', rating: 0, reviewsCount: 0 };
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.startsWith('file:')) return new Response(readFileSync(new URL(path), 'utf8'));
  requests.push({ path, options });
  if (path.endsWith('/profile')) return Response.json({ name: 'Покупатель' });
  if (path.endsWith('/basket/is_valid')) {
    if (validityFails) return new Response(null, { status: 503 });
    if (validityUnavailable.length) {
      return new Response(JSON.stringify({ products: validityUnavailable.map((item) => typeof item === 'number' ? { id: item, newAvailableCount: 0 } : item) }), { status: 422 });
    }
    return Response.json({});
  }
  if (path.endsWith('/basket')) {
    if (basketFails) return new Response(null, { status: 502 });
    return Response.json({ basketProducts: basket, basketSum: 0, basketSumResult: 0 });
  }
  if (path.endsWith('/basket/products') && options.method === 'POST') {
    if (pendingPost) await pendingPost;
    const body = JSON.parse(options.body);
    basket = [{ id: body.productId, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
      price: product.priceResult, discount: 0, priceResult: product.priceResult, count: body.count }];
    return new Response(null, { status: 200 });
  }
  if (path.endsWith('/basket/products/9') && options.method === 'PATCH') {
    if (patchFails) return new Response(null, { status: 422 });
    if (pendingPatch) await pendingPatch;
    const count = JSON.parse(options.body).count;
    if (count === 0) basket = basket.filter((item) => item.id !== 9);
    else basket.find((item) => item.id === 9).count = count;
    return new Response(null, { status: 200 });
  }
  if (path.endsWith('/products/9') && detailProduct) return Response.json({ product: detailProduct });
  if (path.startsWith('/api/v1/products') && catalogPages) {
    return Response.json(path.includes('cursor=') ? catalogPages[1] : catalogPages[0]);
  }
  if (path.startsWith('/api/v1/products')) return Response.json({ products: [product], nextCursor: '' });
  throw new Error(`Unexpected request: ${path}`);
};

const { productUrl } = await import('../public/js/shared/product-url.ts');
Handlebars.registerHelper('productUrl', productUrl);
const { loadTemplates } = await import('../public/js/templates/templates.ts');
const { rememberProducts } = await import('../public/js/data/product-session.ts');
const { renderProductPage } = await import('../public/js/pages/product/product-page.ts');
const { renderCatalogPage } = await import('../public/js/pages/catalog/catalog.ts');
const { formatProductTotal } = await import('../public/js/pages/product/product-price.ts');
const { getProfileEmailError } = await import('../public/js/shared/forms/validation.ts');
const cartItemsTemplate = Handlebars.compile(readFileSync(new URL('../public/js/templates/cart-items.hbs', import.meta.url), 'utf8'));
const ordersListTemplate = Handlebars.compile(readFileSync(new URL('../public/js/templates/orders-list.hbs', import.meta.url), 'utf8'));
await loadTemplates();
const app = document.querySelector('#app');
const tick = () => new Promise((resolve) => setImmediate(resolve));

test.beforeEach((t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  requests.length = 0;
  basket = [];
  validityUnavailable = [];
  validityFails = false;
  patchFails = false;
  pendingPost = null;
  pendingPatch = null;
});

test.afterEach(() => {
  app.replaceChildren();
});

test('catalog link opens a product route without wrapping the cart button', async () => {
  renderCatalogPage(app);
  await tick();
  const link = document.querySelector('[data-product-link]');
  assert.equal(link?.getAttribute('href'), '/products/9/speaker');
  assert.equal(link?.contains(document.querySelector('.product-card__add-to-cart')), false);
});

test('gallery and price use the real catalog response', async () => {
  rememberProducts([product]);
  await renderProductPage(app, 9, () => {});
  await tick();
  assert.match(document.querySelector('.product-page__price').textContent, /85,49/);
  assert.match(document.querySelector('.product-page__seller').textContent, /AppleVibe/);
  assert.match(document.querySelector('.product-page__description').textContent, /Описание пока не добавлено/);
  document.querySelector('[data-detail-next]').click();
  assert.match(document.querySelector('[data-detail-image]').src, /two\.jpg/);
  document.querySelector('[data-detail-thumbnail="0"]').click();
  assert.match(document.querySelector('[data-detail-image]').alt, /1 из 2/);
  await renderProductPage(app, 999, () => {});
  assert.match(document.querySelector('.product-page__empty').textContent, /недоступны/);
});

test('price uses discounted unit kopecks on every quantity change', async () => {
  assert.match(formatProductTotal(199.99, 1), /199,99/);
  assert.match(formatProductTotal(199.99, 2), /399,98/);
  assert.match(formatProductTotal(199.99, 3), /599,97/);
  assert.match(formatProductTotal(199.99, 13), /2\s?599,87/);
  await renderProductPage(app, 9, () => {});
  await tick();
  const quantity = document.querySelector('[data-quantity]');
  const shown = () => document.querySelector('.product-page__price').textContent;
  assert.match(shown(), /85,49/);
  document.querySelector('[data-quantity-plus]').click();
  assert.match(shown(), /170,98/);
  document.querySelector('[data-quantity-minus]').click();
  assert.match(shown(), /85,49/);
  quantity.value = '3';
  quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.match(shown(), /256,47/);
});

test('description from an item response is escaped and retains line breaks', async () => {
  detailProduct = { ...product, description: 'Первая строка\nВторая <img src=x onerror=alert(1)>' };
  await renderProductPage(app, 9, () => {});
  assert.match(document.querySelector('.product-page__description').textContent, /Первая строка\nВторая <img/);
  assert.equal(document.querySelector('.product-page__description img'), null);
  detailProduct = null;
});

test('catalog fallback opens a product after storage is empty', async () => {
  sessionStorage.removeItem('vibe-product-9');
  await renderProductPage(app, 9, () => {});
  assert.match(document.querySelector('#product-title').textContent, /Speaker/);
});

test('catalog fallback follows real cursors to find an uncached product', async () => {
  sessionStorage.removeItem('vibe-product-9');
  catalogPages = [{ products: [{ ...product, id: 8, name: 'Other' }], nextCursor: 'next-page' },
    { products: [product], nextCursor: '' }];
  await renderProductPage(app, 9, () => {});
  assert.match(document.querySelector('#product-title').textContent, /Speaker/);
  assert.ok(requests.some((request) => request.path.includes('cursor=next-page')));
  catalogPages = null;
});

test('add to cart applies optimistically and debounces the request', async (t) => {
  basket = [];
  const destinations = [];
  renderProductPage(app, 9, (path) => destinations.push(path));
  await tick();
  const quantity = document.querySelector('[data-quantity]');
  quantity.value = '2';
  quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  let release;
  pendingPost = new Promise((resolve) => { release = resolve; });
  const before = requests.filter((request) => request.path.endsWith('/basket/products') && request.options.method === 'POST').length;
  document.querySelector('[data-detail-add]').click();
  document.querySelector('[data-detail-add]').click();
  assert.equal(document.querySelector('.site-header__cart-count').textContent, '2');
  t.mock.timers.tick(499);
  await tick();
  assert.deepEqual(destinations, []);
  assert.equal(requests.filter((request) => request.path.endsWith('/basket/products') && request.options.method === 'POST').length, before);
  t.mock.timers.tick(201);
  await tick();
  await tick();
  assert.equal(requests.filter((request) => request.path.endsWith('/basket/products') && request.options.method === 'POST').length, before + 1);
  release();
  pendingPost = null;
  await tick();
  assert.equal(basket[0].count, 2);
  assert.deepEqual(destinations, []);
});

test('PATCH 422 rolls back the optimistic quantity; retry recovers basket loading', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 2 }];
  patchFails = true;
  const destinations = [];
  await renderProductPage(app, 9, (path) => destinations.push(path));
  await tick();
  const quantity = document.querySelector('[data-quantity]');
  assert.equal(quantity.value, '2');
  quantity.value = '13';
  quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const before = requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length;
  document.querySelector('[data-detail-add]').click();
  assert.equal(quantity.value, '13');
  t.mock.timers.tick(501);
  await tick();
  assert.equal(basket[0].count, 2);
  assert.match(document.querySelector('[data-detail-message]').textContent, /наличии/);
  assert.equal(document.querySelector('[data-detail-add]').disabled, true);
  document.querySelector('[data-detail-add]').click();
  t.mock.timers.tick(500);
  await tick();
  assert.equal(requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length, before + 1);
  document.querySelector('[data-quantity-minus]').click();
  assert.equal(quantity.value, '12');
  assert.equal(document.querySelector('[data-detail-add]').disabled, false);
  assert.equal(document.querySelector('[data-quantity-plus]').disabled, true);
  assert.equal(document.querySelector('[data-detail-message]').textContent, '');
  assert.match(document.querySelector('.product-page__price').textContent, /1\s?025,88/);
  assert.deepEqual(destinations, []);
  patchFails = false;
  basketFails = true;
  await renderProductPage(app, 9, () => {});
  await tick();
  assert.equal(document.querySelector('[data-detail-retry]').hidden, false);
  basketFails = false;
  document.querySelector('[data-detail-retry]').click();
  await tick();
  assert.equal(document.querySelector('[data-detail-retry]').hidden, true);
});

test('pending PATCH cannot duplicate and badge waits for confirmed basket', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 2 }];
  const destinations = [];
  await renderProductPage(app, 9, (path) => destinations.push(path));
  await tick();
  assert.equal(document.querySelector('[data-quantity]').value, '2');
  document.querySelector('[data-quantity-plus]').click();
  let release;
  pendingPatch = new Promise((resolve) => { release = resolve; });
  const before = requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length;
  document.querySelector('[data-detail-add]').click();
  document.querySelector('[data-detail-add]').click();
  assert.equal(document.querySelector('[data-quantity]').value, '3');
  t.mock.timers.tick(500);
  await tick();
  assert.equal(requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length, before + 1);
  assert.equal(document.querySelector('.site-header__cart-count').textContent, '3');
  assert.deepEqual(destinations, []);
  release();
  pendingPatch = null;
  await tick();
  assert.equal(document.querySelector('.site-header__cart-count').textContent, '3');
  assert.deepEqual(destinations, []);
});

test('ordinary cart minus decrements the quantity with one debounced PATCH', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 3 }];
  await renderProductPage(app, 9, () => {});
  await tick();
  const before = requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length;
  document.querySelector('.cart-item__decrease').click();
  assert.equal(document.querySelector('.cart-item__quantity').value, '2');
  t.mock.timers.tick(499);
  await tick();
  assert.equal(requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length, before);
  t.mock.timers.tick(1);
  await tick();
  await tick();
  const patches = requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH');
  assert.equal(patches.length, before + 1);
  assert.deepEqual(JSON.parse(patches.at(-1).options.body), { count: 2 });
  assert.equal(basket[0].count, 2);
});

test('debounce resets when quantity changes before 500ms', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 2 }];
  await renderProductPage(app, 9, () => {});
  await tick();
  const quantity = document.querySelector('[data-quantity]');
  quantity.value = '3';
  quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.querySelector('[data-detail-add]').click();
  t.mock.timers.tick(299);
  quantity.value = '4';
  quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.querySelector('[data-detail-add]').click();
  const before = requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length;
  t.mock.timers.tick(1);
  await tick();
  assert.equal(requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH').length, before);
  t.mock.timers.tick(500);
  await tick();
  await tick();
  await tick();
  const patches = requests.filter((request) => request.path.endsWith('/basket/products/9') && request.options.method === 'PATCH');
  assert.equal(patches.length, before + 1);
  assert.deepEqual(JSON.parse(patches.at(-1).options.body), { count: 4 });
});

test('is_valid refreshes every 5 seconds and stops when the page is removed', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 1 }];
  validityUnavailable = [9];
  await renderProductPage(app, 9, () => {});
  await tick();
  const validityRequests = () => requests.filter((request) => request.path.endsWith('/basket/is_valid'));
  assert.equal(validityRequests().length, 1);
  assert.equal(document.querySelector('#cart-panel').hidden, true);
  assert.equal(document.querySelector('.site-header__cart-count').textContent, '!');
  assert.equal(document.querySelector('[data-detail-add]').disabled, true);
  assert.match(document.querySelector('[data-detail-message]').textContent, /наличии/);

  const indicator = document.querySelector('.site-header__cart-count');
  indicator.classList.remove('site-header__cart-count--shake');
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(validityRequests().length, 2);
  assert.equal(indicator.classList.contains('site-header__cart-count--shake'), true);

  validityUnavailable = [];
  t.mock.timers.tick(4999);
  await tick();
  assert.equal(validityRequests().length, 2);
  t.mock.timers.tick(1);
  await tick();
  assert.equal(validityRequests().length, 3);
  assert.equal(document.querySelector('.site-header__cart-count').textContent, '1');
  assert.equal(document.querySelector('[data-detail-add]').disabled, true);

  app.replaceChildren();
  const before = validityRequests().length;
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(validityRequests().length, before);
});

for (const availableCount of [0, 2]) {
  test(`is_valid keeps the basket count unchanged at ${availableCount} until minus is pressed`, async (t) => {
    basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
      price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 3 }];
    validityUnavailable = [{ id: 9, newAvailableCount: availableCount }];
    await renderProductPage(app, 9, () => {});
    await tick();
    const mutations = () => requests.filter(({ path, options }) => path.includes('/basket/products') && options.method !== 'GET');
    assert.equal(document.querySelectorAll('.cart-item').length, 1);
    assert.equal(document.querySelector('.cart-item__quantity').value, '3');
    assert.equal(basket[0].count, 3);
    t.mock.timers.tick(499);
    await tick();
    assert.equal(mutations().length, 0);
    document.querySelector('.cart-item__decrease').click();
    assert.equal(document.querySelector('.cart-item__quantity')?.value ?? '0', String(availableCount));
    assert.equal(basket[0].count, 3);
    t.mock.timers.tick(499);
    await tick();
    assert.equal(mutations().length, 0);
    t.mock.timers.tick(1);
    await tick();
    await tick();
    assert.deepEqual(mutations().map(({ path, options }) => ({ path, method: options.method, body: JSON.parse(options.body) })),
      [{ path: '/api/v1/buyers/42/basket/products/9', method: 'PATCH', body: { count: availableCount } }]);
    assert.equal(basket[0]?.count ?? 0, availableCount);
    t.mock.timers.tick(10000);
    await tick();
    assert.equal(mutations().length, 1);
  });
}

test('catalog shows the same availability warning as the basket', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 3 }];
  validityUnavailable = [{ id: 9, newAvailableCount: 2 }];
  renderCatalogPage(app);
  await tick();
  const warning = () => document.querySelector('.product-card__stock-warning').textContent;
  assert.equal(document.querySelector('.product-card__quantity').value, '3');
  assert.match(warning(), /допустимое количество: 2/);
  validityUnavailable = [9];
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(warning(), 'Товара в наличии больше нет');
  validityUnavailable = [];
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(warning(), '');
});

test('catalog warns only after an attempt to exceed available stock', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 1 }];
  catalogPages = [{ products: [{ ...product, availableCount: 2 }], nextCursor: '' }];
  try {
    renderCatalogPage(app);
    await tick();
    const warning = () => document.querySelector('.product-card__stock-warning').textContent;
    const quantity = () => document.querySelector('.product-card__quantity').value;
    document.querySelector('.product-card__increase').click();
    assert.equal(quantity(), '2');
    assert.equal(warning(), '');
    const requestsBefore = requests.length;
    document.querySelector('.product-card__increase').click();
    assert.equal(quantity(), '2');
    assert.equal(warning(), 'В наличии больше нет');
    assert.equal(requests.length, requestsBefore);
    t.mock.timers.tick(3999);
    await tick();
    assert.equal(warning(), 'В наличии больше нет');
    document.querySelector('.product-card__increase').click();
    t.mock.timers.tick(3999);
    await tick();
    assert.equal(warning(), 'В наличии больше нет');
    t.mock.timers.tick(1);
    await tick();
    assert.equal(warning(), '');
    document.querySelector('.product-card__decrease').click();
    assert.equal(quantity(), '1');
    assert.equal(warning(), '');
  } finally {
    catalogPages = null;
  }
});

test('updated availability becomes the limit after reducing the basket quantity', async (t) => {
  basket = [{ id: 9, category: '', name: product.name, pictureUrl: product.pictureUrls[0],
    price: product.priceResult, discount: 0, priceResult: product.priceResult, count: 3 }];
  catalogPages = [{ products: [{ ...product, availableCount: 5 }], nextCursor: '' }];
  validityUnavailable = [{ id: 9, newAvailableCount: 2 }];
  try {
    renderCatalogPage(app);
    await tick();
    assert.equal(document.querySelector('.product-card__quantity').value, '3');
    assert.match(document.querySelector('.product-card__stock-warning').textContent, /допустимое количество: 2/);
    assert.equal(document.querySelector('.product-card__increase').disabled, false);
    document.querySelector('.product-card__decrease').click();
    assert.equal(document.querySelector('.product-card__quantity').value, '2');
    t.mock.timers.tick(500);
    await tick();
    await tick();
    assert.equal(basket[0].count, 2);
    document.querySelector('.product-card__increase').click();
    assert.equal(document.querySelector('.product-card__quantity').value, '2');
    assert.equal(document.querySelector('.product-card__stock-warning').textContent, 'В наличии больше нет');
    validityUnavailable = [];
    t.mock.timers.tick(5000);
    await tick();
    const patchesBefore = requests.filter(({ options }) => options.method === 'PATCH').length;
    document.querySelector('.product-card__increase').click();
    assert.equal(document.querySelector('.product-card__quantity').value, '2');
    assert.equal(document.querySelector('.product-card__stock-warning').textContent, 'В наличии больше нет');
    t.mock.timers.tick(500);
    await tick();
    assert.equal(requests.filter(({ options }) => options.method === 'PATCH').length, patchesBefore);
  } finally {
    catalogPages = null;
  }
});

test('cart and order product links keep controls separate', () => {
  const cart = document.createElement('div');
  cart.innerHTML = cartItemsTemplate({ items: [{ id: 9, title: 'Speaker', image: '/one.jpg', price: '85,49 ₽', quantity: 2 }], canUseCart: true });
  assert.equal(cart.querySelectorAll('a[href="/products/9/speaker"][data-product-link]').length, 2);
  assert.equal(cart.querySelector('a button'), null);
  const orders = document.createElement('div');
  orders.innerHTML = ordersListTemplate({ orders: [{ id: 1, products: [{ productId: 9, name: 'Speaker', pictures: ['/one.jpg'] }] }] });
  assert.equal(orders.querySelectorAll('a[href="/products/9/speaker"][data-product-link]').length, 2);
});

test('profile email distinguishes Cyrillic in both parts', () => {
  assert.equal(getProfileEmailError('имя@example.com', true), 'Используйте латинские буквы в адресе почты');
  assert.equal(getProfileEmailError('name@пример.рф', true), 'Используйте латинские буквы в адресе почты');
  assert.equal(getProfileEmailError('name@example.com', false), '');
  assert.equal(getProfileEmailError('broken', true), 'Введите корректный email');
});
