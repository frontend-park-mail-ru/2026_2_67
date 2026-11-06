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

async function loadProducts(grid, page, category, cursor, onProducts) {
  try {
    // При следующей загрузке сохраняем категорию и добавляем курсор из прошлого ответа.
    const params = new window.URLSearchParams();
    if (category) params.set('category', category);
    if (cursor) params.set('cursor', cursor);
    const path = params.size ? `/products?${params}` : '/products';
    const response = await authorizedFetch(path);
    if (!response.ok) {
      throw new Error(`Products request failed: ${response.status}`);
    }

    const result = await response.json();
    if (!Array.isArray(result.products)) {
      throw new Error('Products response must contain an array of products.');
    }

    if (page !== grid.closest('.catalog-page')) {
      return false;
    }

    onProducts(result.products.map(mapApiProduct), result.nextCursor || '');
    return true;
  } catch {
    if (!cursor && page === grid.closest('.catalog-page')) {
      grid.innerHTML = '<p class="catalog-page__message" role="alert">Не удалось загрузить товары. <button type="button" data-retry-products>Повторить</button></p>';
    }
    return false;
  }
}

/**
 * Renders the catalog and connects each product card.
 * @param {HTMLElement} app Main application container.
 */
export function renderCatalogPage(app) {
  const category = new window.URLSearchParams(window.location.search).get('category');
  app.innerHTML = catalogTemplate({ productsHtml: '', user: getCurrentUser(), isCatalog: true, heading: category || 'Каталог товаров' });
  const page = app.querySelector('.catalog-page');
  const grid = page.querySelector('.catalog-page__grid');
  const loadMoreWrap = page.querySelector('.catalog-page__load-more-wrap');
  const loadMoreButton = loadMoreWrap.querySelector('button');
  const searchForm = page.querySelector('[data-catalog-search]');
  const searchInput = searchForm.querySelector('input[name="query"]');
  let products = null;
  let nextCursor = '';

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
      grid.textContent = category ? 'В этой категории пока нет товаров.' : 'Товары пока не добавлены.';
      return;
    }

    const query = searchInput.value.trim().toLocaleLowerCase();
    const matchingProducts = products.filter((product) =>
      product.title.toLocaleLowerCase().includes(query));

    if (matchingProducts.length === 0) {
      grid.textContent = 'Среди загруженных товаров ничего не найдено.';
      return;
    }

    renderProducts(grid, matchingProducts, cart.getProductQuantity, cart.canUseCart());
  }

  function acceptProducts(loadedProducts, cursor) {
    products = loadedProducts;
    nextCursor = cursor;
    loadMoreWrap.hidden = !nextCursor;
    showProducts();
  }

  function appendProducts(loadedProducts, cursor) {
    acceptProducts([...products, ...loadedProducts], cursor);
  }

  grid.setAttribute('aria-busy', 'true');
  grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';

  loadProducts(grid, page, category, '', acceptProducts).finally(() => grid.setAttribute('aria-busy', 'false'));

  loadMoreButton.addEventListener('click', async () => {
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = 'Загрузка…';
    const loaded = await loadProducts(grid, page, category, nextCursor, appendProducts);
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = loaded ? 'Показать ещё' : 'Не удалось загрузить. Повторить';
  });

  searchForm.addEventListener('submit', (event) => event.preventDefault());
  searchInput.addEventListener('input', showProducts);

  grid.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry-products]')) {
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';
      loadProducts(grid, page, category, '', acceptProducts).finally(() => grid.setAttribute('aria-busy', 'false'));
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
