import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<main></main>', { url: 'http://localhost' });
globalThis.localStorage = dom.window.localStorage;
const { settings, loadSettings, watchSettings } = await import('../public/js/shared/onlineconf.ts');
const { minOrderRemaining } = await import('../public/js/shared/min-order.ts');
const { productReviewsView } = await import('../public/js/pages/product/product-reviews.ts');

test('settings updates active pages and retains confirmed settings on failure', async () => {
  let calls = 0;
  const page = dom.window.document.querySelector('main');
  watchSettings(page, () => { calls += 1; });
  globalThis.fetch = async () => Response.json({
    configs: { min_order_amount: 500 }, flags: { checkout_enabled: false, reviews_enabled: false },
  });
  await loadSettings();
  assert.equal(minOrderRemaining(450), 50);
  assert.equal(settings.checkoutEnabled, false);
  assert.equal(productReviewsView({ canReview: true }).reviewsDisabled, true);
  assert.equal(calls, 1);
  await loadSettings();
  assert.equal(calls, 1);

  globalThis.fetch = async () => { throw new Error('offline'); };
  await loadSettings();
  assert.equal(settings.minOrderAmount, 500);
  globalThis.fetch = async () => Response.json({ configs: { min_order_amount: 'bad' }, flags: {} });
  await loadSettings();
  assert.equal(settings.minOrderAmount, 500);

  const pending = [];
  globalThis.fetch = () => new Promise(resolve => pending.push(resolve));
  const old = loadSettings();
  const recent = loadSettings();
  pending[1](Response.json({
    configs: { min_order_amount: 800 }, flags: { checkout_enabled: true, reviews_enabled: true },
  }));
  await recent;
  pending[0](Response.json({
    configs: { min_order_amount: 1 }, flags: { checkout_enabled: false, reviews_enabled: false },
  }));
  await old;
  assert.equal(settings.minOrderAmount, 800);
  assert.equal(settings.checkoutEnabled, true);

  page.remove();
  globalThis.fetch = async () => Response.json({ configs: {}, flags: {} });
  await loadSettings();
  assert.equal(settings.minOrderAmount, 0);
  assert.equal(settings.checkoutEnabled, false);
  assert.equal(settings.reviewsEnabled, false);
  assert.equal(calls, 2);
});
