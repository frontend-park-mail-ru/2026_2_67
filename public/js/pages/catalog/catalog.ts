import {
  createProductCard,
  initProductCard,
} from '../../components/product-card/product-card.js';
import { catalogTemplate } from '../../templates/templates.js';
import { mapApiProduct } from '../../data/map-api-product.js';
import { rememberProducts } from '../../data/product-session.js';
import type { ApiProduct, ProductCard } from '../../data/map-api-product.js';
import { initCart } from '../../components/cart/cart.js';
import { updateCartMarkup } from '../../components/cart/cart-dom.js';
import {
  authorizedFetch,
  getCurrentUser,
  loadCurrentUser,
} from '../../shared/auth.js';

type ProductsCallback = (products: ProductCard[], cursor: string) => void;

function requireHTMLElement(parent: Element, selector: string): HTMLElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Не найден элемент каталога: ${selector}`);
  return element;
}

function requireButton(parent: Element, selector: string): HTMLButtonElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Не найдена кнопка каталога: ${selector}`);
  return element;
}

function requireInput(parent: Element, selector: string): HTMLInputElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Не найдено поле каталога: ${selector}`);
  return element;
}

function renderProducts(grid: HTMLElement, products: ProductCard[], getCartQuantity: (productId: number) => number, isIncreaseDisabled: (productId: number) => boolean, canUseCart: boolean): void {
  const showAddToCartButton = !getCurrentUser() || canUseCart;
  grid.innerHTML = products.map((product) =>
    createProductCard(product, showAddToCartButton && Number.isInteger(product.id), getCartQuantity(product.id), isIncreaseDisabled(product.id))).join('');
  grid.querySelectorAll('[data-product-card]').forEach((card, index) => {
    if (card instanceof HTMLElement) initProductCard(card, products[index]);
  });
}

async function loadProducts(grid: HTMLElement, page: HTMLElement, category: string | null, cursor: string, onProducts: ProductsCallback): Promise<boolean> {
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

    const result: unknown = await response.json();
    if (typeof result !== 'object' || result === null || !('products' in result) || !Array.isArray(result.products)) {
      throw new Error('Products response must contain an array of products.');
    }

    if (page !== grid.closest('.catalog-page')) {
      return false;
    }

    // The existing API check covers the array only, not the item fields or cursor.
    const apiProducts: unknown[] = result.products;
    rememberProducts(apiProducts as ApiProduct[]);
    const next = 'nextCursor' in result ? result.nextCursor : undefined;
    onProducts(apiProducts.map((product) => mapApiProduct(product as ApiProduct)), (next || '') as string);
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
export function renderCatalogPage(app: HTMLElement): void {
  const category = new window.URLSearchParams(window.location.search).get('category');
  app.innerHTML = catalogTemplate({ productsHtml: '', user: getCurrentUser(), isCatalog: true, heading: category || 'Каталог товаров' });
  const page = requireHTMLElement(app, '.catalog-page');
  const grid = requireHTMLElement(page, '.catalog-page__grid');
  const loadMoreWrap = requireHTMLElement(page, '.catalog-page__load-more-wrap');
  const loadMoreButton = requireButton(loadMoreWrap, 'button');
  const searchForm = requireHTMLElement(page, '[data-catalog-search]');
  const searchInput = requireInput(searchForm, 'input[name="query"]');
  searchInput.value = new window.URLSearchParams(window.location.search).get('query') ?? '';
  let products: ProductCard[] | null = null;
  let nextCursor: string = '';

  const cart = initCart(
    page,
    getCurrentUser()?.userId,
    updateVisibleProductCard,
  );

  function updateVisibleProductCard(productId: number | null): void {
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
    const template = document.createElement('template');
    template.innerHTML = createProductCard(product, true, quantity, cart.isIncreaseDisabled(productId));
    const newControls = template.content.querySelector('[data-cart-controls]');
    if (!newControls) throw new Error('Не найдены элементы управления корзиной.');
    const hadFocus = oldControls.contains(document.activeElement);
    updateCartMarkup(oldControls, newControls.innerHTML);
    oldControls.setAttribute('aria-busy', String(cart.isUpdating()));
    if (hadFocus && !oldControls.contains(document.activeElement)) {
      const focusTarget = oldControls.querySelector('.product-card__decrease:not(:disabled), .product-card__increase:not(:disabled), .product-card__add-to-cart:not(:disabled), .product-card__stock-warning');
      if (!(focusTarget instanceof HTMLElement)) throw new Error('Не найдена кнопка корзины.');
      focusTarget.focus();
    }
  }

  function showProducts(): void {
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

    renderProducts(grid, matchingProducts, cart.getProductQuantity, cart.isIncreaseDisabled, cart.canUseCart());
  }

  function acceptProducts(loadedProducts: ProductCard[], cursor: string): void {
    products = loadedProducts;
    nextCursor = cursor;
    loadMoreWrap.hidden = !nextCursor;
    showProducts();
  }

  function appendProducts(loadedProducts: ProductCard[], cursor: string): void {
    if (products === null) throw new TypeError('Товары ещё не загружены.');
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

  searchInput.addEventListener('input', () => {
    if (!searchInput.value.trim() && new window.URLSearchParams(window.location.search).has('query')) {
      window.history.replaceState({}, '', '/');
    }
    showProducts();
  });

  grid.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-retry-products]')) {
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';
      loadProducts(grid, page, category, '', acceptProducts).finally(() => grid.setAttribute('aria-busy', 'false'));
    }
  });

  const currentUser = getCurrentUser();
  if (currentUser && !currentUser.name) {
    loadCurrentUser().then((user) => {
      if (user?.name && app.querySelector('.catalog-page')) {
        renderCatalogPage(app);
      }
    });
  }
}
