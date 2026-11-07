import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { clearStockState, confirmAvailableCount, decorateStockItems, isQuantityRejected,
  isStockRejection, markRejectedCount, reconcileStockState } from '../public/js/components/cart/stock-state.ts';
import { readPreviewProductErrors } from '../public/js/pages/checkout/preview-errors.ts';

const item = (id, quantity) => ({ id, title: `Товар ${id}`, image: '', price: '10 ₽', quantity });

test('PATCH 422 blocks only the rejected increase and preserves quantity across views', () => {
  clearStockState();
  const user = 'u1';
  assert.equal(isStockRejection(422, 'PATCH', 6, 7, ''), true);
  assert.equal(isStockRejection(422, 'PATCH', 6, 7, 'validation failure'), false);
  assert.equal(isStockRejection(422, 'PATCH', 6, 7, ' '), false);
  assert.equal(isStockRejection(422, 'PATCH', 6, 7, null), false);
  assert.equal(isStockRejection(422, 'PATCH', 2, 1, ''), false);
  assert.equal(isStockRejection(422, 'PATCH', 2, 4, ''), false);
  assert.equal(isStockRejection(422, 'GET', 2, 3, ''), false);
  markRejectedCount(user, 1, 7);
  const cards = decorateStockItems(user, [item(1, 6), item(2, 2)]);
  assert.equal(cards[0].quantity, 6);
  assert.equal(cards[0].increaseDisabled, true);
  assert.equal(cards[0].stockWarning, 'В наличии больше нет');
  assert.equal(cards[1].increaseDisabled, false);
  assert.equal(isQuantityRejected(user, 1, 6), true); // repeat click makes no request
  reconcileStockState(user, [item(1, 6)]); // navigation reload with same count
  assert.equal(isQuantityRejected(user, 1, 6), true);
  confirmAvailableCount(user, 1, 5); // successful decrease keeps the known limit
  assert.equal(isQuantityRejected(user, 1, 5), false);
  reconcileStockState(user, [item(1, 5)]);
  assert.equal(isQuantityRejected(user, 1, 6), true);
  confirmAvailableCount(user, 1, 6); // return to the known maximum
  assert.equal(isQuantityRejected(user, 1, 6), true);
  reconcileStockState(user, [item(1, 7)]); // server has confirmed a larger quantity
  assert.equal(isQuantityRejected(user, 1, 7), false);
});

test('POST 422 marks first item unavailable; other 422 responses do not', () => {
  clearStockState();
  assert.equal(isStockRejection(422, 'POST', 0, 1, ''), true);
  assert.equal(isStockRejection(422, 'POST', 0, 1, 'validation failure'), false);
  assert.equal(isStockRejection(422, 'POST', 0, 2, ''), false);
  assert.equal(isStockRejection(422, 'PATCH', 0, 1, ''), false);
  assert.equal(isStockRejection(400, 'POST', 0, 1, ''), false);
  markRejectedCount('u', 1, 1);
  assert.equal(isQuantityRejected('u', 1, 0), true);
  assert.equal(isQuantityRejected('u', 2, 0), false);
});

test('cart and catalog templates show accessible per-product stock state', () => {
  const cartSource = readFileSync(new URL('../public/js/templates/cart-items.hbs', import.meta.url), 'utf8');
  const cardSource = readFileSync(new URL('../public/js/templates/product-card.hbs', import.meta.url), 'utf8');
  const cart = Handlebars.compile(cartSource);
  const card = Handlebars.compile(cardSource);
  const items = decorateStockItems('u', [item(1, 0), item(2, 1)]);
  const cartHtml = cart({ items: [{ ...item(1, 2), stockWarning: 'В наличии больше нет', increaseDisabled: true }, item(2, 1)], canUseCart: true });
  assert.match(cartHtml, /class="cart-item__increase"[^>]+disabled/);
  assert.match(cartHtml, /role="status">В наличии больше нет/);
  assert.equal((cartHtml.match(/class="cart-item__increase"[^>]+disabled/g) ?? []).length, 1);
  const checkoutHtml = cart({ items: [{ ...items[0], previewError: 'Товар закончился' }], readonly: true });
  assert.match(checkoutHtml, /role="alert">Товар закончился/);
  assert.doesNotMatch(checkoutHtml, /cart-item__increase/);
  const cardHtml = card({ id: 1, title: 'Товар', quantity: 2, showAddToCartButton: true, stockLimited: true });
  assert.match(cardHtml, /product-card__increase[^>]+disabled/);
  assert.match(cardHtml, /В наличии больше нет/);
  const unavailableHtml = card({ id: 3, title: 'Товар', quantity: 0, showAddToCartButton: true, stockLimited: true });
  assert.match(unavailableHtml, /Нет в наличии/);
  assert.doesNotMatch(unavailableHtml, /product-card__add-to-cart|Проверить наличие/);
});

test('preview 422 maps productsErr by productId and ignores unrelated validation', () => {
  const errors = readPreviewProductErrors({ productsErr: [
    { productId: 7, errMessage: 'Нет товара' }, { productId: 8, errMessage: '' },
  ] });
  assert.equal(errors.get(7), 'Нет товара');
  assert.equal(errors.get(8), 'Товар недоступен в указанном количестве.');
  assert.equal(errors.has(9), false);
  assert.equal(readPreviewProductErrors({ longitudeErrMessage: 'Ошибка' }), null);
});
