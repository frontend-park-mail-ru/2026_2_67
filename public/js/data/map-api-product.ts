export interface ApiProduct {
  id: number;
  name: string;
  pictureUrls: string[];
  priceResult: number;
  rating: number;
  reviewsCount: number;
}

export interface ProductCard {
  id: number;
  title: string;
  images: string[];
  price: string;
  rating: number;
  reviewsCount: number;
}

const priceFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

/** Maps a backend product to the product-card view model. */
export function mapApiProduct(product: ApiProduct): ProductCard {
  return {
    id: product.id,
    title: product.name,
    images: product.pictureUrls,
    price: `${priceFormatter.format(product.priceResult)} ₽`,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
  };
}
