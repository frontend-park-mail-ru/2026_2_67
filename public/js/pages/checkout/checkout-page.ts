import { initCart } from '../../components/cart/cart.js';
import { updateCartMarkup } from '../../components/cart/cart-dom.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { cartItemsTemplate, checkoutPageTemplate } from '../../templates/templates.js';
import { showPickupList } from './pickup-list.js';
import type { PickupPoint } from './pickup-list.js';
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
  return typeof value === 'object' && value !== null && 'id' in value && 'longitude' in value && 'latitude' in value
    && typeof value.id === 'number' && Number.isInteger(value.id)
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
  const pickupList = requireElement(page, '.checkout-page__pickup-list');
  const submitButton = requireButton(page, '.checkout-page__submit');
  const orderStatus = requireElement(page, '.checkout-page__order-status');
  let selectedPickupPoint: PickupPoint | null = null;
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
    submitButton.disabled = !user?.userId || cart.getItems().length === 0 || !selectedPickupPoint || cart.isUpdating() || isSubmitting || !availabilityConfirmed || previewErrors.size > 0;
  }

  async function checkPreview(coordinates: PickupPoint): Promise<void> {
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
    previewErrors.clear();
    availabilityConfirmed = true;
    renderCheckout();
  }

  pickupButton.addEventListener('click', async () => {
    pickupButton.disabled = true;
    pickupStatus.textContent = 'Загружаем пункты выдачи...';
    try {
      const response = await authorizedFetch('/pickup_points');
      if (!response.ok) throw new Error(`Не удалось загрузить пункты выдачи: ${response.status}`);
      const result: unknown = await response.json();
      const points: unknown = typeof result === 'object' && result !== null && 'pickupPoints' in result ? result.pickupPoints : undefined;
      if (!Array.isArray(points) || !points.every(isPickupPoint)) throw new Error('Сервер вернул неверный список пунктов выдачи.');
      if (points.length === 0) throw new Error('Пункты выдачи пока не добавлены.');

      showPickupList(pickupList, points, async (point, address) => {
        selectedPickupPoint = null;
        availabilityConfirmed = false;
        orderStatus.textContent = '';
        renderCheckout();
        pickupStatus.textContent = 'Проверяем выбранный пункт выдачи...';
        try {
          await checkPreview(point);
          selectedPickupPoint = point;
          pickupStatus.textContent = `Выбран: ${address}`;
          pickupHint.hidden = true;
          renderCheckout();
        } catch (error) {
          pickupStatus.textContent = error instanceof Error ? error.message : 'Не удалось проверить выбранный пункт выдачи.';
        }
      });
      pickupStatus.textContent = 'Выберите пункт выдачи из списка.';
      pickupButton.hidden = true;
    } catch (error) {
      pickupStatus.textContent = error instanceof Error ? error.message : 'Не удалось показать пункты выдачи.';
      pickupList.hidden = true;
    } finally {
      pickupButton.disabled = false;
    }
  });

  submitButton.addEventListener('click', async () => {
    if (submitButton.disabled || isSubmitting || !selectedPickupPoint) {
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    orderStatus.textContent = 'Оформляем заказ…';
    try {
      availabilityConfirmed = false;
      await checkPreview(selectedPickupPoint);
      const response = await authorizedFetch('/orders/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupPointId: selectedPickupPoint.id }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok || typeof result !== 'object' || result === null || !('orderId' in result) || !Number.isInteger(result.orderId)) {
        throw new Error('Заказ не оформлен.');
      }

      orderCompleted = true;
      orderStatus.textContent = `Заказ №${result.orderId} оформлен.`;
      requireElement(page, '.checkout-page__orders-link').hidden = false;
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
