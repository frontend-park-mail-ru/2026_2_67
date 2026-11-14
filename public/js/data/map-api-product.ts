import { formatMoney } from '../shared/format-money.js';

export interface ApiProduct {
  id: number;
  name: string;
  sellerName?: string;
  pictureUrls: string[];
  priceResult: number;
  description?: string | null;
  rating: number;
  reviewsCount: number;
}

export interface ProductCard {
  id: number;
  title: string;
  sellerName: string;
  images: string[];
  price: string;
  rating: number;
  reviewsCount: number;
}

/** Maps a backend product to the product-card view model. */
export function mapApiProduct(product: ApiProduct): ProductCard {
  return {
    id: product.id,
    title: product.name,
    sellerName: typeof product.sellerName === 'string' ? product.sellerName : '',
    images: product.pictureUrls,
    price: formatMoney(product.priceResult),
    rating: product.rating,
    reviewsCount: product.reviewsCount,
  };
}
