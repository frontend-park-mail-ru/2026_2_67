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

const templateSource = await readFile(new URL('../public/js/templates/product-card.hbs', import.meta.url), 'utf8');
const templateUrl = moduleUrl('export const productCardTemplate = (values) => globalThis.productCardTestTemplate(values);');
const componentSource = new URL('../public/js/components/product-card/product-card.ts', import.meta.url);
const transformed = await transformFileAsync(fileURLToPath(componentSource), { presets: ['@babel/preset-typescript'] });
const { createProductCard, initProductCard } = await import(moduleUrl(transformed.code.replace('../../templates/templates.js', templateUrl)));

test('product cards display one or multiple images and navigate independently', (t) => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost/' });
  const saved = new Map();
  for (const key of ['HTMLImageElement', 'HTMLButtonElement', 'productCardTestTemplate']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  globalThis.HTMLImageElement = dom.window.HTMLImageElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.productCardTestTemplate = Handlebars.compile(templateSource);
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });

  const product = { id: 7, title: 'Товар', images: ['/one.jpg'], price: '100 ₽', rating: 4, reviewsCount: 2 };
  const multiple = { ...product, id: 8, images: ['/one.jpg', '/two.jpg', '/three.jpg'] };
  const main = dom.window.document.querySelector('main');
  main.innerHTML = createProductCard(product, false) + createProductCard(multiple, true, 2);
  const [singleCard, multiCard] = main.querySelectorAll('[data-product-card]');
  initProductCard(singleCard, product);
  initProductCard(multiCard, multiple);
  assert.equal(singleCard.querySelector('[data-product-image]').getAttribute('src'), '/one.jpg');
  assert.equal(singleCard.querySelector('[data-image-prev]'), null);
  assert.equal(singleCard.querySelectorAll('[data-image-dot]').length, 0);
  assert.equal(multiCard.querySelector('.product-card__quantity').textContent, '2');

  const image = multiCard.querySelector('[data-product-image]');
  const dots = [...multiCard.querySelectorAll('[data-image-dot]')];
  const active = () => dots.map((dot) => dot.classList.contains('product-card__dot--active'));
  assert.deepEqual(active(), [true, false, false]);
  multiCard.querySelector('[data-image-next]').click();
  assert.equal(image.getAttribute('src'), '/two.jpg');
  assert.deepEqual(active(), [false, true, false]);
  multiCard.querySelector('[data-image-prev]').click();
  assert.equal(image.getAttribute('src'), '/one.jpg');
  multiCard.querySelector('[data-image-prev]').click();
  assert.equal(image.getAttribute('src'), '/three.jpg');
  assert.deepEqual(active(), [false, false, true]);
  multiCard.querySelector('[data-image-next]').click();
  assert.equal(image.getAttribute('src'), '/one.jpg');
  dots[1].click();
  assert.equal(image.getAttribute('src'), '/two.jpg');
  assert.deepEqual(active(), [false, true, false]);
  assert.equal(singleCard.querySelector('[data-product-image]').getAttribute('src'), '/one.jpg');

  assert.throws(() => initProductCard(dom.window.document.createElement('article'), multiple), /Элементы галереи товара не найдены/);
});
