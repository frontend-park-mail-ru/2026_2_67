import { cartTemplate } from '../../templates/templates.js';
import { addBasketProduct, getBasket, setBasketProductCount } from './cart-api.js';

const priceFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const itemCountRules = new Intl.PluralRules('ru-RU');
const itemCountWords = { one: 'товар', few: 'товара', many: 'товаров', other: 'товара' };

/** Подключает корзину к странице и возвращает её данные и действия. */
export function initCart(page, userId, onCartChange = () => {}) {
  const cartButton = page.querySelector('.site-header__icon--cart');
  const cartPanel = page.querySelector('#cart-panel');
  const productGrid = page.querySelector('.catalog-page__grid');
  let cart = null;
  let isUpdating = false;
  let errorMessage = '';

  function getItems() {
    return cart?.items ?? [];
  }

  function getProductQuantity(productId) {
    return getItems().find((item) => item.id === productId)?.quantity ?? 0;
  }

  function isLoading() {
    return Boolean(userId) && cart === null && !errorMessage;
  }

  function getDisplayCount() {
    if (isLoading()) {
      return 'Загрузка…';
    }
    if (errorMessage) {
      return '—';
    }
    const count = getItems().reduce((sum, item) => sum + item.quantity, 0);
    return `${count} ${itemCountWords[itemCountRules.select(count)]}`;
  }

  function getDisplayTotal() {
    if (isLoading()) {
      return 'Загрузка…';
    }
    if (errorMessage) {
      return '—';
    }
    return `${priceFormatter.format(cart?.priceSum ?? 0)} ₽`;
  }

  function renderCart() {
    cartPanel.innerHTML = cartTemplate({
      items: getItems(),
      loading: isLoading(),
      errorMessage,
      canUseCart: Boolean(cart) && !isUpdating,
      itemCountText: getDisplayCount(),
      totalPrice: getDisplayTotal(),
    });
  }

  function updatePage(productId) {
    renderCart();
    onCartChange(productId);
  }

  function mapBasket(basket) {
    return {
      items: basket.basketProducts.map((product) => ({
        id: product.id,
        title: product.name,
        image: product.pictureUrl,
        price: `${priceFormatter.format(product.price)} ₽`,
        quantity: product.count,
      })),
      priceSum: basket.priceSum,
    };
  }

  async function loadCart() {
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

  function setActionButtonsDisabled(disabled) {
    page.querySelectorAll('.product-card__cart-actions button, .cart-item button').forEach((button) => {
      button.disabled = disabled;
    });
  }

  async function saveProductCount(productId, newCount) {
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

  function changeProductQuantity(productId, change) {
    const currentCount = getProductQuantity(productId);
    if (currentCount > 0) {
      saveProductCount(productId, Math.max(0, currentCount + change));
    }
  }

  function removeProduct(productId) {
    saveProductCount(productId, 0);
  }

  function handleProductButtonClick(event) {
    const addButton = event.target.closest('.product-card__add-to-cart');
    const increaseButton = event.target.closest('.product-card__increase');
    const decreaseButton = event.target.closest('.product-card__decrease');
    if (!addButton && !increaseButton && !decreaseButton) {
      return;
    }

    event.stopPropagation();
    const card = event.target.closest('[data-product-id]');
    const productId = Number(card?.dataset.productId);
    if (addButton) {
      saveProductCount(productId, 1);
    } else {
      changeProductQuantity(productId, increaseButton ? 1 : -1);
    }
  }

  function handleCartItemClick(event) {
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
    const productId = Number(cartItem.dataset.cartItemId);
    if (removeButton) {
      removeProduct(productId);
    } else {
      changeProductQuantity(productId, increaseButton ? 1 : -1);
    }
  }

  function handleCartButtonClick(event) {
    event.stopPropagation();
    if (!userId && cartPanel.hidden) {
      cartPanel.innerHTML = cartTemplate({ isGuest: true });
      cartPanel.style.width = 'min(348px, calc(100vw - 32px))';
      cartPanel.style.height = '222px';
    }
    cartPanel.hidden = !cartPanel.hidden;
    cartButton.setAttribute('aria-expanded', String(!cartPanel.hidden));
  }

  function handleCloseButtonClick(event) {
    if (event.target.closest('.cart-header__close')) {
      event.stopPropagation();
      cartPanel.hidden = true;
      cartButton.setAttribute('aria-expanded', 'false');
    }
  }

  function handleOutsideClick(event) {
    if (!cartPanel.hidden && !cartPanel.contains(event.target)) {
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
    getErrorMessage: () => errorMessage,
    changeProductQuantity,
    removeProduct,
  };
}
