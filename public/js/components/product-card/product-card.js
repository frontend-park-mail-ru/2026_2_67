import { productCardTemplate } from '../../templates/templates.js';

/**
 * Creates product-card HTML from product data.
 * @param {Object} product Catalog product.
 * @returns {string} Product-card HTML.
 */
export function createProductCard(product) {
  return productCardTemplate({
    id: product.id,
    title: product.title,
    price: product.price,
    currentImage: product.images[0],
    hasMultipleImages: product.images.length > 1,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
    dots: product.images.map((image, index) => ({ index, isActive: index === 0 })),
  });
}

/**
 * Connects independent image controls for one product card.
 * @param {HTMLElement} card Product-card element.
 * @param {Object} product Product represented by the card.
 */
export function initProductCard(card, product) {
  if (product.images.length < 2) {
    return;
  }

  let currentImageIndex = 0;
  const image = card.querySelector('[data-product-image]');
  const dots = card.querySelectorAll('[data-image-dot]');

  function showImage(index) {
    currentImageIndex = (index + product.images.length) % product.images.length;
    image.src = product.images[currentImageIndex];

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('product-card__dot--active', dotIndex === currentImageIndex);
    });
  }

  card.querySelector('[data-image-prev]').addEventListener('click', () => {
    showImage(currentImageIndex - 1);
  });
  card.querySelector('[data-image-next]').addEventListener('click', () => {
    showImage(currentImageIndex + 1);
  });
  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      showImage(Number(dot.dataset.imageDot));
    });
  });
}
