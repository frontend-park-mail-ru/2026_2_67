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

const guardUrl = moduleUrl(await transform('../public/js/shared/route-guards.ts'));
const authUrl = moduleUrl('export const getCurrentUser = () => ({ userId: "7" });');
const templatesUrl = moduleUrl('export const cartPageTemplate = () => `<div class="cart-page"><form data-catalog-search></form><span class="cart-page__count"></span><div class="cart-page__items"></div><strong class="cart-page__total-price"></strong><a class="cart-page__checkout" href="/checkout">Checkout</a></div>`; export const cartItemsTemplate = () => "";');
const cartUrl = moduleUrl('export const initCart = (page, userId, callback) => { globalThis.cartPageTest.refresh = callback; globalThis.cartPageTest.userId = userId; return globalThis.cartPageTest.controller; };');
const source = (await transform('../public/js/pages/cart/cart-page.ts'))
  .replace('../../shared/auth.js', authUrl)
  .replace('../../templates/templates.js', templatesUrl)
  .replace('../../components/cart/cart.js', cartUrl)
  .replace('../../shared/route-guards.js', guardUrl);
const { renderCartPage } = await import(moduleUrl(source));

test('checkout is blocked for an empty cart and enabled when available', (t) => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const name of ['Element', 'HTMLAnchorElement', 'HTMLButtonElement', 'HTMLFormElement', 'cartPageTest']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  for (const name of ['Element', 'HTMLAnchorElement', 'HTMLButtonElement', 'HTMLFormElement']) {
    globalThis[name] = dom.window[name];
  }
  t.after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  });

  let available = false;
  globalThis.cartPageTest = {
    controller: {
      getItems: () => [], isLoading: () => false, getErrorMessage: () => '',
      canUseCart: () => true, getDisplayCount: () => '0 товаров',
      getDisplayTotal: () => '0 ₽', canCheckout: () => available,
    },
  };
  const app = dom.window.document.querySelector('#app');
  renderCartPage(app);
  const link = app.querySelector('.cart-page__checkout');
  let delegatedClicks = 0;
  app.addEventListener('click', () => { delegatedClicks += 1; });
  const blockedClick = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  assert.equal(link.dispatchEvent(blockedClick), false);
  assert.equal(delegatedClicks, 0);
  assert.equal(link.getAttribute('aria-disabled'), 'true');
  assert.equal(link.tabIndex, -1);
  assert.equal(app.querySelector('.cart-page__count').textContent, '0 товаров');
  assert.equal(app.querySelector('.cart-page__total-price').textContent, '0 ₽');
  assert.equal(globalThis.cartPageTest.userId, '7');

  available = true;
  globalThis.cartPageTest.refresh();
  const allowedClick = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  app.addEventListener('click', (event) => event.preventDefault(), { once: true });
  link.dispatchEvent(allowedClick);
  assert.equal(delegatedClicks, 1);
  assert.equal(link.getAttribute('aria-disabled'), 'false');
  assert.equal(link.tabIndex, 0);
});
