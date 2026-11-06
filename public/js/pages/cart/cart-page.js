import { getCurrentUser } from '../../shared/auth.js';
import { cartItemsTemplate, cartPageTemplate } from '../../templates/templates.js';
import { initCart } from '../../components/cart/cart.js';
import { blockUnavailableNavigation } from '../../shared/route-guards.js';

/** Показывает товары корзины и отдельную плашку с итоговой суммой. */
export function renderCartPage(app) {
  const user = getCurrentUser();
  app.innerHTML = cartPageTemplate({ user });

  const page = app.querySelector('.cart-page');
  const itemsContainer = page.querySelector('.cart-page__items');
  const count = page.querySelector('.cart-page__count');
  const totalPrice = page.querySelector('.cart-page__total-price');
  const checkoutLink = page.querySelector('.cart-page__checkout');
  const cart = initCart(page, user?.userId, renderPageCart);

  function renderPageCart() {
    itemsContainer.innerHTML = cartItemsTemplate({
      items: cart.getItems(),
      loading: cart.isLoading(),
      errorMessage: cart.getErrorMessage(),
      canUseCart: cart.canUseCart(),
    });
    count.textContent = cart.getDisplayCount();
    totalPrice.textContent = cart.getDisplayTotal();
    const canCheckout = cart.canCheckout();
    checkoutLink.setAttribute('aria-disabled', String(!canCheckout));
    checkoutLink.tabIndex = canCheckout ? 0 : -1;
  }

  checkoutLink.addEventListener('click', (event) => {
    blockUnavailableNavigation(event, cart.canCheckout());
  });

  itemsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    const itemElement = button?.closest('[data-cart-item-id]');
    if (!itemElement) {
      return;
    }

    const productId = Number(itemElement.dataset.cartItemId);
    if (button.classList.contains('cart-item__remove')) {
      cart.removeProduct(productId);
    } else if (button.classList.contains('cart-item__increase')) {
      cart.changeProductQuantity(productId, 1);
    } else if (button.classList.contains('cart-item__decrease')) {
      cart.changeProductQuantity(productId, -1);
    }
  });

  const searchForm = page.querySelector('[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());
  renderPageCart();
}
