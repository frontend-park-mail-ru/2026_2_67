import type { CartItem } from './cart-model.js';
import type { BasketValidityProduct } from './cart-api.js';

// The API exposes no stock count. A rejected requested quantity is only a session hint.
const rejectedCounts = new Map<string, Map<number, number>>();
const availableCounts = new Map<string, Map<number, number>>();

function state(userId: string): Map<number, number> {
  let current = rejectedCounts.get(userId);
  if (!current) {
    current = new Map();
    rejectedCounts.set(userId, current);
  }
  return current;
}

export function markRejectedCount(userId: string, productId: number, count: number): void {
  state(userId).set(productId, count);
}

export function isStockRejection(status: number, method: string, currentCount: number, newCount: number, responseBody: string | null): boolean {
  // Current backend sends an empty 422 for invalid counts and exceeded stock.
  // These client-generated counts are valid, so only the latter remains.
  if (status !== 422 || responseBody !== '' || !Number.isInteger(currentCount) || !Number.isInteger(newCount)) return false;
  return (method === 'PATCH' && currentCount > 0 && newCount > currentCount)
    || (method === 'POST' && currentCount === 0 && newCount >= 1);
}

export function confirmAvailableCount(userId: string, productId: number, count: number): void {
  const rejected = state(userId).get(productId);
  if (rejected !== undefined && count >= rejected) state(userId).delete(productId);
}

export function clearStockState(): void {
  rejectedCounts.clear();
  availableCounts.clear();
}

export function setUnavailableProducts(userId: string, products: BasketValidityProduct[]): void {
  availableCounts.set(userId, new Map(products.map((product) => [product.id, product.newAvailableCount])));
}

export function isProductUnavailable(userId: string, productId: number): boolean {
  return availableCounts.get(userId)?.has(productId) ?? false;
}

export function getNewAvailableCount(userId: string, productId: number): number | undefined {
  return availableCounts.get(userId)?.get(productId);
}

export function isQuantityRejected(userId: string, productId: number, quantity: number): boolean {
  const rejected = state(userId).get(productId);
  return rejected !== undefined && quantity >= rejected - 1;
}

/** A rejected request proves only this count and larger counts are unavailable. */
export function isRequestedCountRejected(userId: string, productId: number, count: number): boolean {
  const rejected = state(userId).get(productId);
  return rejected !== undefined && count >= rejected;
}

export function decorateStockItems(userId: string, items: CartItem[]): (CartItem & { stockWarning: string; increaseDisabled: boolean })[] {
  return items.map((item) => {
    const availableCount = getNewAvailableCount(userId, item.id);
    const limited = availableCount !== undefined && item.quantity > availableCount;
    return { ...item,
      stockWarning: limited
        ? availableCount === 0 ? 'Товара в наличии больше нет' : `Текущее допустимое количество: ${availableCount}.`
        : isQuantityRejected(userId, item.id, item.quantity) ? 'Текущее допустимое количество недоступно.' : '',
      increaseDisabled: isQuantityRejected(userId, item.id, item.quantity),
    };
  });
}

export function reconcileStockState(userId: string, items: CartItem[]): void {
  const quantities = new Map(items.map((item) => [item.id, item.quantity]));
  for (const [id, rejected] of state(userId)) {
    const quantity = quantities.get(id) ?? 0;
    if (quantity >= rejected) state(userId).delete(id);
  }
}
