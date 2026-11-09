import { initCart } from '../../components/cart/cart.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { ordersPageTemplate, ordersListTemplate } from '../../templates/templates.js';

interface OrderProduct {
  id: number;
  name: string;
  pictureUrl: string;
}

interface OrderSummary {
  orderId: number;
  status: string;
  createdAt: string;
  products?: OrderProduct[];
}

function isOrderProduct(value: unknown): value is OrderProduct {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'number' && Number.isInteger(value.id)
    && 'name' in value && typeof value.name === 'string'
    && 'pictureUrl' in value && typeof value.pictureUrl === 'string';
}

function isOrderSummary(value: unknown): value is OrderSummary {
  return typeof value === 'object' && value !== null
    && 'orderId' in value && typeof value.orderId === 'number' && Number.isInteger(value.orderId)
    && 'status' in value && typeof value.status === 'string'
    && 'createdAt' in value && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && (!('products' in value) || (Array.isArray(value.products) && value.products.every(isOrderProduct)));
}

export async function renderOrdersPage(app: HTMLElement): Promise<void> {
  const user = getCurrentUser();
  app.innerHTML = ordersPageTemplate({ user });
  initCart(app, user?.userId);
  const list = app.querySelector('.orders-page__list');
  if (!(list instanceof HTMLElement)) throw new Error('Не найден список заказов.');

  try {
    // Backend определяет покупателя по токену из authorizedFetch.
    const response = await authorizedFetch('/orders/', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить заказы: ${response.status}`);
    const result: unknown = await response.json();
    const orders: unknown = typeof result === 'object' && result !== null && 'orders' in result ? result.orders : undefined;
    if (!Array.isArray(orders) || !orders.every(isOrderSummary)) throw new Error('Сервер вернул неверный список заказов.');

    // Не обновляем страницу, если пользователь уже ушёл с неё.
    if (!list.isConnected) return;
    list.innerHTML = ordersListTemplate({
      orders: orders.map((order) => ({
        ...order,
        status: order.status === 'Обрабатывается' ? 'Оформлен' : order.status,
        date: new Date(order.createdAt).toLocaleDateString('ru-RU'),
      })),
    });
  } catch (error) {
    if (!list.isConnected) return;
    list.textContent = error instanceof Error ? error.message : 'Не удалось загрузить заказы.';
  }
}
