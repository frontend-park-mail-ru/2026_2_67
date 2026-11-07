import type { CartItem } from './cart-model.js';

// The API exposes no stock count. A rejected requested quantity is only a session hint.
const rejectedCounts = new Map<string, Map<number, number>>();

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
  return (method === 'PATCH' && currentCount > 0 && newCount === currentCount + 1)
    || (method === 'POST' && currentCount === 0 && newCount === 1);
}

export function confirmAvailableCount(userId: string, productId: number, count: number): void {
  const rejected = state(userId).get(productId);
  if (rejected !== undefined && count >= rejected) state(userId).delete(productId);
}

export function clearStockState(): void {
  rejectedCounts.clear();
}

export function isQuantityRejected(userId: string, productId: number, quantity: number): boolean {
  const rejected = state(userId).get(productId);
  return rejected !== undefined && quantity >= rejected - 1;
}

export function decorateStockItems(userId: string, items: CartItem[]): (CartItem & { stockWarning: string; increaseDisabled: boolean })[] {
  return items.map((item) => ({ ...item,
    stockWarning: isQuantityRejected(userId, item.id, item.quantity) ? 'В наличии больше нет' : '',
    increaseDisabled: isQuantityRejected(userId, item.id, item.quantity),
  }));
}

export function reconcileStockState(userId: string, items: CartItem[]): void {
  const quantities = new Map(items.map((item) => [item.id, item.quantity]));
  for (const [id, rejected] of state(userId)) {
    const quantity = quantities.get(id) ?? 0;
    if (quantity >= rejected) state(userId).delete(id);
  }
}
