import { initCart } from '../../components/cart/cart.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { ordersPageTemplate, ordersListTemplate } from '../../templates/templates.js';
import { formatMoney } from '../../shared/format-money.js';

interface OrderProduct {
  productId: number;
  name: string;
  description: string;
  category: string;
  sellerName: string;
  sellerAvatarUrl: string;
  pictureUrls: string[];
  count: number;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
  id: number;
  number: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  pickupPoint: { id: number; longitude: number; latitude: number; startTime: string; endTime: string };
  promocode: string | null;
  products: OrderProduct[];
  totalCount: number;
  totalPrice: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isProduct(value: unknown): value is OrderProduct {
  return isRecord(value) && isInteger(value.productId)
    && typeof value.name === 'string' && typeof value.description === 'string'
    && typeof value.category === 'string' && typeof value.sellerName === 'string'
    && typeof value.sellerAvatarUrl === 'string'
    && Array.isArray(value.pictureUrls) && value.pictureUrls.every((url: unknown) => typeof url === 'string')
    && isInteger(value.count) && isPrice(value.unitPrice) && isPrice(value.totalPrice);
}

function isOrder(value: unknown): value is Order {
  if (!isRecord(value)) return false;
  const { pickupPoint, promocode } = value;
  return isInteger(value.id) && isInteger(value.number) && typeof value.status === 'string'
    && isDate(value.createdAt) && isDate(value.updatedAt)
    && isRecord(pickupPoint) && isInteger(pickupPoint.id)
    && typeof pickupPoint.longitude === 'number' && Number.isFinite(pickupPoint.longitude)
    && typeof pickupPoint.latitude === 'number' && Number.isFinite(pickupPoint.latitude)
    && typeof pickupPoint.startTime === 'string' && typeof pickupPoint.endTime === 'string'
    && (promocode === null || typeof promocode === 'string')
    && Array.isArray(value.products) && value.products.every(isProduct)
    && isInteger(value.totalCount) && isPrice(value.totalPrice);
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });

// В изображениях допускаем только HTTP(S) и относительные пути, но не произвольные схемы URL.
function safeImageUrl(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function orderView(order: Order) {
  return {
    ...order,
    createdDate: dateFormatter.format(new Date(order.createdAt)),
    updatedDate: dateFormatter.format(new Date(order.updatedAt)),
    formattedTotal: formatMoney(order.totalPrice),
    pickupPoint: {
      ...order.pickupPoint,
      workingHours: `${order.pickupPoint.startTime.slice(0, 5)}–${order.pickupPoint.endTime.slice(0, 5)}`,
    },
    products: order.products.map((product) => ({
      ...product,
      formattedUnitPrice: formatMoney(product.unitPrice),
      formattedTotal: formatMoney(product.totalPrice),
      pictures: product.pictureUrls.map(safeImageUrl).filter((url) => url !== null),
      sellerAvatar: safeImageUrl(product.sellerAvatarUrl),
    })),
  };
}

export async function renderOrdersPage(app: HTMLElement): Promise<void> {
  const user = getCurrentUser();
  app.innerHTML = ordersPageTemplate({ user, isOrders: true });
  initCart(app, user?.userId);
  const list = app.querySelector('.orders-page__list');
  if (!(list instanceof HTMLElement)) throw new Error('Не найден список заказов.');

  async function loadOrders(): Promise<void> {
    if (!(list instanceof HTMLElement)) return;
    list.setAttribute('aria-busy', 'true');
    list.textContent = 'Загружаем заказы…';
    try {
      // Backend определяет покупателя по токену из authorizedFetch.
      const response = await authorizedFetch('/orders', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Не удалось загрузить заказы: ${response.status}`);
      const result: unknown = await response.json();
      const orders: unknown = isRecord(result) ? result.orders : undefined;
      if (!Array.isArray(orders) || !orders.every(isOrder)) throw new Error('Сервер вернул неверный список заказов.');

      if (!list.isConnected) return;
      list.innerHTML = ordersListTemplate({
        orders: orders.map(orderView),
        orderCount: orders.length,
      });
    } catch (error) {
      if (!list.isConnected) return;
      list.replaceChildren();
      const message = document.createElement('p');
      message.className = 'orders-page__error';
      message.setAttribute('role', 'alert');
      message.textContent = error instanceof Error ? error.message : 'Не удалось загрузить заказы.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'orders-page__retry';
      retry.textContent = 'Попробовать снова';
      retry.addEventListener('click', () => { void loadOrders(); });
      list.append(message, retry);
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  await loadOrders();
}
