import { authorizedFetch } from '../../shared/auth.js';

export interface BasketProduct {
  id: number;
  category: string;
  name: string;
  pictureUrl: string;
  price: number;
  discount: number;
  priceResult: number;
  count: number;
}

export interface BasketResponse {
  basketProducts: BasketProduct[];
  basketSum: number;
  basketSumResult: number;
}

export interface BasketValidityResponse {
  products?: Array<{ id: number }>;
}

export class BasketRequestError extends Error {
  constructor(readonly status: number, readonly method: string, readonly responseBody: string | null) {
    super(`Запрос корзины не выполнен: ${status}`);
  }
}

function basketPath(userId: string): string {
  return `/buyers/${encodeURIComponent(userId)}/basket`;
}

async function requestBasket(path: string, options?: RequestInit): Promise<Response> {
  const response = await authorizedFetch(path, options);
  if (!response.ok) {
    const responseBody = await response.text().catch(() => null);
    throw new BasketRequestError(response.status, options?.method ?? 'GET', responseBody);
  }
  return response;
}

export async function getBasket(userId: string): Promise<BasketResponse> {
  const response = await requestBasket(basketPath(userId));
  const basket = await response.json() as BasketResponse;
  if (!Array.isArray(basket.basketProducts) || !Number.isFinite(basket.basketSumResult)) {
    throw new Error('Сервер вернул корзину в неожиданном формате.');
  }
  return basket;
}

export async function getBasketValidity(userId: string): Promise<number[]> {
  try {
    await requestBasket(`${basketPath(userId)}/is_valid`);
    return [];
  } catch (error) {
    if (!(error instanceof BasketRequestError) || error.status !== 422) throw error;
    const result = JSON.parse(error.responseBody ?? '') as BasketValidityResponse;
    if (!Array.isArray(result.products)) throw new Error('Сервер вернул доступность корзины в неожиданном формате.');
    return result.products
      .map((product) => product.id)
      .filter((id) => Number.isInteger(id) && id > 0);
  }
}

export async function addBasketProduct(userId: string, productId: number, count = 1): Promise<void> {
  await requestBasket(`${basketPath(userId)}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, count }),
  });
}

export async function setBasketProductCount(userId: string, productId: number, count: number): Promise<void> {
  await requestBasket(`${basketPath(userId)}/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
}
