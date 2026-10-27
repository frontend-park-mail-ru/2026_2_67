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
    title: product.productName,
    images: product.productPictureUrls,
    price: `${priceFormatter.format(product.productPrice)} ₽`,
    rating: product.productRating,
    reviewsCount: product.productReviewsCount,
  };
}
