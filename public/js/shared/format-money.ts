const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats a numeric amount for display without changing its value. */
export function formatMoney(amount: number): string {
  return `${moneyFormatter.format(amount)} ₽`;
}
