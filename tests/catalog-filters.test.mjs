import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost:8081/catalog?category=Books' });
for (const name of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement',
  'Element', 'Node', 'localStorage', 'sessionStorage']) globalThis[name] = dom.window[name];
globalThis.Handlebars = Handlebars;
const { productUrl } = await import('../public/js/shared/product-url.ts');
Handlebars.registerHelper('productUrl', productUrl);
const { loadTemplates } = await import('../public/js/templates/templates.ts');
const { renderCatalogPage } = await import('../public/js/pages/catalog/catalog.ts');
const app = document.querySelector('#app');
const requests = [];
const product = { id: 1, name: 'Book', pictureUrls: ['/book.png'], price: 1000, discount: 20,
  priceResult: 800, rating: 5, reviewsCount: 1 };
let productMax = 1980;
globalThis.fetch = async (url) => {
  const path = String(url);
  if (path.startsWith('file:')) return new Response(readFileSync(new URL(path), 'utf8'));
  requests.push(path);
  if (path.startsWith('/api/v1/sellers')) return Response.json({ sellers: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, name: `Seller ${i + 1}` })) });
  return Response.json({ products: [product], nextCursor: '',
    priceResultMax: path.includes('priceMin=') ? 900 : productMax });
};
await loadTemplates();
const tick = () => new Promise((resolve) => setImmediate(resolve));
test.beforeEach(() => { window.history.replaceState({}, '', '/?category=Books'); productMax = 1980; });

test('home catalog has no filters or category sorting', async () => {
  window.history.replaceState({}, '', '/?priceMin=100000&priceMax=200000');
  renderCatalogPage(app);
  await tick();
  assert.equal(app.querySelector('[data-catalog-filters]'), null);
  assert.equal(app.querySelector('.catalog-page__sort'), null);
  assert.equal(app.querySelectorAll('.product-card').length, 1);
  assert.equal(new URL(requests.at(-1), 'http://localhost').searchParams.has('priceMin'), false);
});

test('catalog filters send cents, retain selections when collapsed, and reset', async () => {
  renderCatalogPage(app);
  await tick();
  const form = app.querySelector('[data-catalog-filters]');
  assert.equal(app.querySelector('[data-price-max-range]').max, '2000');
  assert.equal(app.querySelectorAll('[data-sellers] label:not([hidden])').length, 8);
  app.querySelector('[data-seller-toggle]').click();
  assert.equal(app.querySelectorAll('[data-sellers] label:not([hidden])').length, 9);
  const last = app.querySelectorAll('[data-sellers] input')[8];
  last.checked = true;
  app.querySelector('[data-seller-toggle]').click();
  assert.equal(last.checked, true);
  form.elements.namedItem('priceMin').value = '20';
  form.elements.namedItem('priceMin').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(app.querySelector('[data-price-min-range]').value, '20');
  app.querySelector('[data-price-min-range]').value = '20';
  app.querySelector('[data-price-min-range]').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(form.elements.namedItem('priceMin').value, '20');
  form.elements.namedItem('priceMin').value = '20';
  form.elements.namedItem('priceMax').value = '900';
  const layout = app.querySelector('.catalog-page__layout');
  const header = app.querySelector('.site-header');
  const card = app.querySelector('.product-card');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(app.querySelector('.product-card'), card);
  assert.equal(app.querySelector('.catalog-page__layout'), layout);
  assert.equal(app.querySelector('.site-header'), header);
  await tick();
  const filtered = new URL(requests.at(-1), 'http://localhost');
  assert.equal(filtered.searchParams.get('priceMin'), '2000');
  assert.equal(filtered.searchParams.get('priceMax'), '90000');
  assert.equal(filtered.searchParams.get('seller'), 'Seller 9');
  assert.equal(app.querySelector('[data-price-max-range]').max, '2000');
  assert.match(app.querySelector('[data-product-count]').textContent, /Показано 1 товар/);
  assert.match(window.location.search, /priceMin=2000/);
  assert.ok(app.querySelector('.catalog-page__sort'));
  form.reset();
  assert.equal(app.querySelector('.catalog-page__layout'), layout);
  assert.equal(app.querySelector('.site-header'), header);
  await tick();
  assert.equal(new URL(requests.at(-1), 'http://localhost').searchParams.has('priceMin'), false);
  assert.equal(new URL(window.location.href).searchParams.get('category'), 'Books');
  assert.equal(new URL(window.location.href).searchParams.has('priceMin'), false);
  assert.equal(app.querySelector('[data-price-max-range]').max, '2000');
  assert.equal(last.checked, false);
});

test('invalid prices stay in the form and never reach the API', async () => {
  renderCatalogPage(app);
  await tick();
  const form = app.querySelector('[data-catalog-filters]');
  const before = requests.length;
  form.elements.namedItem('priceMin').value = '18930';
  form.elements.namedItem('priceMin').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  form.elements.namedItem('priceMax').value = '1980';
  form.elements.namedItem('priceMax').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(app.querySelector('[data-price-error]').textContent, /не может превышать/);
  assert.equal(requests.length, before);
  assert.equal(form.elements.namedItem('priceMin').value, '18930');
  assert.ok(Number(app.querySelector('[data-price-min-range]').value) <= Number(app.querySelector('[data-price-max-range]').value));
});

test('category change recalculates the unfiltered price scale', async () => {
  renderCatalogPage(app);
  await tick();
  assert.equal(app.querySelector('[data-price-max-range]').max, '2000');
  productMax = 279999;
  window.history.replaceState({}, '', '/?category=Furniture');
  renderCatalogPage(app);
  await tick();
  assert.equal(app.querySelector('[data-price-max-range]').max, '280000');
});

test('search without category keeps filters, sorting, query and unfiltered bounds', async () => {
  requests.length = 0;
  window.history.replaceState({}, '', '/?query=Book&priceMin=2000&seller=Seller+9');
  renderCatalogPage(app);
  await tick();
  const form = app.querySelector('[data-catalog-filters]');
  assert.ok(form);
  assert.ok(app.querySelector('.catalog-page__layout--category'));
  assert.equal(form.elements.namedItem('priceMin').value, '20');
  assert.equal(app.querySelector('[data-price-max-range]').max, '2000');
  assert.equal(form.querySelectorAll('input[type="range"]').length, 2);
  assert.equal(form.querySelector('input[value="Seller 9"]').checked, true);
  const paths = requests.map((path) => new URL(path, 'http://localhost'));
  for (const url of paths) {
    assert.equal(url.searchParams.get('query'), 'Book');
    assert.equal(url.searchParams.has('category'), false);
  }
  assert.ok(paths.some((url) => url.pathname.endsWith('/sellers')));
  assert.ok(paths.some((url) => url.pathname.endsWith('/products') && url.searchParams.get('limit') === '1'
    && !url.searchParams.has('priceMin') && !url.searchParams.has('seller')));
  app.querySelector('[data-sort-by="asc-price"]').click();
  await tick();
  assert.equal(new URL(requests.at(-1), 'http://localhost').searchParams.get('sortBy'), 'asc-price');
  assert.equal(new URL(window.location.href).searchParams.get('sortBy'), 'asc-price');
  form.reset();
  await tick();
  const reset = new URL(requests.at(-1), 'http://localhost');
  assert.equal(reset.searchParams.get('query'), 'Book');
  assert.equal(reset.searchParams.has('seller'), false);
  assert.equal(reset.searchParams.has('priceMin'), false);
  assert.equal(new URL(window.location.href).searchParams.get('query'), 'Book');
});

test('search inside category keeps category in product and seller requests', async () => {
  requests.length = 0;
  window.history.replaceState({}, '', '/?category=Books&query=Book');
  renderCatalogPage(app);
  await tick();
  assert.ok(app.querySelector('[data-catalog-filters]'));
  assert.ok(requests.filter((path) => path.includes('/products') || path.includes('/sellers'))
    .every((path) => new URL(path, 'http://localhost').searchParams.get('category') === 'Books'));
});

test('discount card uses backend prices and plain card has no sale markup', async () => {
  renderCatalogPage(app);
  await tick();
  assert.match(app.querySelector('.product-card__discount').textContent, /-20%/);
  assert.match(app.querySelector('.product-card__old-price').textContent, /1\s?000/);
  product.discount = 0;
  product.priceResult = 1000;
  renderCatalogPage(app);
  await tick();
  assert.equal(app.querySelector('.product-card__discount'), null);
  assert.equal(app.querySelector('.product-card__old-price'), null);
});
