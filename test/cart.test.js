import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';
import { JSDOM } from 'jsdom';

function moduleUrl(code) {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

async function transform(path) {
  const source = new URL(path, import.meta.url);
  return (await transformFileAsync(fileURLToPath(source), { presets: ['@babel/preset-typescript'] })).code;
}

const modelUrl = moduleUrl(await transform('../public/js/components/cart/cart-model.ts'));
const templateUrl = moduleUrl('export const cartTemplate = (data) => data.isGuest ? "guest" : "cart";');
const apiUrl = moduleUrl('export const getBasket = (...args) => globalThis.cartTestApi.getBasket(...args); export const addBasketProduct = (...args) => globalThis.cartTestApi.addBasketProduct(...args); export const setBasketProductCount = (...args) => globalThis.cartTestApi.setBasketProductCount(...args);');
const source = (await transform('../public/js/components/cart/cart.ts'))
  .replace('../../templates/templates.js', templateUrl)
  .replace('./cart-api.js', apiUrl)
  .replace('./cart-model.js', modelUrl);
const { initCart } = await import(moduleUrl(source));

test('cart handles guest and authenticated interactions', async (t) => {
  const dom = new JSDOM('<main><button class="site-header__icon--cart"></button><div id="cart-panel" hidden></div><div class="catalog-page__grid"><div data-product-id="5"><button class="product-card__add-to-cart">Add</button></div></div></main>');
  const previous = new Map();
  for (const name of ['Element', 'HTMLElement', 'HTMLButtonElement', 'Node', 'cartTestApi']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  for (const name of ['Element', 'HTMLElement', 'HTMLButtonElement', 'Node']) {
    globalThis[name] = dom.window[name];
  }
  t.after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  });

  const page = dom.window.document.querySelector('main');
  const button = page.querySelector('.site-header__icon--cart');
  const panel = page.querySelector('#cart-panel');
  const guest = initCart(page, undefined);
  button.click();
  assert.equal(panel.hidden, false);
  assert.equal(panel.textContent, 'guest');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(guest.getItems(), []);

  const authPage = page.cloneNode(true);
  dom.window.document.body.append(authPage);
  const authPanel = authPage.querySelector('#cart-panel');
  const requests = [];
  let count = 0;
  let failLoading = false;
  globalThis.cartTestApi = {
    async getBasket() {
      if (failLoading) throw new Error('network error');
      return { basketProducts: count ? [{ id: 5, name: 'Товар', pictureUrl: '/item.jpg', priceResult: 42.5, count }] : [], basketSumResult: count * 42.5 };
    },
    async addBasketProduct(userId, productId) { requests.push(['add', userId, productId]); count = 1; },
    async setBasketProductCount(userId, productId, nextCount) { requests.push(['set', userId, productId, nextCount]); count = nextCount; },
  };
  let notify;
  let updated = new Promise((resolve) => { notify = resolve; });
  const cart = initCart(authPage, '7', (id) => notify(id));
  assert.equal(await updated, null);
  assert.equal(cart.canCheckout(), false);
  updated = new Promise((resolve) => { notify = resolve; });
  authPage.querySelector('.product-card__add-to-cart').click();
  assert.equal(await updated, 5);
  assert.deepEqual(requests, [['add', '7', 5]]);
  assert.equal(cart.getProductQuantity(5), 1);
  assert.equal(cart.getDisplayTotal(), '42,5 ₽');
  assert.equal(cart.canCheckout(), true);
  updated = new Promise((resolve) => { notify = resolve; });
  cart.changeProductQuantity(5, 1);
  assert.equal(await updated, 5);
  assert.deepEqual(requests[1], ['set', '7', 5, 2]);
  assert.equal(cart.getProductQuantity(5), 2);
  updated = new Promise((resolve) => { notify = resolve; });
  cart.removeProduct(5);
  assert.equal(await updated, 5);
  assert.deepEqual(requests[2], ['set', '7', 5, 0]);
  assert.deepEqual(cart.getItems(), []);
  assert.equal(authPanel.textContent, 'cart');

  failLoading = true;
  await cart.reloadCart();
  assert.equal(cart.getErrorMessage(), 'Не удалось загрузить корзину. Обновите страницу и попробуйте снова.');
  assert.equal(cart.getDisplayTotal(), '—');
  assert.equal(cart.canUseCart(), false);

  assert.throws(() => initCart(dom.window.document.createElement('main'), undefined), /Не найдены элементы корзины/);
});
