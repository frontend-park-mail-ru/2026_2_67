import assert from 'node:assert/strict';
import test from 'node:test';
import { productIdFromPath, productSlug, productUrl } from '../public/js/shared/product-url.ts';

test('product URLs transliterate real Cyrillic names', () => {
  assert.equal(productSlug('Сухой корм для кошек'), 'suhoy-korm-dlya-koshek');
  assert.equal(productUrl(28, 'Сухой корм для кошек'), '/products/28/suhoy-korm-dlya-koshek');
  assert.equal(productIdFromPath('/products/28/suhoy-korm-dlya-koshek'), 28);
});

test('legacy product URLs and changed names still resolve by ID', () => {
  assert.equal(productIdFromPath('/products/28'), 28);
  assert.equal(productIdFromPath('/products/28/old-name'), 28);
  assert.equal(productIdFromPath('/products/28/new-name'), 28);
  assert.equal(productIdFromPath('/products/0/name'), null);
  assert.equal(productIdFromPath('/products/28/name/extra'), null);
});
