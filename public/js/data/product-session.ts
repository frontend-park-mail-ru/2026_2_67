import type { ApiProduct } from './map-api-product.js';

const prefix = 'vibe-product-';

export function rememberProducts(products: ApiProduct[]): void {
  for (const product of products) {
    if (!Number.isSafeInteger(product.id) || product.id <= 0 || typeof product.name !== 'string') continue;
    try {
      sessionStorage.setItem(`${prefix}${product.id}`, JSON.stringify(product));
    } catch {
      // The catalog remains usable when session storage is disabled.
    }
  }
}

export function rememberedProduct(id: number): ApiProduct | null {
  try {
    const raw = sessionStorage.getItem(`${prefix}${id}`);
    if (!raw) return null;
    const product: unknown = JSON.parse(raw);
    if (typeof product !== 'object' || product === null || !('id' in product) || product.id !== id
      || !('name' in product) || typeof product.name !== 'string'
      || !('priceResult' in product) || typeof product.priceResult !== 'number') return null;
    return product as ApiProduct;
  } catch {
    return null;
  }
}
