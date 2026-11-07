import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';

test('maps API product fields and formats the price', async () => {
  const source = new URL('../public/js/data/map-api-product.ts', import.meta.url);
  const result = await transformFileAsync(fileURLToPath(source), {
    presets: ['@babel/preset-typescript'],
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`;
  const { mapApiProduct } = await import(moduleUrl);

  assert.deepEqual(mapApiProduct({
    id: 42,
    name: 'Наушники',
    pictureUrls: ['/images/headphones-1.jpg'],
    priceResult: 12345.6,
    rating: 4.5,
    reviewsCount: 12,
  }), {
    id: 42,
    title: 'Наушники',
    images: ['/images/headphones-1.jpg'],
    price: '12\u00a0346 ₽',
    rating: 4.5,
    reviewsCount: 12,
  });
});
