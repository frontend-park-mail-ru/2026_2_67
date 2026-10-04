const priceFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

/** Maps the backend product contract to the product-card view model. */
export function mapApiProduct(product, index) {
  return {
    id: index + 1,
    title: product.productName,
    images: product.productPictureUrls,
    price: `${priceFormatter.format(product.productPrice)} ₽`,
    rating: product.productRating,
    reviewsCount: product.productReviewsCount,
  };
}