import { formatMoney } from '../../shared/format-money.js';

/** Keep the unit price in kopecks so repeated quantity changes never compound rounding. */
export function formatProductTotal(unitPrice: number, quantity: number): string {
  const kopecks = Math.round(unitPrice * 100);
  return formatMoney((kopecks * quantity) / 100);
}
