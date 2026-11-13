import { productCardTemplate } from '../../templates/templates.js';
import type { ProductCard } from '../../data/map-api-product.js';

/**
 * Creates product-card HTML from product data.
 * @param {Object} product Catalog product.
 * @param {boolean} showAddToCartButton Whether to show cart actions.
 * @param {number} quantity Current quantity of this product in the cart.
 * @returns {string} Product-card HTML.
 */
export function createProductCard(product: ProductCard, showAddToCartButton: boolean, quantity = 0, stockLimited = false): string {
  return productCardTemplate({
    id: product.id,
    title: product.title,
    sellerName: product.sellerName,
    price: product.price,
    currentImage: product.images[0],
    hasMultipleImages: product.images.length > 1,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
    showAddToCartButton,
    quantity,
    stockLimited,
    dots: product.images.map((image, index) => ({ index, isActive: index === 0 })),
  });
}

/**
 * Connects independent image controls for one product card.
 * @param {HTMLElement} card Product-card element.
 * @param {Object} product Product represented by the card.
 */
export function initProductCard(card: HTMLElement, product: ProductCard): void {
  if (product.images.length < 2) {
    return;
  }

  let currentImageIndex = 0;
  const image = card.querySelector('[data-product-image]');
  const previousButton = card.querySelector('[data-image-prev]');
  const nextButton = card.querySelector('[data-image-next]');
  if (!(image instanceof HTMLImageElement) || !(previousButton instanceof HTMLButtonElement) || !(nextButton instanceof HTMLButtonElement)) {
    throw new Error('Элементы галереи товара не найдены.');
  }
  const galleryImage = image;
  const dots = card.querySelectorAll('[data-image-dot]');

  function showImage(index: number): void {
    currentImageIndex = (index + product.images.length) % product.images.length;
    galleryImage.src = product.images[currentImageIndex];

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('product-card__dot--active', dotIndex === currentImageIndex);
    });
  }

  previousButton.addEventListener('click', () => {
    showImage(currentImageIndex - 1);
  });
  nextButton.addEventListener('click', () => {
    showImage(currentImageIndex + 1);
  });
  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      showImage(Number(dot.getAttribute('data-image-dot') ?? undefined));
    });
  });
}
