import { initCart } from '../../components/cart/cart.js';
import { updateCartMarkup } from '../../components/cart/cart-dom.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { cartItemsTemplate, checkoutPageTemplate } from '../../templates/templates.js';
import { showPickupMap } from './pickup-map.js';
import type { PickupPoint } from './pickup-map.js';
import { shouldLeaveEmptyCheckout } from '../../shared/route-guards.js';
import { readPreviewProductErrors } from './preview-errors.js';

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

function checkoutWarning(stockWarning: string, previewError: string): string {
  const stock = stockWarning.trim();
  const preview = previewError.trim();
  if (!stock) return preview;
  if (!preview || stock.includes(preview)) return stock;
  if (preview.includes(stock)) return preview;
  return `${stock}. ${preview}`;
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
  let isSubmitting = false;
  let previewErrors = new Map<number, string>();
  let availabilityConfirmed = false;
  const cart = initCart(page, user?.userId, renderCheckout);
  pickupButton.disabled = !user?.userId;

  function renderCheckout(): void {
    if (orderCompleted) {
      return;
    }

    if (!cart.isUpdating() && shouldLeaveEmptyCheckout({
      isPageActive: page.isConnected,
      isLoading: cart.isLoading(),
      errorMessage: cart.getErrorMessage(),
      canCheckout: cart.canCheckout(),
    })) {
      onEmptyCart();
      return;
    }

    updateCartMarkup(itemsContainer, cartItemsTemplate({
      items: cart.getDisplayItems().map((item) => ({
        ...item,
        stockWarning: checkoutWarning(item.stockWarning, previewErrors.get(item.id) || ''),
      })),
      loading: cart.isLoading(),
      updating: cart.isUpdating(),
      errorMessage: cart.getErrorMessage(),
      readonly: true,
    }));
    const itemCountText = cart.getDisplayCount();
    const formattedTotal = cart.getDisplayTotal();

    summaryCount.textContent = itemCountText;
    subtotal.textContent = formattedTotal;
    totalPrice.textContent = formattedTotal;
    submitButton.disabled = !user?.userId || cart.getItems().length === 0 || !deliveryCoordinates || cart.isUpdating() || isSubmitting || !availabilityConfirmed || previewErrors.size > 0;
  }

  async function checkPreview(coordinates: PickupPoint): Promise<PickupPoint> {
    if (!user) throw new Error('Пользователь не найден.');
    const response = await authorizedFetch(`/buyers/${encodeURIComponent(user.userId)}/basket/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ longitude: coordinates.longitude, latitude: coordinates.latitude, promocode: '' }),
    });
    const result: unknown = await response.json().catch(() => ({}));
    const productErrors = response.status === 422 ? readPreviewProductErrors(result) : null;
    if (productErrors) {
      previewErrors = productErrors;
      availabilityConfirmed = false;
      renderCheckout();
      throw new Error('Некоторые товары недоступны. Проверьте корзину.');
    }
    if (!response.ok) throw new Error(`Не удалось проверить наличие: ${response.status}`);
    const pickupPoint: unknown = typeof result === 'object' && result !== null && 'pickupPoint' in result ? result.pickupPoint : undefined;
    if (!isPickupPoint(pickupPoint)) throw new Error('Сервер не вернул координаты пункта выдачи.');
    previewErrors.clear();
    availabilityConfirmed = true;
    renderCheckout();
    return pickupPoint;
  }

  pickupButton.addEventListener('click', () => {
    deliveryCoordinates = null;
    availabilityConfirmed = false;
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
        const pickupPoint = await checkPreview({ longitude: coords.longitude, latitude: coords.latitude });

        pickupStatus.textContent = 'Загружаем карту...';
        await showPickupMap(pickupMap, pickupPoint);
        pickupStatus.textContent = 'Ближайший пункт выдачи показан на карте.';
        pickupHint.hidden = true;
        deliveryCoordinates = { longitude: coords.longitude, latitude: coords.latitude };
        renderCheckout();
      } catch (error) {
        pickupStatus.textContent = error instanceof Error ? error.message : 'Не удалось показать пункт выдачи. Попробуйте ещё раз.';
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
    if (submitButton.disabled || isSubmitting || !deliveryCoordinates) {
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    orderStatus.textContent = 'Оформляем заказ…';
    try {
      availabilityConfirmed = false;
      await checkPreview(deliveryCoordinates);
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
    } catch (error) {
      orderStatus.textContent = error instanceof Error ? error.message : 'Не удалось оформить заказ. Попробуйте ещё раз.';
    } finally {
      isSubmitting = false;
      if (!orderCompleted) {
        renderCheckout();
      }
    }
  });

  renderCheckout();
}
