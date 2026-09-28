window.OzonApp = window.OzonApp || {};

/**
 * Создаёт HTML карточки из данных одного товара.
 * @param {Object} product Товар из массива тестовых данных.
 * @returns {string} HTML карточки.
 */
window.OzonApp.createProductCard = function createProductCard(product) {
  return window.OzonApp.templates.productCard({
    id: product.id,
    title: product.title,
    price: product.price,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
    currentImage: product.images[0],
    hasMultipleImages: product.images.length > 1,
    dots: product.images.map(function createDot(image, index) {
      return { index: index, isActive: index === 0 };
    })
  });
};

/**
 * Добавляет независимое переключение фотографий конкретной карточке.
 * @param {HTMLElement} card HTML-элемент карточки.
 * @param {Object} product Данные товара этой карточки.
 */
window.OzonApp.initProductCard = function initProductCard(card, product) {
  if (product.images.length < 2) {
    return;
  }

  var currentImageIndex = 0;
  var image = card.querySelector('[data-product-image]');
  var dots = card.querySelectorAll('[data-image-dot]');

  function showImage(index) {
    currentImageIndex = (index + product.images.length) % product.images.length;
    image.src = product.images[currentImageIndex];

    dots.forEach(function updateDot(dot, dotIndex) {
      dot.classList.toggle('product-card__dot--active', dotIndex === currentImageIndex);
    });
  }

  card.querySelector('[data-image-prev]').addEventListener('click', function showPreviousImage() {
    showImage(currentImageIndex - 1);
  });
  card.querySelector('[data-image-next]').addEventListener('click', function showNextImage() {
    showImage(currentImageIndex + 1);
  });
  dots.forEach(function addDotListener(dot) {
    dot.addEventListener('click', function showDotImage() {
      showImage(Number(dot.dataset.imageDot));
    });
  });
};
