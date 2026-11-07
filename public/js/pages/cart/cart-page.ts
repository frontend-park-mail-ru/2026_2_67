import { getCurrentUser } from '../../shared/auth.js';
import { cartItemsTemplate, cartPageTemplate } from '../../templates/templates.js';
import { initCart } from '../../components/cart/cart.js';
import type { CartController } from '../../components/cart/cart.js';
import { blockUnavailableNavigation } from '../../shared/route-guards.js';

function requireElement(parent: Element, selector: string): Element {
  const element = parent.querySelector(selector);
  if (!element) throw new Error(`Не найден элемент страницы корзины: ${selector}`);
  return element;
}

function requireCheckoutLink(parent: Element): HTMLAnchorElement {
  const link = requireElement(parent, '.cart-page__checkout');
  if (!(link instanceof HTMLAnchorElement)) {
    throw new Error('Ссылка оформления заказа не найдена.');
  }
  return link;
}

/** Показывает товары корзины и отдельную плашку с итоговой суммой. */
export function renderCartPage(app: HTMLElement): void {
  const user = getCurrentUser();
  app.innerHTML = cartPageTemplate({ user });

  const page = requireElement(app, '.cart-page');
  const itemsContainer = requireElement(page, '.cart-page__items');
  const count = requireElement(page, '.cart-page__count');
  const totalPrice = requireElement(page, '.cart-page__total-price');
  const checkoutLink = requireCheckoutLink(page);
  const userId = user && 'userId' in user && typeof user.userId === 'string' ? user.userId : undefined;
  const cart: CartController = initCart(page, userId, renderPageCart);

  function renderPageCart(): void {
    itemsContainer.innerHTML = cartItemsTemplate({
      items: cart.getDisplayItems(),
      loading: cart.isLoading(),
      updating: cart.isUpdating(),
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
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    const itemElement = button?.closest('[data-cart-item-id]');
    if (!(button instanceof HTMLButtonElement) || !itemElement) {
      return;
    }

    const productId = Number(itemElement.getAttribute('data-cart-item-id') ?? undefined);
    if (button.classList.contains('cart-item__remove')) {
      cart.removeProduct(productId);
    } else if (button.classList.contains('cart-item__increase')) {
      cart.changeProductQuantity(productId, 1);
    } else if (button.classList.contains('cart-item__decrease')) {
      cart.changeProductQuantity(productId, -1);
    }
  });

  renderPageCart();
}
