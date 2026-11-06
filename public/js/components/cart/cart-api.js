import { authorizedFetch } from '../../shared/auth.js';

function basketPath(userId) {
  return `/buyers/${encodeURIComponent(userId)}/basket`;
}

async function requestBasket(path, options) {
  const response = await authorizedFetch(path, options);
  if (!response.ok) {
    throw new Error(`Запрос корзины не выполнен: ${response.status}`);
  }
  return response;
}

export async function getBasket(userId) {
  const response = await requestBasket(basketPath(userId));
  const basket = await response.json();
  if (!Array.isArray(basket.basketProducts) || !Number.isFinite(basket.basketSumResult)) {
    throw new Error('Сервер вернул корзину в неожиданном формате.');
  }
  return basket;
}

export async function addBasketProduct(userId, productId) {
  await requestBasket(`${basketPath(userId)}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, count: 1 }),
  });
}

export async function setBasketProductCount(userId, productId, count) {
  await requestBasket(`${basketPath(userId)}/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
}
