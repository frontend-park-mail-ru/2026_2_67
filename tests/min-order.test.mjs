import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
globalThis.localStorage = new JSDOM('', { url: 'http://localhost' }).window.localStorage;
const { minOrderRemaining } = await import('../public/js/shared/min-order.ts');
const { settings } = await import('../public/js/shared/onlineconf.ts');

test('minimum order uses discounted total and handles the threshold', () => {
  assert.equal(settings.minOrderAmount, 1000);
  for (const [total, remaining] of [[0, 1000], [500, 500], [999, 1], [1000, 0], [1250, 0], [749.99, 250.01]]) {
    assert.equal(minOrderRemaining(total), remaining);
  }
  settings.minOrderAmount = 500;
  assert.equal(minOrderRemaining(450), 50);
  assert.equal(minOrderRemaining(500), 0);
});
