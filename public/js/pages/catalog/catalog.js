import {
  createProductCard,
  initProductCard,
} from '../../components/product-card/product-card.js';
import { catalogTemplate } from '../../templates/templates.js';
import { mapApiProduct } from '../../data/map-api-product.js';
import { initCart } from '../../components/cart/cart.js';
import {
  authorizedFetch,
  getCurrentUser,
  loadCurrentUser,
} from '../../shared/auth.js';

function renderProducts(grid, products, getCartQuantity, canUseCart) {
  const showAddToCartButton = Boolean(getCurrentUser()) && canUseCart;
  grid.innerHTML = products.map((product) =>
    createProductCard(product, showAddToCartButton && Number.isInteger(product.id), getCartQuantity(product.id))).join('');
  grid.querySelectorAll('[data-product-card]').forEach((card, index) => {
    initProductCard(card, products[index]);
  });
}

async function loadProducts(grid, page, onProducts) {
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

    onProducts(result.map(mapApiProduct));
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
  app.innerHTML = catalogTemplate({ productsHtml: '', user: getCurrentUser(), isCatalog: true });
  const page = app.querySelector('.catalog-page');
  const grid = page.querySelector('.catalog-page__grid');
  const searchForm = page.querySelector('[data-catalog-search]');
  let products = null;

  const cart = initCart(
    page,
    getCurrentUser()?.userId,
    updateVisibleProductCard,
  );

  function updateVisibleProductCard(productId) {
    if (productId === null) {
      showProducts();
      return;
    }
    const product = products?.find((item) => item.id === productId);
    const card = grid.querySelector(`[data-product-id="${productId}"]`);
    if (!product || !card) {
      return;
    }

    const oldControls = card.querySelector('[data-cart-controls]');
    if (!oldControls) {
      return;
    }

    const quantity = cart.getProductQuantity(productId);
    const quantityText = oldControls.querySelector('.product-card__quantity');
    if (quantityText && quantity > 0) {
      quantityText.textContent = String(quantity);
      return;
    }

    const container = document.createElement('div');
    container.innerHTML = createProductCard(product, true, quantity);
    const newControls = container.querySelector('[data-cart-controls]');
    const hadFocus = oldControls.contains(document.activeElement);
    oldControls.replaceWith(newControls);
    if (hadFocus) {
      newControls.querySelector('.product-card__increase, .product-card__add-to-cart').focus();
    }
  }

  function showProducts() {
    if (products === null) {
      return;
    }

    if (products.length === 0) {
      grid.textContent = 'Товары пока не добавлены.';
      return;
    }

    renderProducts(grid, products, cart.getProductQuantity, cart.canUseCart());
  }

  function acceptProducts(loadedProducts) {
    products = loadedProducts;
    showProducts();
  }

  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';

  loadProducts(grid, page, acceptProducts).finally(() => grid.setAttribute('aria-busy', 'false'));

  searchForm.addEventListener('submit', (event) => event.preventDefault());

  grid.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-products]')) {
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';
      loadProducts(grid, page, acceptProducts).finally(() => grid.setAttribute('aria-busy', 'false'));
    }
  });

  if (getCurrentUser() && !getCurrentUser().name) {
    loadCurrentUser().then((user) => {
      if (user?.name && app.querySelector('.catalog-page')) {
        renderCatalogPage(app);
      }
    });
  }
}
