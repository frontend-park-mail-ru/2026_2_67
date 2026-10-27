import { initCart } from '../../components/cart/cart.js';
import { getCurrentUser } from '../../shared/auth.js';
import { checkoutPageTemplate } from '../../templates/templates.js';

/** Показывает контакты из профиля и итоговую сумму перед оформлением заказа. */
export function renderCheckoutPage(app) {
  const user = getCurrentUser();
  app.innerHTML = checkoutPageTemplate({ user });

  const page = app.querySelector('.checkout-page');
  const summaryCount = page.querySelector('.checkout-page__summary-count');
  const subtotal = page.querySelector('.checkout-page__subtotal');
  const totalPrice = page.querySelector('.checkout-page__total-price');
  const cart = initCart(page, user?.userId, renderCheckout);

  function renderCheckout() {
    const itemCountText = cart.getDisplayCount();
    const formattedTotal = cart.getDisplayTotal();

    summaryCount.textContent = itemCountText;
    subtotal.textContent = formattedTotal;
    totalPrice.textContent = formattedTotal;
    page.querySelector('.checkout-page__cart-error').textContent = cart.getErrorMessage();
  }

  const searchForm = page.querySelector('[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());
  renderCheckout();
}
