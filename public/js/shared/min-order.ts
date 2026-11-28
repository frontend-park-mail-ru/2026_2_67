export const MIN_ORDER_AMOUNT = 1000;

export function minOrderRemaining(total: number): number {
  return Math.max(0, Math.round((MIN_ORDER_AMOUNT - total) * 100) / 100);
}
