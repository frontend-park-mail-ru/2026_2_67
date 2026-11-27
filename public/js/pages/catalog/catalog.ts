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
import { initCatalogFilters } from '../../components/catalog-filters/catalog-filters.js';
import {
  authorizedFetch,
  getCurrentUser,
  loadCurrentUser,
} from '../../shared/auth.js';

interface SavedCatalog {
  entryId: number;
  url: string;
  products: ProductCard[];
  nextCursor: string;
  seenCursors: string[];
  maxPrice: number | null;
  productId: string;
  cardTop: number;
}

let savedCatalog: SavedCatalog | undefined;

type ProductsCallback = (products: ProductCard[], cursor: string, maxPrice: number | null) => void;

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

function renderProducts(grid: HTMLElement, products: ProductCard[], getCartQuantity: (productId: number) => number, isIncreaseDisabled: (productId: number) => boolean, getStockWarning: (productId: number) => string, canUseCart: boolean, append = false): void {
  const showAddToCartButton = !getCurrentUser() || canUseCart;
  const start = append ? grid.children.length : 0;
  const markup = products.map((product) =>
    createProductCard(product, showAddToCartButton && Number.isInteger(product.id), getCartQuantity(product.id), isIncreaseDisabled(product.id), getStockWarning(product.id))).join('');
  if (append) grid.insertAdjacentHTML('beforeend', markup);
  else grid.innerHTML = markup;
  Array.from(grid.querySelectorAll('[data-product-card]')).slice(start).forEach((card, index) => {
    if (card instanceof HTMLElement) initProductCard(card, products[index]);
  });
}

async function loadProducts(page: HTMLElement, category: string | null, seller: string | null, query: string, sortBy: string, filters: URLSearchParams, cursor: string, signal: AbortSignal, onProducts: ProductsCallback): Promise<boolean> {
  try {
    // При следующей загрузке сохраняем категорию и добавляем курсор из прошлого ответа.
    const params = new window.URLSearchParams(filters);
    if (category) params.set('category', category);
    if (seller && !category && !query && !params.has('seller')) params.append('seller', seller);
    if (query) params.set('query', query);
    if (category || query) params.set('sortBy', sortBy);
    if (cursor) params.set('cursor', cursor);
    const path = params.size ? `/products?${params}` : '/products';
    const response = await authorizedFetch(path, { signal });
    if (!response.ok) {
      throw new Error(`Products request failed: ${response.status}`);
    }

    const result: unknown = await response.json();
    if (typeof result !== 'object' || result === null || !('products' in result) || !Array.isArray(result.products)) {
      throw new Error('Products response must contain an array of products.');
    }

    if (signal.aborted || !page.isConnected) {
      return false;
    }

    // The existing API check covers the array only, not the item fields or cursor.
    const apiProducts: unknown[] = result.products;
    rememberProducts(apiProducts as ApiProduct[]);
    const next = 'nextCursor' in result ? result.nextCursor : '';
    if (typeof next !== 'string') throw new Error('Products response has an invalid cursor.');
    const maxPrice = 'priceResultMax' in result && typeof result.priceResultMax === 'number'
      && Number.isFinite(result.priceResultMax) && result.priceResultMax >= 0 ? result.priceResultMax : null;
    onProducts(apiProducts.map((product) => mapApiProduct(product as ApiProduct)), next, maxPrice);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders the catalog and connects each product card.
 * @param {HTMLElement} app Main application container.
 */
export function renderCatalogPage(app: HTMLElement, sortBy = 'new'): void {
  const searchParams = new window.URLSearchParams(window.location.search);
  const savedSort = searchParams.get('sortBy');
  if (savedSort && ['new', 'buy-count', 'asc-price', 'desc-price', 'desc-rating'].includes(savedSort)) sortBy = savedSort;
  const category = searchParams.get('category')?.trim() || null;
  const seller = searchParams.get('seller')?.trim() || null;
  const query = searchParams.get('query')?.trim() ?? '';
  const advancedCatalog = Boolean(category || query);
  const heading = category || (seller ? `Товары продавца: ${seller}` : 'Каталог товаров');
  app.innerHTML = catalogTemplate({ productsHtml: '', user: getCurrentUser(), isCatalog: true, advancedCatalog, heading });
  const page = requireHTMLElement(app, '.catalog-page');
  const sort = page.querySelector<HTMLDetailsElement>('.catalog-page__sort');
  if (sort) {
    const toggle = requireHTMLElement(sort, '.catalog-page__sort-toggle');
    const options = sort.querySelectorAll<HTMLButtonElement>('button');
    options.forEach((option) => {
      const selected = option.dataset.sortBy === sortBy;
      option.setAttribute('aria-pressed', String(selected));
      if (selected) {
        toggle.textContent = option.textContent;
        toggle.setAttribute('aria-label', `Сортировка: ${option.textContent}`);
      }
      option.addEventListener('click', () => {
        options.forEach((item) => item.setAttribute('aria-pressed', String(item === option)));
        toggle.textContent = option.textContent;
        toggle.setAttribute('aria-label', `Сортировка: ${option.textContent}`);
        sort.open = false;
        toggle.focus();
        const selectedSort = option.dataset.sortBy;
        if (!selectedSort || selectedSort === sortBy) return;
        sortBy = selectedSort;
        updateUrl();
        void requestProducts();
      });
    });
    sort.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        sort.open = false;
        toggle.focus();
      }
    });
    sort.addEventListener('focusout', (event) => {
      if (!(event.relatedTarget instanceof Node) || !sort.contains(event.relatedTarget)) {
        sort.open = false;
      }
    });
    page.addEventListener('click', (event) => {
      if (event.target instanceof Node && !sort.contains(event.target)) sort.open = false;
    });
  }
  const grid = requireHTMLElement(page, '.catalog-page__grid');
  const countLabel = page.querySelector<HTMLElement>('[data-product-count]');
  const loadMoreWrap = requireHTMLElement(page, '.catalog-page__load-more-wrap');
  const loadMoreButton = requireButton(loadMoreWrap, 'button');
  const searchForm = requireHTMLElement(page, '[data-catalog-search]');
  const searchInput = requireInput(searchForm, 'input[name="query"]');
  searchInput.value = query;
  let appliedFilters = new URLSearchParams();
  for (const key of advancedCatalog ? ['priceMin', 'priceMax'] : []) {
    const value = searchParams.get(key);
    if (value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) % 1000 === 0) appliedFilters.set(key, value);
  }
  if (appliedFilters.has('priceMin') && appliedFilters.has('priceMax')
    && Number(appliedFilters.get('priceMin')) > Number(appliedFilters.get('priceMax'))) {
    appliedFilters.delete('priceMin');
    appliedFilters.delete('priceMax');
  }
  if (advancedCatalog) searchParams.getAll('seller').filter(Boolean).forEach((value) => appliedFilters.append('seller', value));
  const initialFilters = appliedFilters.toString();
  let maxPriceForFilters: number | null = null;
  let loadedUrl = '';
  function updateUrl(): void {
    const url = new URL(window.location.href);
    for (const key of ['priceMin', 'priceMax', 'seller', 'sortBy']) url.searchParams.delete(key);
    appliedFilters.forEach((value, key) => url.searchParams.append(key, value));
    if (advancedCatalog && sortBy !== 'new') url.searchParams.set('sortBy', sortBy);
    if (url.href !== window.location.href) window.history.pushState({}, '', url);
  }
  const setPriceMax = advancedCatalog ? initCatalogFilters(page, category, query, appliedFilters, (filters) => {
    appliedFilters = filters;
    updateUrl();
    void requestProducts();
  }) : null;
  if (advancedCatalog && initialFilters) {
    void (async () => {
      try {
        const params = new URLSearchParams({ limit: '1' });
        if (category) params.set('category', category);
        if (query) params.set('query', query);
        const response = await authorizedFetch(`/products?${params}`);
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (page.isConnected && typeof data === 'object' && data !== null && 'priceResultMax' in data
          && typeof data.priceResultMax === 'number' && Number.isFinite(data.priceResultMax)) {
          setPriceMax?.(data.priceResultMax);
          maxPriceForFilters = data.priceResultMax;
        }
      } catch { /* The product request still shows the catalog. */ }
    })();
  }
  let products: ProductCard[] | null = null;
  let nextCursor: string = '';
  let requestController: AbortController | undefined;
  let isLoading = false;
  let failed = false;
  const countWords: Record<string, string> = { one: 'товар', few: 'товара', many: 'товаров', other: 'товаров' };
  const plurals = new Intl.PluralRules('ru-RU');
  function updateProductCount(): void {
    if (countLabel && products) countLabel.textContent = `Показано ${products.length} ${countWords[plurals.select(products.length)]}`;
  }
  const seenCursors = new Set<string>();
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    if (!page.isConnected) { observer?.disconnect(); return; }
    if (entries.some((entry) => entry.isIntersecting) && nextCursor && !isLoading && !failed) void requestProducts(true);
  }, { rootMargin: '300px' });
  const removalObserver = new window.MutationObserver(() => {
    if (!page.isConnected) {
      observer?.disconnect();
      requestController?.abort();
      removalObserver.disconnect();
    }
  });
  removalObserver.observe(app, { childList: true });

  const cart = initCart(
    page,
    getCurrentUser()?.userId,
    updateCartControls,
  );

  function getStockWarning(productId: number): string {
    return cart.getDisplayItems().find((item) => item.id === productId)?.stockWarning ?? '';
  }

  function updateCartControls(changedProductId: number | null): void {
    if (!products) return;

    const cards = grid.querySelectorAll('[data-product-card]');
    for (const [index, product] of products.entries()) {
      // При общей проверке обновляем все товары, при изменении количества — один.
      if (changedProductId !== null && product.id !== changedProductId) continue;

      const card = cards[index];
      if (card) updateProductControls(card, product);
    }
  }

  function updateProductControls(card: Element, product: ProductCard): void {
    const productId = product.id;
    const oldControls = card.querySelector('[data-cart-controls]');
    if (!Number.isInteger(productId) || (getCurrentUser() && !cart.canUseCart())) {
      oldControls?.remove();
      return;
    }

    const quantity = cart.getProductQuantity(productId);
    const template = document.createElement('template');
    template.innerHTML = createProductCard(product, true, quantity, cart.isIncreaseDisabled(productId), getStockWarning(productId));
    const newControls = template.content.querySelector('[data-cart-controls]');
    if (!newControls) throw new Error('Не найдены элементы управления корзиной.');
    if (!oldControls) {
      card.append(newControls);
      return;
    }
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
      grid.textContent = query ? 'По вашему запросу ничего не найдено.' : category ? 'В этой категории пока нет товаров.' : 'Товары пока не добавлены.';
      return;
    }

    renderProducts(grid, products, cart.getProductQuantity, cart.isIncreaseDisabled, getStockWarning, cart.canUseCart());
  }

  function acceptProducts(loadedProducts: ProductCard[], cursor: string, maxPrice: number | null): void {
    loadedUrl = window.location.href;
    if (!initialFilters && maxPrice !== null && maxPriceForFilters === null) {
      maxPriceForFilters = maxPrice;
      setPriceMax?.(maxPrice);
    }
    products = loadedProducts;
    nextCursor = cursor;
    loadMoreWrap.hidden = !nextCursor;
    showProducts();
    updateProductCount();
  }

  function appendProducts(loadedProducts: ProductCard[], cursor: string): void {
    if (products === null) throw new TypeError('Товары ещё не загружены.');
    const ids = new Set(products.map((product) => product.id));
    const unique = loadedProducts.filter((product) => !ids.has(product.id) && !!ids.add(product.id));
    products.push(...unique);
    nextCursor = cursor;
    loadMoreWrap.hidden = !nextCursor;
    if (unique.length) renderProducts(grid, unique, cart.getProductQuantity, cart.isIncreaseDisabled, getStockWarning, cart.canUseCart(), true);
    updateProductCount();
  }

  async function requestProducts(append = false): Promise<void> {
    if (append && (isLoading || !nextCursor || seenCursors.has(nextCursor))) return;
    observer?.unobserve(loadMoreWrap);
    isLoading = true;
    failed = false;
    requestController?.abort();
    requestController = new AbortController();
    const { signal } = requestController;
    const requestedCursor = nextCursor;
    const hadProducts = products !== null;
    if (!append) {
      seenCursors.clear();
      nextCursor = '';
      loadMoreWrap.hidden = true;
      if (!hadProducts) grid.innerHTML = '<p class="catalog-page__message" role="status">Загрузка товаров…</p>';
    }
    grid.setAttribute('aria-busy', 'true');
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = 'Загрузка…';
    const loaded = await loadProducts(page, category, seller, query, sortBy, appliedFilters, nextCursor, signal,
      append ? appendProducts : acceptProducts);
    if (signal.aborted || !page.isConnected) { if (!page.isConnected) observer?.disconnect(); return; }
    if (!loaded && !append) {
      if (hadProducts) {
        if (countLabel) countLabel.textContent = 'Не удалось обновить товары';
      } else {
        grid.innerHTML = '<p class="catalog-page__message" role="alert">Не удалось загрузить товары. <button type="button" data-retry-products>Повторить</button></p>';
      }
    }
    if (loaded && append) seenCursors.add(requestedCursor);
    if (loaded && nextCursor && seenCursors.has(nextCursor)) {
      nextCursor = '';
      loadMoreWrap.hidden = true;
      updateProductCount();
    }
    failed = !loaded;
    isLoading = false;
    grid.setAttribute('aria-busy', 'false');
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = loaded ? 'Показать ещё' : 'Не удалось загрузить. Повторить';
    if (loaded && nextCursor && !seenCursors.has(nextCursor)) observer?.observe(loadMoreWrap);
  }

  function restoreCatalog(saved: SavedCatalog): void {
    acceptProducts([...saved.products], saved.nextCursor, saved.maxPrice);
    for (const cursor of saved.seenCursors) {
      seenCursors.add(cursor);
    }

    window.requestAnimationFrame(() => {
      if (!page.isConnected) return;

      const card = grid.querySelector(`[data-product-id="${saved.productId}"]`);
      if (card) {
        const currentTop = card.getBoundingClientRect().top;
        const distance = currentTop - saved.cardTop;
        window.scrollBy(0, distance);
      }

      if (nextCursor) observer?.observe(loadMoreWrap);
    });
  }

  const entryId = window.history.state?.catalogEntry;
  if (savedCatalog && savedCatalog.entryId === entryId && savedCatalog.url === window.location.href) {
    restoreCatalog(savedCatalog);
  } else {
    void requestProducts();
  }

  loadMoreButton.addEventListener('click', () => {
    if (!loadMoreButton.disabled && nextCursor) void requestProducts(true);
  });

  grid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-retry-products]')) {
      void requestProducts();
      return;
    }

    const link = event.target.closest<HTMLAnchorElement>('a[data-product-link]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (link.target === '_blank' || link.origin !== window.location.origin) return;

    const card = link.closest<HTMLElement>('[data-product-id]');
    if (!card?.dataset.productId) return;
    if (!products || loadedUrl !== window.location.href) return;

    const entryId = (savedCatalog?.entryId ?? 0) + 1;
    savedCatalog = {
      entryId,
      url: loadedUrl,
      products: [...products],
      nextCursor,
      seenCursors: [...seenCursors],
      maxPrice: maxPriceForFilters,
      productId: card.dataset.productId,
      cardTop: card.getBoundingClientRect().top,
    };

    const historyState = { ...window.history.state, catalogEntry: entryId };
    window.history.replaceState(historyState, '');
    window.history.scrollRestoration = 'manual';
  });

  const currentUser = getCurrentUser();
  if (currentUser && !currentUser.name) {
    loadCurrentUser().then((user) => {
      if (user?.name && page.isConnected) {
        renderCatalogPage(app, sortBy);
      }
    });
  }
}
