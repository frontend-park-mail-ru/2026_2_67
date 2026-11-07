import { initCart } from '../../components/cart/cart.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { cartItemsTemplate, checkoutPageTemplate } from '../../templates/templates.js';
import { showPickupMap } from './pickup-map.js';
import type { PickupPoint } from './pickup-map.js';
import { shouldLeaveEmptyCheckout } from '../../shared/route-guards.js';

function requireElement(parent: Element, selector: string): HTMLElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Не найден элемент оформления заказа: ${selector}`);
  return element;
}

function requireButton(parent: Element, selector: string): HTMLButtonElement {
  const button = parent.querySelector(selector);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Не найдена кнопка оформления заказа: ${selector}`);
  return button;
}

function isPickupPoint(value: unknown): value is PickupPoint {
  return typeof value === 'object' && value !== null && 'longitude' in value && 'latitude' in value
    && typeof value.longitude === 'number' && typeof value.latitude === 'number'
    && Number.isFinite(value.longitude) && Number.isFinite(value.latitude);
}

/** Показывает товары корзины и итоговую сумму перед оформлением заказа. */
export function renderCheckoutPage(app: HTMLElement, onEmptyCart: () => void = () => {}): void {
  const user = getCurrentUser();
  app.innerHTML = checkoutPageTemplate({ user });

  const page = requireElement(app, '.checkout-page');
  const itemsContainer = requireElement(page, '.checkout-page__basket-items');
  const summaryCount = requireElement(page, '.checkout-page__summary-count');
  const subtotal = requireElement(page, '.checkout-page__subtotal');
  const totalPrice = requireElement(page, '.checkout-page__total-price');
  const pickupButton = requireButton(page, '.checkout-page__pickup-button');
  const pickupStatus = requireElement(page, '.checkout-page__pickup-status');
  const pickupHint = requireElement(page, '.checkout-page__pickup-hint');
  const pickupMap = requireElement(page, '.checkout-page__pickup-map');
  const submitButton = requireButton(page, '.checkout-page__submit');
  const orderStatus = requireElement(page, '.checkout-page__order-status');
  let deliveryCoordinates: PickupPoint | null = null;
  let orderCompleted = false;
  const cart = initCart(page, user?.userId, renderCheckout);
  pickupButton.disabled = !user?.userId;

  function renderCheckout(): void {
    if (orderCompleted) {
      return;
    }

    if (shouldLeaveEmptyCheckout({
      isPageActive: page.isConnected,
      isLoading: cart.isLoading(),
      errorMessage: cart.getErrorMessage(),
      canCheckout: cart.canCheckout(),
    })) {
      onEmptyCart();
      return;
    }

    itemsContainer.innerHTML = cartItemsTemplate({
      items: cart.getItems(),
      loading: cart.isLoading(),
      errorMessage: cart.getErrorMessage(),
      readonly: true,
    });
    const itemCountText = cart.getDisplayCount();
    const formattedTotal = cart.getDisplayTotal();

    summaryCount.textContent = itemCountText;
    subtotal.textContent = formattedTotal;
    totalPrice.textContent = formattedTotal;
    submitButton.disabled = !user?.userId || cart.getItems().length === 0 || !deliveryCoordinates;
  }

  const searchForm = requireElement(page, '[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());

  pickupButton.addEventListener('click', () => {
    deliveryCoordinates = null;
    submitButton.disabled = true;
    orderStatus.textContent = '';
    if (!window.navigator.geolocation) {
      pickupStatus.textContent = 'Браузер не поддерживает определение местоположения.';
      return;
    }

    pickupButton.disabled = true;
    pickupMap.hidden = true;
    pickupHint.hidden = false;
    pickupStatus.textContent = 'Определяем ваше местоположение...';
    window.navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        pickupStatus.textContent = 'Ищем ближайший пункт выдачи...';
        if (!user) throw new TypeError('Пользователь не найден.');
        const response = await authorizedFetch(`/buyers/${encodeURIComponent(user.userId)}/basket/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ longitude: coords.longitude, latitude: coords.latitude, promocode: '' }),
        });
        if (!response.ok) {
          throw new Error(`Не удалось найти пункт выдачи: ${response.status}`);
        }

        const result: unknown = await response.json();
        const pickupPoint: unknown = typeof result === 'object' && result !== null && 'pickupPoint' in result ? result.pickupPoint : undefined;
        if (!isPickupPoint(pickupPoint)) {
          throw new Error('Сервер не вернул координаты пункта выдачи.');
        }

        pickupStatus.textContent = 'Загружаем карту...';
        await showPickupMap(pickupMap, pickupPoint);
        pickupStatus.textContent = 'Ближайший пункт выдачи показан на карте.';
        pickupHint.hidden = true;
        deliveryCoordinates = { longitude: coords.longitude, latitude: coords.latitude };
        renderCheckout();
      } catch {
        pickupStatus.textContent = 'Не удалось показать пункт выдачи. Попробуйте ещё раз.';
        pickupMap.hidden = true;
      } finally {
        pickupButton.disabled = false;
      }
    }, () => {
      pickupStatus.textContent = 'Не удалось получить местоположение. Проверьте разрешение в браузере.';
      pickupButton.disabled = false;
    }, { timeout: 10000 });
  });

  submitButton.addEventListener('click', async () => {
    if (submitButton.disabled || !deliveryCoordinates) {
      return;
    }

    submitButton.disabled = true;
    orderStatus.textContent = 'Оформляем заказ…';
    try {
      const response = await authorizedFetch('/orders/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deliveryCoordinates),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok || typeof result !== 'object' || result === null || !('orderId' in result) || !Number.isInteger(result.orderId)) {
        throw new Error('Заказ не оформлен.');
      }

      orderCompleted = true;
      orderStatus.textContent = `Заказ №${result.orderId} оформлен.`;
      submitButton.textContent = 'Заказ оформлен';
      pickupButton.disabled = true;
      requireElement(page, '#checkout-basket-title').textContent = 'Товары в заказе';
      await cart.reloadCart();
    } catch {
      orderStatus.textContent = 'Не удалось оформить заказ. Попробуйте ещё раз.';
    } finally {
      if (!orderCompleted) {
        renderCheckout();
      }
    }
  });

  renderCheckout();
}
