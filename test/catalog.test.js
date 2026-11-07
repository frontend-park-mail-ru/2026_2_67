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

const catalogTemplate = Handlebars.compile(await readFile(new URL('../public/js/templates/catalog.hbs', import.meta.url), 'utf8'));
const productTemplate = Handlebars.compile(await readFile(new URL('../public/js/templates/product-card.hbs', import.meta.url), 'utf8'));
Handlebars.registerPartial('siteHeader', '<form data-catalog-search><input name="query"></form>');
Handlebars.registerPartial('siteFooter', '');
const templatesUrl = moduleUrl('export const catalogTemplate = (...args) => globalThis.catalogTest.catalogTemplate(...args); export const productCardTemplate = (...args) => globalThis.catalogTest.productTemplate(...args);');
const mapperUrl = moduleUrl(await transform('../public/js/data/map-api-product.ts'));
const productCode = (await transform('../public/js/components/product-card/product-card.ts')).replace('../../templates/templates.js', templatesUrl);
const productUrl = moduleUrl(productCode);
const cartUrl = moduleUrl('export const initCart = (page, userId, onChange) => { globalThis.catalogTest.onCartChange = onChange; return globalThis.catalogTest.cart; };');
const authUrl = moduleUrl('export const authorizedFetch = (...args) => globalThis.catalogTest.fetch(...args); export const getCurrentUser = () => ({ userId: "7", name: "User" }); export const loadCurrentUser = async () => null;');
const code = (await transform('../public/js/pages/catalog/catalog.ts'))
  .replace('../../components/product-card/product-card.js', productUrl)
  .replace('../../templates/templates.js', templatesUrl)
  .replace('../../data/map-api-product.js', mapperUrl)
  .replace('../../components/cart/cart.js', cartUrl)
  .replace('../../shared/auth.js', authUrl);
const { renderCatalogPage } = await import(moduleUrl(code));
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('catalog search, pagination, cart updates and retry', async (t) => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/?category=Audio' });
  const saved = new Map();
  for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLImageElement', 'catalogTest']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  for (const key of ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLImageElement']) {
    globalThis[key] = key === 'window' ? dom.window : dom.window[key];
  }
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });

  const product = (id, name, pictureUrls = ['/one.jpg']) => ({ id, name, pictureUrls, priceResult: 100, rating: 4, reviewsCount: 1 });
  const responses = [];
  const calls = [];
  let quantity = 0;
  globalThis.catalogTest = {
    catalogTemplate, productTemplate,
    cart: { getProductQuantity: () => quantity, canUseCart: () => true },
    fetch: async (path) => {
      calls.push(path);
      assert.ok(responses.length, `Unexpected request: ${path}`);
      return responses.shift();
    },
  };
  const app = dom.window.document.querySelector('#app');
  let finishFirst;
  responses.push(new Promise((resolve) => { finishFirst = resolve; }));
  renderCatalogPage(app);
  let grid = app.querySelector('.catalog-page__grid');
  const search = app.querySelector('input[name="query"]');
  const more = app.querySelector('.catalog-page__load-more');
  const moreWrap = app.querySelector('.catalog-page__load-more-wrap');
  assert.equal(grid.getAttribute('aria-busy'), 'true');
  assert.match(grid.textContent, /Загрузка товаров/);
  finishFirst(new Response(JSON.stringify({ products: [product(1, 'Наушники', ['/one.jpg', '/two.jpg'])], nextCursor: 'next page' })));
  await flush();
  assert.equal(calls[0], '/products?category=Audio');
  assert.equal(grid.getAttribute('aria-busy'), 'false');
  assert.equal(moreWrap.hidden, false);
  assert.match(grid.textContent, /Наушники/);
  grid.querySelector('[data-image-next]').click();
  assert.equal(grid.querySelector('[data-product-image]').getAttribute('src'), '/two.jpg');
  quantity = 2;
  globalThis.catalogTest.onCartChange(1);
  assert.equal(grid.querySelector('.product-card__quantity').textContent, '2');

  search.value = 'НАУШ';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(grid.querySelectorAll('[data-product-card]').length, 1);
  search.value = 'нет совпадения';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(grid.textContent, 'Среди загруженных товаров ничего не найдено.');
  search.value = '';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  responses.push(new Response('error', { status: 500 }));
  more.click();
  await flush();
  assert.equal(more.textContent, 'Не удалось загрузить. Повторить');
  assert.equal(more.disabled, false);
  assert.equal(grid.querySelectorAll('[data-product-card]').length, 1);

  let finishSecond;
  responses.push(new Promise((resolve) => { finishSecond = resolve; }));
  more.click();
  assert.equal(more.disabled, true);
  assert.equal(more.textContent, 'Загрузка…');
  finishSecond(new Response(JSON.stringify({ products: [product(2, 'Колонка')], nextCursor: '' })));
  await flush();
  assert.equal(calls[1], '/products?category=Audio&cursor=next+page');
  assert.equal(calls[2], '/products?category=Audio&cursor=next+page');
  assert.equal(more.disabled, false);
  assert.equal(moreWrap.hidden, true);
  assert.equal(grid.querySelectorAll('[data-product-card]').length, 2);

  responses.push(new Response('error', { status: 500 }));
  renderCatalogPage(app);
  grid = app.querySelector('.catalog-page__grid');
  await flush();
  assert.match(grid.textContent, /Не удалось загрузить товары/);
  responses.push(new Response(JSON.stringify({ products: [], nextCursor: '' })));
  grid.querySelector('[data-retry-products]').click();
  assert.equal(grid.getAttribute('aria-busy'), 'true');
  await flush();
  assert.equal(grid.textContent, 'В этой категории пока нет товаров.');
  assert.equal(grid.getAttribute('aria-busy'), 'false');
});
