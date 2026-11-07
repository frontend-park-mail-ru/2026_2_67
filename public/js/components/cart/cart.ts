import { cartTemplate } from '../../templates/templates.js';
import { addBasketProduct, getBasket, setBasketProductCount } from './cart-api.js';
import { mapBasket } from './cart-model.js';
import type { CartItem, CartModel } from './cart-model.js';

const priceFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const itemCountRules = new Intl.PluralRules('ru-RU');
const itemCountWords: Record<string, string> = { one: 'товар', few: 'товара', many: 'товаров', other: 'товара' };

export interface CartController {
  getProductQuantity(productId: number): number;
  getItems(): CartItem[];
  getDisplayCount(): string;
  getDisplayTotal(): string;
  isLoading(): boolean;
  canUseCart(): boolean;
  canCheckout(): boolean;
  getErrorMessage(): string;
  reloadCart(): Promise<void>;
  changeProductQuantity(productId: number, change: number): void;
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
  const cartPanel = requireCartElement(page, '#cart-panel');
  const productGrid = page.querySelector('.catalog-page__grid');
  let cart: CartModel | null = null;
  let isUpdating = false;
  let errorMessage = '';

  function getItems(): CartItem[] {
    return cart?.items ?? [];
  }

  function getProductQuantity(productId: number): number {
    return getItems().find((item) => item.id === productId)?.quantity ?? 0;
  }

  function canCheckout(): boolean {
    return Boolean(cart?.items.length) && !isUpdating;
  }

  function isLoading(): boolean {
    return Boolean(userId) && cart === null && !errorMessage;
  }

  function getDisplayCount(): string {
    if (isLoading()) {
      return 'Загрузка…';
    }
    if (errorMessage) {
      return '—';
    }
    const count = getItems().reduce((sum, item) => sum + item.quantity, 0);
    return `${count} ${itemCountWords[itemCountRules.select(count)]}`;
  }

  function getDisplayTotal(): string {
    if (isLoading()) {
      return 'Загрузка…';
    }
    if (errorMessage) {
      return '—';
    }
    return `${priceFormatter.format(cart?.priceSum ?? 0)} ₽`;
  }

  function renderCart(): void {
    cartPanel.innerHTML = cartTemplate({
      items: getItems(),
      loading: isLoading(),
      errorMessage,
      canUseCart: Boolean(cart) && !isUpdating,
      itemCountText: getDisplayCount(),
      totalPrice: getDisplayTotal(),
    });
  }

  function updatePage(productId: number | null): void {
    renderCart();
    onCartChange(productId);
  }

  async function loadCart(): Promise<void> {
    if (!userId) {
      return;
    }
    try {
      cart = mapBasket(await getBasket(userId));
      errorMessage = '';
    } catch {
      cart = null;
      errorMessage = 'Не удалось загрузить корзину. Обновите страницу и попробуйте снова.';
    }
    updatePage(null);
  }

  function setActionButtonsDisabled(disabled: boolean): void {
    page.querySelectorAll('.product-card__cart-actions button, .cart-item button').forEach((button) => {
      if (button instanceof HTMLButtonElement) button.disabled = disabled;
    });
  }

  async function saveProductCount(productId: number, newCount: number): Promise<void> {
    if (!userId || !cart || isUpdating || !Number.isInteger(productId) || productId <= 0) {
      return;
    }

    const currentCount = getProductQuantity(productId);
    if (!Number.isInteger(newCount) || newCount < 0) {
      return;
    }
    if (newCount === currentCount || (currentCount === 0 && newCount !== 1)) {
      return;
    }

    isUpdating = true;
    setActionButtonsDisabled(true);
    try {
      if (currentCount === 0) {
        await addBasketProduct(userId, productId);
      } else {
        await setBasketProductCount(userId, productId, newCount);
      }
      cart = mapBasket(await getBasket(userId));
      errorMessage = '';
    } catch {
      cart = null;
      errorMessage = 'Не удалось обновить корзину. Обновите страницу и попробуйте снова.';
    } finally {
      isUpdating = false;
      updatePage(cart ? productId : null);
      setActionButtonsDisabled(!cart);
    }
  }

  function changeProductQuantity(productId: number, change: number): void {
    const currentCount = getProductQuantity(productId);
    if (currentCount > 0) {
      saveProductCount(productId, Math.max(0, currentCount + change));
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

  function handleCartButtonClick(event: Event): void {
    event.stopPropagation();
    if (!userId && cartPanel.hidden) {
      cartPanel.innerHTML = cartTemplate({ isGuest: true });
      cartPanel.style.width = 'min(348px, calc(100vw - 32px))';
      cartPanel.style.height = '222px';
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

  if (userId) {
    renderCart();
    loadCart();
  }
  productGrid?.addEventListener('click', handleProductButtonClick);
  cartPanel.addEventListener('click', handleCartItemClick);
  cartPanel.addEventListener('click', handleCloseButtonClick);
  cartButton.addEventListener('click', handleCartButtonClick);
  page.addEventListener('click', handleOutsideClick);

  return {
    getProductQuantity,
    getItems,
    getDisplayCount,
    getDisplayTotal,
    isLoading,
    canUseCart: () => Boolean(cart) && !isUpdating,
    canCheckout,
    getErrorMessage: () => errorMessage,
    reloadCart: loadCart,
    changeProductQuantity,
    removeProduct,
  };
}
