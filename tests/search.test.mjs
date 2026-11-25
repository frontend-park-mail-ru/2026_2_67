import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:8081/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement',
  'Element', 'Node', 'localStorage', 'sessionStorage']) globalThis[key] = dom.window[key];
globalThis.Handlebars = Handlebars;
const { initSearch } = await import('../public/js/components/search/search.ts');
const { getCategories } = await import('../public/js/components/categories/categories.ts');
const { loadTemplates } = await import('../public/js/templates/templates.ts');
const { renderCatalogPage } = await import('../public/js/pages/catalog/catalog.ts');
const header = Handlebars.compile(readFileSync(new URL('../public/js/templates/site-header.hbs', import.meta.url), 'utf8'));
const app = document.querySelector('#app');
const close = initSearch(app);
const tick = () => new Promise((resolve) => setImmediate(resolve));
let requests;
let productResponse;
let categoriesFail = true;
let categoryRequests = 0;
globalThis.fetch = async (url, options = {}) => {
  const path = String(url);
  if (path.startsWith('file:')) return new Response(readFileSync(new URL(path), 'utf8'));
  requests.push({ path, options });
  if (path === '/api/v1/categories/') {
    categoryRequests += 1;
    if (categoriesFail) return new Response(null, { status: 503 });
    return Response.json({ categories: ['Телефоны', 'Телевизоры', 'Телеаксессуары', 'Телекамеры']
      .map((category) => ({ category, pictureUrl: '' })) });
  }
  return productResponse(path);
};
await loadTemplates();

test.beforeEach(() => {
  close();
  window.history.replaceState({}, '', '/');
  app.innerHTML = header({});
  requests = [];
  productResponse = () => Response.json({ products: [] });
});

function input(value) {
  const field = app.querySelector('input[name="query"]');
  field.value = value;
  field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  return field;
}

test('debounce, minimum length, errors and retry with cached categories', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  input('т');
  t.mock.timers.tick(400);
  assert.equal(requests.length, 0);
  productResponse = () => new Response(null, { status: 503 });
  input('те');
  t.mock.timers.tick(399);
  assert.equal(requests.length, 0);
  input('тел');
  t.mock.timers.tick(400);
  await tick();
  assert.match(app.textContent, /Не удалось загрузить товары/);
  assert.match(app.textContent, /Не удалось загрузить категории/);
  assert.equal(requests[0].path, '/api/v1/products?query=%D1%82%D0%B5%D0%BB&limit=5');
  assert.equal(requests[0].options.credentials, 'include');
  categoriesFail = false;
  productResponse = () => Response.json({ products: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: '<img src=x>' })) });
  input('теле');
  t.mock.timers.tick(400);
  await tick();
  assert.equal(app.querySelectorAll('[data-product-link]').length, 5);
  assert.equal(app.querySelectorAll('[data-category]').length, 3);
  assert.equal(app.querySelector('[data-product-link]').textContent, '<img src=x>');
  assert.equal(app.querySelector('.site-header__suggestions img'), null);
  assert.equal(app.querySelector('[data-product-link]').getAttribute('href'), '/products/1/img-src-x');
  assert.equal(app.querySelector('[data-category]').dataset.category, 'Телефоны');
  await getCategories();
  await getCategories();
  assert.equal(categoryRequests, 2);
});

test('late responses cannot replace a newer query or reopen a dismissed panel', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveOld;
  productResponse = () => new Promise((resolve) => { resolveOld = resolve; });
  input('старый');
  t.mock.timers.tick(400);
  await tick();
  productResponse = () => Response.json({ products: [{ id: 9, name: 'Новый' }] });
  const field = input('новый');
  assert.equal(requests[0].options.signal.aborted, true);
  t.mock.timers.tick(400);
  await tick();
  resolveOld(Response.json({ products: [{ id: 1, name: 'Старый' }] }));
  await tick();
  assert.equal(app.querySelector('[data-product-link]').textContent, 'Новый');
  assert.equal(app.querySelector('[aria-labelledby="search-categories-title"]').hidden, true);
  field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.querySelector('.site-header__suggestions').hidden, true);
  input('ещё');
  document.body.click();
  t.mock.timers.tick(400);
  assert.equal(app.querySelector('.site-header__suggestions').hidden, true);
  input('');
  assert.equal(app.querySelector('.site-header__suggestions').hidden, true);
});

test('empty results and late response after Escape', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  input('нет');
  t.mock.timers.tick(400);
  await tick();
  assert.match(app.textContent, /Товары не найдены/);
  let resolvePending;
  productResponse = () => new Promise((resolve) => { resolvePending = resolve; });
  const field = input('запрос');
  t.mock.timers.tick(400);
  field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  resolvePending(Response.json({ products: [{ id: 1, name: 'Поздний' }] }));
  await tick();
  assert.equal(app.querySelector('.site-header__suggestions').hidden, true);
  assert.equal(app.querySelector('[data-product-link]'), null);
});

test('pending search hides empty sections and categories can appear before products', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  categoriesFail = false;
  let resolveProducts;
  productResponse = () => new Promise((resolve) => { resolveProducts = resolve; });
  input('тел');
  const panel = app.querySelector('.site-header__suggestions');
  assert.equal(panel.hidden, true);
  assert.doesNotMatch(panel.textContent, /Загрузка товаров|Загрузка категорий/);
  t.mock.timers.tick(400);
  await tick();
  assert.equal(panel.hidden, false);
  assert.equal(app.querySelector('[aria-labelledby="search-products-title"]').hidden, true);
  assert.equal(app.querySelector('[aria-labelledby="search-categories-title"]').hidden, false);
  resolveProducts(Response.json({ products: [] }));
  await tick();
  assert.match(panel.textContent, /Товары не найдены/);
});

test('suggestions highlight text and keyboard navigation works across independent sections', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  categoriesFail = false;
  productResponse = () => Response.json({ products: [{ id: 9, name: 'Телефон' }] });
  const field = input('тел');
  field.focus();
  t.mock.timers.tick(400);
  await tick();
  const product = app.querySelector('[data-product-link]');
  const category = app.querySelector('[data-category]');
  assert.equal(product.querySelector('mark').textContent, 'Тел');
  assert.equal(category.querySelector('mark').textContent, 'Тел');
  field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, product);
  product.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, category);
  category.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, product);
  product.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, field);
});

test('catalog sends query with category, cursor and retry, without local filtering', async () => {
  window.history.replaceState({}, '', '/?query=телефон&category=Электроника');
  const product = { id: 9, name: 'Смартфон', pictureUrls: [], priceResult: 100, rating: 0, reviewsCount: 0 };
  productResponse = () => Response.json({ products: [product], nextCursor: 'next' });
  renderCatalogPage(app);
  await tick();
  assert.equal(app.querySelectorAll('[data-product-card]').length, 1);
  app.querySelector('.catalog-page__load-more').click();
  await tick();
  const params = new URL(requests.at(-1).path, window.location.origin).searchParams;
  assert.equal(params.get('query'), 'телефон');
  assert.equal(params.get('category'), 'Электроника');
  assert.equal(params.get('cursor'), 'next');
  productResponse = () => new Response(null, { status: 503 });
  renderCatalogPage(app);
  await tick();
  productResponse = () => Response.json({ products: [], nextCursor: '' });
  app.querySelector('[data-retry-products]').click();
  await tick();
  assert.equal(new URL(requests.at(-1).path, window.location.origin).searchParams.get('query'), 'телефон');
  assert.match(app.querySelector('.catalog-page__grid').textContent, /По вашему запросу ничего не найдено/);
});

test('focus stays within suggestions, Escape preserves input, and a replaced header works', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  productResponse = () => Response.json({ products: [{ id: 9, name: 'Телефон' }] });
  const field = input('тел');
  field.focus();
  t.mock.timers.tick(400);
  await tick();
  const link = app.querySelector('[data-product-link]');
  link.focus();
  assert.equal(app.querySelector('.site-header__suggestions').hidden, false);
  const escape = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  link.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(field.value, 'тел');
  assert.equal(document.activeElement, field);
  assert.equal(app.querySelector('.site-header__suggestions').hidden, true);
  input('старый');
  app.innerHTML = header({});
  const replacement = app.querySelector('input');
  replacement.value = 'новый';
  replacement.focus();
  t.mock.timers.tick(400);
  await tick();
  assert.equal(app.querySelector('.site-header__suggestions').hidden, false);
  assert.equal(new URL(requests.at(-1).path, window.location.origin).searchParams.get('query'), 'новый');
  app.querySelector('[data-catalog-toggle]').focus();
  assert.equal(app.querySelector('.site-header__suggestions').hidden, true);
});
