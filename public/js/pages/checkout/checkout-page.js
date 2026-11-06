import { initCart } from '../../components/cart/cart.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { cartItemsTemplate, checkoutPageTemplate } from '../../templates/templates.js';
import { showPickupMap } from './pickup-map.js';
import { shouldLeaveEmptyCheckout } from '../../shared/route-guards.js';

/** Показывает товары корзины и итоговую сумму перед оформлением заказа. */
export function renderCheckoutPage(app, onEmptyCart = () => {}) {
  const user = getCurrentUser();
  app.innerHTML = checkoutPageTemplate({ user });

  const page = app.querySelector('.checkout-page');
  const itemsContainer = page.querySelector('.checkout-page__basket-items');
  const summaryCount = page.querySelector('.checkout-page__summary-count');
  const subtotal = page.querySelector('.checkout-page__subtotal');
  const totalPrice = page.querySelector('.checkout-page__total-price');
  const pickupButton = page.querySelector('.checkout-page__pickup-button');
  const pickupStatus = page.querySelector('.checkout-page__pickup-status');
  const pickupHint = page.querySelector('.checkout-page__pickup-hint');
  const pickupMap = page.querySelector('.checkout-page__pickup-map');
  const cart = initCart(page, user?.userId, renderCheckout);
  pickupButton.disabled = !user?.userId;

  function renderCheckout() {
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
  }

  const searchForm = page.querySelector('[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());

  pickupButton.addEventListener('click', () => {
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
        const response = await authorizedFetch(`/buyers/${encodeURIComponent(user.userId)}/basket/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ longitude: coords.longitude, latitude: coords.latitude, promocode: '' }),
        });
        if (!response.ok) {
          throw new Error(`Не удалось найти пункт выдачи: ${response.status}`);
        }

        const { pickupPoint } = await response.json();
        if (!Number.isFinite(pickupPoint?.longitude) || !Number.isFinite(pickupPoint?.latitude)) {
          throw new Error('Сервер не вернул координаты пункта выдачи.');
        }

        pickupStatus.textContent = 'Загружаем карту...';
        await showPickupMap(pickupMap, pickupPoint);
        pickupStatus.textContent = 'Ближайший пункт выдачи показан на карте.';
        pickupHint.hidden = true;
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

  renderCheckout();
}
