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

const guardUrl = moduleUrl(await transform('../public/js/shared/route-guards.ts'));
const mapUrl = moduleUrl(await transform('../public/js/pages/checkout/pickup-map.ts'));
const checkoutTemplate = Handlebars.compile(await readFile(new URL('../public/js/templates/checkout-page.hbs', import.meta.url), 'utf8'));
Handlebars.registerPartial('siteHeader', '<form data-catalog-search></form>');
Handlebars.registerPartial('siteFooter', '');
const templateUrl = moduleUrl('export const checkoutPageTemplate = (...args) => globalThis.checkoutTest.template(...args); export const cartItemsTemplate = () => "items";');
const cartUrl = moduleUrl('export const initCart = () => globalThis.checkoutTest.cart;');
const authUrl = moduleUrl('export const getCurrentUser = () => ({ userId: "7" }); export const authorizedFetch = (...args) => globalThis.checkoutTest.fetch(...args);');
const mapMockUrl = moduleUrl('export const showPickupMap = (...args) => globalThis.checkoutTest.showMap(...args);');
const checkoutCode = (await transform('../public/js/pages/checkout/checkout-page.ts'))
  .replace('../../components/cart/cart.js', cartUrl)
  .replace('../../shared/auth.js', authUrl)
  .replace('../../templates/templates.js', templateUrl)
  .replace('./pickup-map.js', mapMockUrl)
  .replace('../../shared/route-guards.js', guardUrl);
const { renderCheckoutPage } = await import(moduleUrl(checkoutCode));
const { showPickupMap } = await import(mapUrl);
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('checkout requests pickup and order using geolocation', async (t) => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/' });
  const saved = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'checkoutTest']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    dom.window.close();
  });
  Object.defineProperty(dom.window.navigator, 'geolocation', {
    value: { getCurrentPosition: (success) => success({ coords: { longitude: 37.6, latitude: 55.7 } }) },
  });
  const calls = [];
  let reloaded = false;
  globalThis.checkoutTest = {
    template: checkoutTemplate,
    cart: {
      isLoading: () => false, getErrorMessage: () => '', canCheckout: () => true,
      getItems: () => [{ id: 1 }], getDisplayCount: () => '1 товар',
      getDisplayTotal: () => '100 ₽', reloadCart: async () => { reloaded = true; },
    },
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(url === '/orders/' ? { orderId: 42 } : { pickupPoint: { longitude: 37.5, latitude: 55.8 } }));
    },
    showMap: async (element, point) => { element.hidden = false; calls.push({ point }); },
  };
  const app = dom.window.document.querySelector('#app');
  renderCheckoutPage(app);
  const pickup = app.querySelector('.checkout-page__pickup-button');
  const submit = app.querySelector('.checkout-page__submit');
  assert.equal(submit.disabled, true);
  pickup.click();
  await flush();
  assert.deepEqual(calls[0], { url: '/buyers/7/basket/preview', body: { longitude: 37.6, latitude: 55.7, promocode: '' } });
  assert.deepEqual(calls[1], { point: { longitude: 37.5, latitude: 55.8 } });
  assert.equal(submit.disabled, false);
  submit.click();
  await flush();
  assert.deepEqual(calls[2], { url: '/orders/', body: { longitude: 37.6, latitude: 55.7 } });
  assert.equal(app.querySelector('.checkout-page__order-status').textContent, 'Заказ №42 оформлен.');
  assert.equal(reloaded, true);
  assert.equal(pickup.disabled, true);
});

test('pickup map uses SDK coordinates and renders marker', async (t) => {
  const dom = new JSDOM('<div id="map" hidden></div>');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    dom.window.close();
  });
  const recorded = { children: [] };
  dom.window.ymaps3 = {
    ready: Promise.resolve(),
    YMap: class { constructor(container, options) { recorded.container = container; recorded.location = options.location; } addChild(child) { recorded.children.push(child); } },
    YMapDefaultSchemeLayer: class {},
    YMapDefaultFeaturesLayer: class {},
    YMapMarker: class { constructor(options, element) { recorded.marker = { options, element }; } },
  };
  const container = dom.window.document.querySelector('#map');
  await showPickupMap(container, { longitude: 37.5, latitude: 55.8 });
  assert.equal(container.hidden, false);
  assert.deepEqual(recorded.location, { center: [37.5, 55.8], zoom: 14 });
  assert.deepEqual(recorded.marker.options.coordinates, [37.5, 55.8]);
  assert.equal(recorded.marker.element.textContent, 'ПВЗ');
  assert.equal(recorded.children.length, 3);
});
