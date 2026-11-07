import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';

const source = new URL('../public/js/components/cart/cart-model.ts', import.meta.url);
const result = await transformFileAsync(fileURLToPath(source), {
  presets: ['@babel/preset-typescript'],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`;
const { mapBasket } = await import(moduleUrl);

test('maps basket items and the total with Russian price formatting', () => {
  const basket = {
    basketProducts: [
      { id: 1, category: 'Audio', name: 'Наушники', pictureUrl: '/one.jpg', price: 1500, discount: 10, priceResult: 1234.56, count: 2 },
      { id: 2, category: 'Audio', name: 'Колонка', pictureUrl: '/two.jpg', price: 100, discount: 0, priceResult: 99.5, count: 3 },
    ],
    basketSum: 3300,
    basketSumResult: 2767.62,
  };

  assert.deepEqual(mapBasket(basket), {
    items: [
      { id: 1, title: 'Наушники', image: '/one.jpg', price: '1\u00a0234,56 ₽', quantity: 2 },
      { id: 2, title: 'Колонка', image: '/two.jpg', price: '99,5 ₽', quantity: 3 },
    ],
    priceSum: 2767.62,
  });
});

test('maps an empty basket', () => {
  assert.deepEqual(mapBasket({ basketProducts: [], basketSum: 0, basketSumResult: 0 }), {
    items: [],
    priceSum: 0,
  });
});
