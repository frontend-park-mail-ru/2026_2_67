import { authorizedFetch } from '../../shared/auth.js';
import type { ApiProduct } from '../../data/map-api-product.js';
import { rememberProducts, rememberedProduct } from '../../data/product-session.js';

function isProduct(value: unknown, id: number): value is ApiProduct {
  if (typeof value !== 'object' || value === null) return false;
  const product = value as Record<string, unknown>;
  return product.id === id && typeof product.name === 'string'
    && typeof product.priceResult === 'number' && Number.isFinite(product.priceResult)
    && product.priceResult >= 0 && Array.isArray(product.pictureUrls)
    && product.pictureUrls.every((url) => typeof url === 'string')
    && (product.description === undefined || product.description === null || typeof product.description === 'string');
}

export async function fetchProduct(id: number): Promise<ApiProduct | null> {
  const response = await authorizedFetch(`/products/${id}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const result: unknown = await response.json();
  const item = typeof result === 'object' && result !== null && 'product' in result ? result.product : result;
  return isProduct(item, id) ? item : null;
}

export async function loadProduct(id: number): Promise<ApiProduct | null> {
  try {
    const item = await fetchProduct(id);
    if (item) {
      rememberProducts([item]);
      return item;
    }
  } catch {
    // A usable catalog snapshot can still open the product.
  }

  const remembered = rememberedProduct(id);
  if (remembered) return { ...remembered, canReview: false, wasReview: false };

  const seenCursors = new Set<string>();
  let cursor = '';
  for (let page = 0; page < 100; page += 1) {
    if (seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
    try {
      const path = cursor ? `/products?${new URLSearchParams({ cursor })}` : '/products';
      const response = await authorizedFetch(path);
      if (!response.ok) break;
      const result: unknown = await response.json();
      if (typeof result !== 'object' || result === null || !('products' in result) || !Array.isArray(result.products)) break;
      const products = result.products.filter((item: unknown) =>
        typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'number'
        && isProduct(item, item.id)) as ApiProduct[];
      rememberProducts(products);
      const found = products.find((item) => item.id === id);
      if (found) return found;
      const next = 'nextCursor' in result ? result.nextCursor : null;
      if (typeof next !== 'string' || !next) break;
      cursor = next;
    } catch {
      break;
    }
  }
  return null;
}
