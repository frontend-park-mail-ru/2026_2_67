import { cartTemplate } from '../../templates/templates.js';
import { addBasketProduct, BasketRequestError, getBasket, getBasketValidity, setBasketProductCount } from './cart-api.js';
import { mapBasket } from './cart-model.js';
import type { CartItem, CartModel } from './cart-model.js';
import { confirmAvailableCount, decorateStockItems, isQuantityRejected, isRequestedCountRejected, isStockRejection, markRejectedCount, reconcileStockState, setUnavailableProducts } from './stock-state.js';
import { updateCartMarkup } from './cart-dom.js';
import { formatMoney } from '../../shared/format-money.js';
import { rememberedProduct } from '../../data/product-session.js';
import { minOrderRemaining } from '../../shared/min-order.js';
import { settings, watchSettings } from '../../shared/onlineconf.js';

const itemCountRules = new Intl.PluralRules('ru-RU');
const itemCountWords: Record<string, string> = { one: 'товар', few: 'товара', many: 'товаров', other: 'товара' };
const VALIDITY_INTERVAL_MS = 5000;

export interface CartController {
  getProductQuantity(productId: number): number;
  getItems(): CartItem[];
  getDisplayItems(): (CartItem & { stockWarning: string; increaseDisabled: boolean })[];
  isIncreaseDisabled(productId: number): boolean;
  isRequestedCountRejected(productId: number, count: number): boolean;
  getDisplayCount(): string;
  getDisplayTotal(): string;
  isLoading(): boolean;
  isUpdating(): boolean;
  canUseCart(): boolean;
  hasItems(): boolean;
  canCheckout(): boolean;
  getMinOrderRemaining(): number;
  getErrorMessage(): string;
  reloadCart(): Promise<void>;
  changeProductQuantity(productId: number, change: number): void;
  addProductQuantity(productId: number, count: number): Promise<boolean>;
  setProductQuantity(productId: number, count: number): Promise<boolean>;
  removeProduct(productId: number): void;
}

function requireCartElement(page: Element, selector: string): HTMLElement {
  const element = page.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error('Не найдены элементы корзины.');
  }
  return element;
}

/** Подключает корзину к странице и возвращает её данные и действия. */
export function initCart(page: Element, userId: string | undefined, onCartChange: (productId: number | null) => void = () => {}): CartController {
  const cartButton = requireCartElement(page, '.site-header__icon--cart');
  const cartCount = requireCartElement(cartButton, '.site-header__cart-count');
  const cartPanel = requireCartElement(page, '#cart-panel');
  let cart: CartModel | null = null;
  let activeRequests = 0;
  let errorMessage = '';
  let validityError = false;
  let cartLoadVersion = 0;
  const versions = new Map<number, number>();
  const committedItems = new Map<number, CartItem>();
  const pendingCounts = new Map<number, number>();
  const stockLimitAttempts = new Set<number>();
  const stockWarningTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const updatedAvailableCounts = new Map<number, number>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const mutationWaiters = new Map<number, Array<{ version: number; resolve: (success: boolean) => void }>>();
  let mutationRunning = false;
  let validityTimer: ReturnType<typeof setInterval> | undefined;
  let validityRequestVersion = 0;
  let validityIndicator = false;

  function getItems(): CartItem[] {
    return cart?.items ?? [];
  }

  function getDisplayItems(): (CartItem & { stockWarning: string; increaseDisabled: boolean })[] {
    return userId ? decorateStockItems(userId, getItems()).map((item) => ({
      ...item,
      stockWarning: item.stockWarning || (stockLimitAttempts.has(item.id) ? 'В наличии больше нет' : ''),
    })) : [];
  }

  function isIncreaseDisabled(productId: number): boolean {
    const available = getAvailableCount(productId);
    return getProductQuantity(productId) >= 99 || (available === 0 && getProductQuantity(productId) === 0)
      || Boolean(userId && isQuantityRejected(userId, productId, getProductQuantity(productId)));
  }

  function getProductQuantity(productId: number): number {
    return getItems().find((item) => item.id === productId)?.quantity ?? 0;
  }

  function hasItems(): boolean {
    return Boolean(cart?.items.length);
  }

  function canCheckout(): boolean {
    return settings.checkoutEnabled && hasItems() && getMinOrderRemaining() === 0 && !isBusy();
  }

  function getMinOrderRemaining(): number {
    return minOrderRemaining(cart?.priceSum ?? 0);
  }

  function isBusy(): boolean {
    return activeRequests > 0 || pendingCounts.size > 0;
  }

  function isLoading(): boolean {
    return Boolean(userId) && cart === null && !errorMessage;
  }

  function getDisplayCount(): string {
    if (isLoading()) {
      return 'Загрузка…';
    }
    if (errorMessage && !cart) {
      return '—';
    }
    const count = getItems().reduce((sum, item) => sum + item.quantity, 0);
    return `${count} ${itemCountWords[itemCountRules.select(count)]}`;
  }

  function getDisplayTotal(): string {
    if (isLoading()) {
      return 'Загрузка…';
    }
    if (errorMessage && !cart) {
      return '—';
    }
    return formatMoney(cart?.priceSum ?? 0);
  }

  function renderCart(): void {
    const count = getItems().reduce((sum, item) => sum + item.quantity, 0);
    cartCount.hidden = count === 0 && !validityIndicator;
    cartCount.textContent = validityIndicator ? '!' : count > 99 ? '99+' : String(count);
    cartCount.classList.toggle('site-header__cart-count--invalid', validityIndicator);
    cartButton.setAttribute('aria-label', count ? `Корзина, ${getDisplayCount()}` : 'Корзина');
    updateCartMarkup(cartPanel, cartTemplate({
      items: getDisplayItems(),
      loading: isLoading(),
      updating: isBusy(),
      errorMessage,
      canUseCart: Boolean(cart),
      itemCountText: getDisplayCount(),
      totalPrice: getDisplayTotal(),
      minOrderAmount: formatMoney(settings.minOrderAmount),
      minOrderRemaining: cart && getMinOrderRemaining() ? formatMoney(getMinOrderRemaining()) : '',
    }));
  }

  function updatePage(productId: number | null): void {
    renderCart();
    onCartChange(productId);
  }

  function getAvailableCount(productId: number): number | undefined {
    const updated = updatedAvailableCounts.get(productId);
    if (updated !== undefined) return updated;
    const product: unknown = rememberedProduct(productId);
    const count = typeof product === 'object' && product !== null && 'availableCount' in product
      ? (product as { availableCount?: unknown }).availableCount : undefined;
    return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : undefined;
  }

  function itemFromProduct(productId: number, count: number): CartItem {
    const product = rememberedProduct(productId);
    return {
      id: productId,
      title: product?.name ?? 'Товар',
      image: product?.pictureUrls?.[0] ?? '',
      unitPrice: product?.priceResult ?? 0,
      price: formatMoney((product?.priceResult ?? 0) * count),
      quantity: count,
    };
  }

  function rebuildCart(): void {
    if (!cart) return;
    const items = [...committedItems.values()]
      .map((item) => {
        const desired = pendingCounts.get(item.id);
        if (desired === undefined) return { ...item };
        return { ...item, quantity: desired, price: formatMoney(item.unitPrice * desired) };
      })
      .filter((item) => item.quantity > 0);
    for (const [productId, desired] of pendingCounts) {
      if (desired <= 0 || committedItems.has(productId)) continue;
      items.push(itemFromProduct(productId, desired));
    }
    cart = { items, priceSum: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) };
  }

  async function loadCart(): Promise<void> {
    if (!userId) {
      return;
    }
    const loadVersion = ++cartLoadVersion;
    try {
      const loadedCart = mapBasket(await getBasket(userId));
      if (loadVersion !== cartLoadVersion) return;
      committedItems.clear();
      loadedCart.items.forEach((item) => committedItems.set(item.id, { ...item }));
      cart = loadedCart;
      rebuildCart();
      reconcileStockState(userId, cart.items);
      errorMessage = '';
    } catch {
      if (loadVersion !== cartLoadVersion) return;
      cart = null;
      errorMessage = 'Не удалось загрузить корзину. Обновите страницу и попробуйте снова.';
    }
    updatePage(null);
  }

  async function checkValidity(): Promise<void> {
    if (!userId) return;
    const requestVersion = ++validityRequestVersion;
    try {
       const validity = await getBasketValidity(userId);
       if (requestVersion !== validityRequestVersion) return;
       for (const { id, newAvailableCount } of validity.products) updatedAvailableCounts.set(id, newAvailableCount);
       setUnavailableProducts(userId, validity.products);
       validityError = false;
        validityIndicator = validity.isInvalid;
       if (validity.isInvalid) {
         shakeValidityIndicator();
       }
    } catch {
      if (requestVersion !== validityRequestVersion) return;
      validityError = true;
    }
    if (!validityError) updatePage(null);
  }

  function shakeValidityIndicator(): void {
    cartCount.classList.remove('site-header__cart-count--shake');
    void cartCount.offsetWidth;
    cartCount.classList.add('site-header__cart-count--shake');
  }

  function scheduleSave(productId: number): void {
    const oldTimer = timers.get(productId);
    if (oldTimer) clearTimeout(oldTimer);
    timers.set(productId, setTimeout(() => {
      timers.delete(productId);
      void drainMutations();
    }, 500));
  }

  function settleMutation(productId: number, version: number, success: boolean): void {
    const waiters = mutationWaiters.get(productId);
    if (!waiters) return;
    const remaining = waiters.filter((waiter) => {
      if (waiter.version > version) return true;
      waiter.resolve(waiter.version === version && success);
      return false;
    });
    if (remaining.length) mutationWaiters.set(productId, remaining);
    else mutationWaiters.delete(productId);
  }

  async function flushProduct(productId: number, target: number, version: number): Promise<void> {
    if (!userId || !cart) return;
    const currentCount = committedItems.get(productId)?.quantity ?? 0;
    activeRequests += 1;
    updatePage(productId);
    try {
      if (currentCount === 0 && target === 0) {
        if ((versions.get(productId) ?? 0) === version) {
          pendingCounts.delete(productId);
          committedItems.delete(productId);
          rebuildCart();
        }
        settleMutation(productId, version, true);
        return;
      }
      if (currentCount === 0) await addBasketProduct(userId, productId, target);
      else await setBasketProductCount(userId, productId, target);
      const serverItems = mapBasket(await getBasket(userId)).items;
      committedItems.clear();
      serverItems.forEach((item) => committedItems.set(item.id, { ...item }));
      if ((versions.get(productId) ?? 0) === version) {
        pendingCounts.delete(productId);
        confirmAvailableCount(userId, productId, target);
        errorMessage = '';
      }
      rebuildCart();
      settleMutation(productId, version, true);
    } catch (error) {
      const stockExceeded = error instanceof BasketRequestError
        && isStockRejection(error.status, error.method, currentCount, target, error.responseBody);
      if (stockExceeded) markRejectedCount(userId, productId, target);
      if (error instanceof BasketRequestError && error.status === 422) shakeValidityIndicator();
      if ((versions.get(productId) ?? 0) === version) {
        pendingCounts.delete(productId);
        rebuildCart();
        errorMessage = stockExceeded
          ? target === 1 ? 'Товара сейчас нет в наличии.' : 'Выбранного количества нет в наличии.'
          : 'Не удалось обновить корзину. Попробуйте снова.';
      }
      settleMutation(productId, version, false);
    } finally {
      activeRequests -= 1;
      updatePage(productId);
    }
  }

  async function drainMutations(): Promise<void> {
    if (mutationRunning || !userId || !cart) return;
    const ready = [...pendingCounts.entries()].find(([productId]) => !timers.has(productId));
    if (!ready) return;
    mutationRunning = true;
    const [productId, target] = ready;
    const version = versions.get(productId) ?? 0;
    try {
      await flushProduct(productId, target, version);
    } finally {
      mutationRunning = false;
      if ([...pendingCounts.keys()].some((id) => !timers.has(id))) void drainMutations();
    }
  }

  function saveProductCount(productId: number, newCount: number): Promise<boolean> {
    if (!userId || !cart || !Number.isInteger(productId) || productId <= 0) {
      return Promise.resolve(false);
    }

    if (!Number.isInteger(newCount) || newCount < 0) {
      return Promise.resolve(false);
    }
    const availableCount = getAvailableCount(productId);
    const currentCount = getProductQuantity(productId);
    if (availableCount !== undefined && newCount > availableCount && newCount > currentCount) {
      stockLimitAttempts.add(productId);
      const timer = stockWarningTimers.get(productId);
      if (timer) clearTimeout(timer);
      stockWarningTimers.set(productId, setTimeout(() => {
        stockWarningTimers.delete(productId);
        stockLimitAttempts.delete(productId);
        if (page.isConnected) updatePage(productId);
      }, 4000));
      updatePage(productId);
      return Promise.resolve(false);
    }
    if (newCount > 99 || newCount === getProductQuantity(productId)) {
      return Promise.resolve(false);
    }
    if (newCount > getProductQuantity(productId) && isRequestedCountRejected(userId, productId, newCount)) return Promise.resolve(false);
    stockLimitAttempts.delete(productId);
    const warningTimer = stockWarningTimers.get(productId);
    if (warningTimer) clearTimeout(warningTimer);
    stockWarningTimers.delete(productId);
    const version = (versions.get(productId) ?? 0) + 1;
    versions.set(productId, version);
    pendingCounts.set(productId, newCount);
    if (!committedItems.has(productId) && newCount > 0) committedItems.set(productId, itemFromProduct(productId, 0));
    rebuildCart();
    errorMessage = '';
    updatePage(productId);
    scheduleSave(productId);
    return new Promise((resolve) => {
      const waiters = mutationWaiters.get(productId) ?? [];
      waiters.push({ version, resolve });
      mutationWaiters.set(productId, waiters);
    });
  }

  function addProductQuantity(productId: number, count: number): Promise<boolean> {
    if (!Number.isInteger(count) || count < 1) return Promise.resolve(false);
    return saveProductCount(productId, getProductQuantity(productId) + count);
  }

  function setProductQuantity(productId: number, count: number): Promise<boolean> {
    if (!cart || !Number.isInteger(count) || count < 1 || count > 99) return Promise.resolve(false);
    if (count === getProductQuantity(productId)) return Promise.resolve(true);
    return saveProductCount(productId, count);
  }

  function changeProductQuantity(productId: number, change: number): void {
    const currentCount = getProductQuantity(productId);
    if (currentCount > 0) {
      const availableCount = updatedAvailableCounts.get(productId);
      const newCount = change < 0 && availableCount !== undefined && currentCount > availableCount
        ? availableCount : Math.max(0, currentCount + change);
      void saveProductCount(productId, newCount);
    }
  }

  function removeProduct(productId: number): void {
    saveProductCount(productId, 0);
  }

  function handleProductButtonClick(event: Event): void {
    if (!(event.target instanceof Element)) return;
    const addButton = event.target.closest('.product-card__add-to-cart');
    const increaseButton = event.target.closest('.product-card__increase');
    const decreaseButton = event.target.closest('.product-card__decrease');
    if (!addButton && !increaseButton && !decreaseButton) {
      return;
    }

    event.stopPropagation();
    if (!userId && addButton) {
      openGuestCartPanel();
      return;
    }
    const card = event.target.closest('[data-product-id]');
    const productId = Number(card?.getAttribute('data-product-id') ?? undefined);
    if (addButton) {
      saveProductCount(productId, 1);
    } else {
      changeProductQuantity(productId, increaseButton ? 1 : -1);
    }
  }

  function handleCartItemClick(event: Event): void {
    if (!(event.target instanceof Element)) return;
    const decreaseButton = event.target.closest('.cart-item__decrease');
    const increaseButton = event.target.closest('.cart-item__increase');
    const removeButton = event.target.closest('.cart-item__remove');
    if (!decreaseButton && !increaseButton && !removeButton) {
      return;
    }

    event.stopPropagation();
    const cartItem = event.target.closest('[data-cart-item-id]');
    if (!cartItem) {
      return;
    }
    const productId = Number(cartItem.getAttribute('data-cart-item-id') ?? undefined);
    if (removeButton) {
      removeProduct(productId);
    } else {
      changeProductQuantity(productId, increaseButton ? 1 : -1);
    }
  }

  function openGuestCartPanel(): void {
    cartPanel.innerHTML = cartTemplate({ isGuest: true });
    cartPanel.style.width = 'min(348px, calc(100vw - 32px))';
    cartPanel.style.height = '222px';
    cartPanel.hidden = false;
    cartButton.setAttribute('aria-expanded', 'true');
  }

  function handleCartButtonClick(event: Event): void {
    event.stopPropagation();
    if (!userId && cartPanel.hidden) {
      openGuestCartPanel();
      return;
    }
    cartPanel.hidden = !cartPanel.hidden;
    cartButton.setAttribute('aria-expanded', String(!cartPanel.hidden));
  }

  function handleCloseButtonClick(event: Event): void {
    if (event.target instanceof Element && event.target.closest('.cart-header__close')) {
      event.stopPropagation();
      cartPanel.hidden = true;
      cartButton.setAttribute('aria-expanded', 'false');
    }
  }

  function handleOutsideClick(event: Event): void {
    if (!cartPanel.hidden && (!(event.target instanceof Node) || !cartPanel.contains(event.target))) {
      cartPanel.hidden = true;
      cartButton.setAttribute('aria-expanded', 'false');
    }
  }

  watchSettings(page, () => updatePage(null));
  if (userId) {
    renderCart();
    loadCart();
    void checkValidity();
    validityTimer = setInterval(() => {
      if (!page.isConnected) {
        if (validityTimer) clearInterval(validityTimer);
        return;
      }
      void checkValidity();
    }, VALIDITY_INTERVAL_MS);
  }
  page.addEventListener('click', handleProductButtonClick);
  page.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('.cart-item__quantity, .product-card__quantity')) return;
    const item = input.closest('[data-cart-item-id], [data-product-id]');
    const productId = Number(item?.getAttribute('data-cart-item-id') ?? item?.getAttribute('data-product-id'));
    const count = input.valueAsNumber;
    void setProductQuantity(productId, count).then(() => {
      if (input.isConnected) input.value = String(getProductQuantity(productId));
    });
    if (!Number.isInteger(count) || count < 1 || count > 99) input.value = String(getProductQuantity(productId));
  });
  cartPanel.addEventListener('click', handleCartItemClick);
  cartPanel.addEventListener('click', handleCloseButtonClick);
  cartButton.addEventListener('click', handleCartButtonClick);
  page.addEventListener('click', handleOutsideClick);

  return {
    getProductQuantity,
    getItems,
    getDisplayItems,
    isIncreaseDisabled,
    isRequestedCountRejected: (productId, count) => {
      const available = getAvailableCount(productId);
      return (available !== undefined && count > available)
        || Boolean(userId && isRequestedCountRejected(userId, productId, count));
    },
    getDisplayCount,
    getDisplayTotal,
    isLoading,
    isUpdating: isBusy,
    canUseCart: () => Boolean(cart),
    hasItems,
    canCheckout,
    getMinOrderRemaining,
    getErrorMessage: () => errorMessage,
    reloadCart: loadCart,
    changeProductQuantity,
    addProductQuantity,
    setProductQuantity,
    removeProduct,
  };
}
