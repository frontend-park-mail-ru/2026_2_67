import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_ORDER_AMOUNT, minOrderRemaining } from '../public/js/shared/min-order.ts';

test('minimum order uses discounted total and handles the threshold', () => {
  assert.equal(MIN_ORDER_AMOUNT, 1000);
  for (const [total, remaining] of [[0, 1000], [500, 500], [999, 1], [1000, 0], [1250, 0], [749.99, 250.01]]) {
    assert.equal(minOrderRemaining(total), remaining);
  }
});
