import {
  createProductCard,
  initProductCard,
} from '../../components/product-card/product-card.js';
import { products } from '../../data/products.js';
import { catalogTemplate } from '../../templates/templates.js';

/**
 * Renders the catalog and connects each product card.
 * @param {HTMLElement} app Main application container.
 */
export function renderCatalogPage(app) {
  const productsHtml = products.map(createProductCard).join('');
  app.innerHTML = catalogTemplate({ productsHtml });

  app.querySelectorAll('[data-product-card]').forEach((card) => {
    const productId = Number(card.dataset.productId);
    const product = products.find((item) => item.id === productId);
    initProductCard(card, product);
  });
}
