import { formatMoney } from '../shared/format-money.js';

export interface ApiProduct {
  id: number;
  name: string;
  sellerName?: string;
  pictureUrls: string[];
  priceResult: number;
  price?: number;
  availableCount?: number;
  description?: string | null;
  rating: number;
  raiting?: number;
  marksCount?: number;
  rating1Count?: number;
  rating2Count?: number;
  rating3Count?: number;
  rating4Count?: number;
  rating5Count?: number;
  canReview?: boolean;
  wasReview?: boolean;
  reviewsCount: number;
}

export interface ProductCard {
  id: number;
  title: string;
  sellerName: string;
  images: string[];
  price: string;
  oldPrice?: string;
  discountPercent?: number;
  availableCount?: number;
  rating: number;
  reviewsCount: number;
}

/** Maps a backend product to the product-card view model. */
export function mapApiProduct(product: ApiProduct): ProductCard {
  const price = product.price ?? 0;
  const hasDiscount = Number.isFinite(price) && Number.isFinite(product.priceResult)
    && product.priceResult >= 0 && price > product.priceResult;
  return {
    id: product.id,
    title: product.name,
    sellerName: typeof product.sellerName === 'string' ? product.sellerName : '',
    images: product.pictureUrls,
    price: formatMoney(product.priceResult),
    oldPrice: hasDiscount ? formatMoney(price) : undefined,
    discountPercent: hasDiscount ? Math.max(1, Math.round((1 - product.priceResult / price) * 100)) : undefined,
    availableCount: Number.isInteger(product.availableCount) && Number(product.availableCount) >= 0
      ? product.availableCount : undefined,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
  };
}
