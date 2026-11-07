/** Keeps only product-specific preview errors from the documented 422 response. */
export function readPreviewProductErrors(value: unknown): Map<number, string> | null {
  if (typeof value !== 'object' || value === null || !('productsErr' in value) || !Array.isArray(value.productsErr)) return null;
  const errors = new Map<number, string>();
  for (const entry of value.productsErr) {
    if (typeof entry !== 'object' || entry === null || !Number.isInteger(entry.productId)) continue;
    errors.set(entry.productId as number, typeof entry.errMessage === 'string' && entry.errMessage
      ? entry.errMessage : 'Товар недоступен в указанном количестве.');
  }
  return errors;
}
