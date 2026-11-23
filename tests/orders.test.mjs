import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:8081/orders' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'HTMLAnchorElement',
  'HTMLInputElement', 'HTMLSelectElement', 'HTMLFormElement', 'HTMLDetailsElement', 'Element', 'Node', 'localStorage', 'sessionStorage']) {
  globalThis[key] = dom.window[key];
}
globalThis.Handlebars = Handlebars;
globalThis.atob = dom.window.atob;

const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.x`;
// Orders requests are tested independently from the cart's background polling.
localStorage.removeItem('accessToken');
localStorage.removeItem('userId');

const app = document.querySelector('#app');
const requests = [];
let responseForRequest;
let observerInstance;

class TestIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.target = null;
    observerInstance = this;
  }

  observe(target) {
    this.target = target;
  }

  unobserve() {
    this.target = null;
  }

  disconnect() {
    this.target = null;
  }

  trigger() {
    this.callback([{ isIntersecting: true, target: this.target }]);
  }
}

globalThis.IntersectionObserver = TestIntersectionObserver;
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.startsWith('file:')) return new Response(readFileSync(new URL(path), 'utf8'));
  requests.push({ path, options });
  if (path.endsWith('/basket')) return Response.json({ basketProducts: [], basketSum: 0, basketSumResult: 0 });
  if (path.includes('/basket/is_valid')) return Response.json({ products: [], isInvalid: false });
  if (path.includes('/orders')) return responseForRequest(new URL(path, window.location.origin));
  throw new Error(`Unexpected request: ${path}`);
};

const { loadTemplates } = await import('../public/js/templates/templates.ts');
const { renderOrdersPage } = await import('../public/js/pages/orders/orders.ts');
await loadTemplates();

const tick = () => new Promise((resolve) => setImmediate(resolve));
const requestUrls = () => requests.filter(({ path }) => path.includes('/orders')).map(({ path }) => new URL(path, window.location.origin));
const order = (id, status = 'Доставлен') => ({
  id,
  status,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-21T10:00:00.000Z',
  pickupPoint: { id: 7, longitude: 37.6, latitude: 55.75, startTime: '09:00', endTime: '21:00' },
  promocode: '',
  products: [{ id: id + 100, name: `Товар ${id}`, description: '', category: 'Техника', sellerName: 'Продавец',
    sellerAvatarUrl: '', pictureUrls: [], count: 1, unitPrice: 100, totalPrice: 100 }],
  totalCount: 1,
  totalPrice: 100,
});

function buttonWithText(pattern) {
  return [...app.querySelectorAll('button')].find((button) => pattern.test(button.textContent));
}

test.beforeEach(() => {
  app.replaceChildren();
  requests.length = 0;
  observerInstance = null;
  responseForRequest = () => Response.json({ orders: [order(1)], nextCursor: '' });
});

test.afterEach(() => {
  app.replaceChildren();
});

test('loads orders with the default sort and limit and renders the API ids', async () => {
  await renderOrdersPage(app);
  const url = requestUrls()[0];

  assert.equal(url.pathname, '/api/v1/orders');
  assert.equal(url.searchParams.get('sortBy'), 'desc-date');
  assert.equal(url.searchParams.has('limit'), false);
  assert.match(app.textContent, /Заказ №1/);
  assert.match(app.textContent, /Товар 1/);
  assert.equal(app.querySelectorAll('.orders-page__order').length, 1);
});

test('loads the next cursor through IntersectionObserver and appends orders', async () => {
  let page = 0;
  responseForRequest = () => page++ === 0
    ? Response.json({ orders: [order(1)], nextCursor: 'cursor-2' })
    : Response.json({ orders: [order(2, 'В пути')], nextCursor: '' });

  await renderOrdersPage(app);
  assert.ok(observerInstance);
  observerInstance.trigger();
  await tick();

  const urls = requestUrls();
  assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get('cursor'), 'cursor-2');
  assert.equal(urls[1].searchParams.has('limit'), false);
  assert.equal(app.querySelectorAll('.orders-page__order').length, 2);
  assert.match(app.textContent, /Заказ №2/);
});

test('filters use named selects and reset the list and cursor', async () => {
  let page = 0;
  responseForRequest = (url) => {
    page += 1;
    if (page === 1) return Response.json({ orders: [order(1)], nextCursor: 'old-cursor' });
    return Response.json({ orders: [order(3, 'Новый')], nextCursor: 'filtered-cursor' });
  };

  await renderOrdersPage(app);
  const status = app.querySelector('input[name="status"]');
  const sortBy = app.querySelector('input[name="sortBy"]');
  assert.ok(status instanceof HTMLInputElement);
  assert.ok(sortBy instanceof HTMLInputElement);

  app.querySelector('[data-status="Обрабатывается"]').click();
  await tick();

  const urls = requestUrls();
  assert.equal(urls[1].searchParams.get('status'), status.value);
  assert.equal(urls[1].searchParams.get('sortBy'), sortBy.value || 'desc-date');
  assert.equal(urls[1].searchParams.has('cursor'), false);
  assert.equal(app.querySelector('.orders-page__order').getAttribute('aria-labelledby'), 'order-3');

  app.querySelector('[data-sort-by="asc-date"]').click();
  await tick();
  const lastUrl = requestUrls().at(-1);
  assert.equal(lastUrl.searchParams.get('sortBy'), sortBy.value);
  assert.equal(lastUrl.searchParams.has('cursor'), false);
});

test('shows retry after an error and retries the request', async () => {
  let failed = true;
  responseForRequest = () => failed ? new Response(null, { status: 503 }) : Response.json({ orders: [order(4)], nextCursor: '' });

  await renderOrdersPage(app);
  assert.match(app.textContent, /Не удалось загрузить заказы/);
  const retry = buttonWithText(/Попробовать снова|Повторить|Загрузить/);
  assert.ok(retry);
  failed = false;
  retry.click();
  await tick();
  assert.equal(requestUrls().length, 2);
  assert.match(app.textContent, /Заказ №4/);
});

test('provides a load-more button when a cursor is available', async () => {
  responseForRequest = () => Response.json({ orders: [order(1)], nextCursor: 'manual-cursor' });
  await renderOrdersPage(app);
  const loadMore = buttonWithText(/Загрузить|Показать ещё|Ещё/);
  assert.ok(loadMore);
  responseForRequest = () => Response.json({ orders: [order(5)], nextCursor: '' });
  loadMore.click();
  await tick();
  assert.equal(requestUrls().at(-1).searchParams.get('cursor'), 'manual-cursor');
  assert.match(app.textContent, /Заказ №5/);
});

test('ignores a stale page when filters change during loading', async () => {
  let resolveOld;
  responseForRequest = (url) => url.searchParams.has('status')
    ? Response.json({ orders: [order(8)], nextCursor: '' })
    : new Promise((resolve) => { resolveOld = resolve; });
  const initial = renderOrdersPage(app);
  await tick();
  app.querySelector('[data-status="В пути"]').click();
  await tick();
  resolveOld(Response.json({ orders: [order(1)], nextCursor: 'old' }));
  await initial;
  assert.match(app.textContent, /Заказ №8/);
  assert.doesNotMatch(app.textContent, /Заказ №1/);
  assert.equal(app.querySelector('.orders-page__load-more').hidden, true);
});

test('preserves earlier orders and cursor when loading the next page fails', async () => {
  let calls = 0;
  responseForRequest = () => {
    calls += 1;
    if (calls === 1) return Response.json({ orders: [order(1)], nextCursor: 'cursor-2' });
    if (calls === 2) return new Response(null, { status: 503 });
    return Response.json({ orders: [order(2)], nextCursor: '' });
  };
  await renderOrdersPage(app);
  observerInstance.trigger();
  await tick();
  assert.match(app.textContent, /Заказ №1/);
  buttonWithText(/Попробовать снова/).click();
  await tick();
  assert.equal(requestUrls().at(-1).searchParams.get('cursor'), 'cursor-2');
  assert.equal(app.querySelectorAll('.orders-page__order').length, 2);
});
