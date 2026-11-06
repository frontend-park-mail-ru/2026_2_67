const priceFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

/**
 * Maps a backend product to the product-card view model.
 * @param {Object} product Product returned by the backend API.
 * @returns {Object} Product-card data.
 */
export function mapApiProduct(product) {
  return {
    id: product.id,
    title: product.name,
    images: product.pictureUrls,
    price: `${priceFormatter.format(product.priceResult)} ₽`,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
  };
}
