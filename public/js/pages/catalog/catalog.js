import {
  createProductCard,
  initProductCard,
} from '../../components/product-card/product-card.js';
import { catalogTemplate } from '../../templates/templates.js';
import { mapApiProduct } from '../../data/map-api-product.js';
import {
  authorizedFetch,
  getCurrentUser,
  loadCurrentUser,
} from '../../shared/auth.js';

function renderProducts(grid, products) {
  grid.innerHTML = products.map(createProductCard).join('');
  grid.querySelectorAll('[data-product-card]').forEach((card, index) => {
    initProductCard(card, products[index]);
  });
}

async function loadProducts(grid, page) {
  try {
    const response = await authorizedFetch('/products');
    if (!response.ok) {
      throw new Error(`Products request failed: ${response.status}`);
    }

    const result = await response.json();
    if (!Array.isArray(result)) {
      throw new Error('Products response must be an array.');
    }

    if (page !== grid.closest('.catalog-page')) {
      return;
    }

    const products = result.map(mapApiProduct);
    if (products.length === 0) {
      grid.textContent = 'Товары пока не добавлены.';
      return;
    }

    renderProducts(grid, products);
  } catch {
    if (page === grid.closest('.catalog-page')) {
      grid.innerHTML = '<p class="catalog-page__message" role="alert">Не удалось загрузить товары. <button type="button" data-retry-products>Повторить</button></p>';
    }
  }
}

/**
 * Renders the catalog and connects each product card.
 * @param {HTMLElement} app Main application container.
 */
export function renderCatalogPage(app) {
  app.innerHTML = catalogTemplate({ productsHtml: '', user: getCurrentUser() });
  const page = app.querySelector('.catalog-page');
  const grid = page.querySelector('.catalog-page__grid');
  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';

  loadProducts(grid, page).finally(() => grid.setAttribute('aria-busy', 'false'));

  grid.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-products]')) {
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';
      loadProducts(grid, page).finally(() => grid.setAttribute('aria-busy', 'false'));
    }
  });

  if (getCurrentUser() && !getCurrentUser().name) {
    loadCurrentUser().then(() => {
      if (app.querySelector('.catalog-page')) {
        renderCatalogPage(app);
      }
    });
  }
}
