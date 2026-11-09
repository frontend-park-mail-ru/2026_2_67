import { initCart } from '../../components/cart/cart.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { ordersPageTemplate, ordersListTemplate } from '../../templates/templates.js';

interface NamedEntity {
  id: number;
  name: string;
}

interface OrderProduct {
  id: number;
  productId: number;
  name: string;
  description: string | null;
  category: NamedEntity;
  seller: NamedEntity;
  pictureUrls: string[];
  count: number;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
  id: number;
  status: NamedEntity;
  createdAt: string;
  updatedAt: string;
  pickupPoint: { id: number; longitude: number; latitude: number; startTime: string; endTime: string };
  promocode: {
    id: number;
    code: string;
    discount: number;
    availableCategoryId: number | null;
    startDatetime: string;
    endDatetime: string;
  } | null;
  products: OrderProduct[];
  notifications: { id: number; status: NamedEntity; isRead: boolean; createdAt: string }[];
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

function isNamedEntity(value: unknown): value is NamedEntity {
  return isRecord(value) && isInteger(value.id) && typeof value.name === 'string';
}

function isProduct(value: unknown): value is OrderProduct {
  return isRecord(value) && isInteger(value.id) && isInteger(value.productId)
    && typeof value.name === 'string' && (value.description === null || typeof value.description === 'string')
    && isNamedEntity(value.category) && isNamedEntity(value.seller)
    && Array.isArray(value.pictureUrls) && value.pictureUrls.every((url: unknown) => typeof url === 'string')
    && isInteger(value.count) && isInteger(value.unitPrice) && isInteger(value.totalPrice);
}

function isOrder(value: unknown): value is Order {
  if (!isRecord(value)) return false;
  const { pickupPoint, promocode, notifications } = value;
  return isInteger(value.id) && isNamedEntity(value.status) && isDate(value.createdAt) && isDate(value.updatedAt)
    && isRecord(pickupPoint) && isInteger(pickupPoint.id)
    && typeof pickupPoint.longitude === 'number' && Number.isFinite(pickupPoint.longitude)
    && typeof pickupPoint.latitude === 'number' && Number.isFinite(pickupPoint.latitude)
    && typeof pickupPoint.startTime === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(pickupPoint.startTime)
    && typeof pickupPoint.endTime === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(pickupPoint.endTime)
    && (promocode === null || (isRecord(promocode) && isInteger(promocode.id)
      && typeof promocode.code === 'string' && isInteger(promocode.discount)
      && (promocode.availableCategoryId === null || isInteger(promocode.availableCategoryId))
      && isDate(promocode.startDatetime) && isDate(promocode.endDatetime)))
    && Array.isArray(value.products) && value.products.every(isProduct)
    && Array.isArray(notifications) && notifications.every((notification: unknown) => isRecord(notification)
      && isInteger(notification.id) && isNamedEntity(notification.status)
      && typeof notification.isRead === 'boolean' && isDate(notification.createdAt))
    && isInteger(value.totalCount) && isInteger(value.totalPrice);
}

const priceFormatter = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });

// В изображениях допускаем только HTTP(S) и относительные пути, но не произвольные схемы URL.
function safeImageUrl(value: string): string | null {
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
    formattedTotal: priceFormatter.format(order.totalPrice),
    pickupPoint: {
      ...order.pickupPoint,
      workingHours: `${order.pickupPoint.startTime.slice(0, 5)}–${order.pickupPoint.endTime.slice(0, 5)}`,
    },
    promocode: order.promocode ? {
      ...order.promocode,
      categoryRestriction: order.promocode.availableCategoryId === null
        ? 'Все категории' : `Категория №${order.promocode.availableCategoryId}`,
      startDate: dateFormatter.format(new Date(order.promocode.startDatetime)),
      endDate: dateFormatter.format(new Date(order.promocode.endDatetime)),
    } : null,
    products: order.products.map((product) => ({
      ...product,
      formattedUnitPrice: priceFormatter.format(product.unitPrice),
      formattedTotal: priceFormatter.format(product.totalPrice),
      pictures: product.pictureUrls.map(safeImageUrl).filter((url) => url !== null),
    })),
    notifications: [...order.notifications]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((notification) => ({
        ...notification,
        date: dateFormatter.format(new Date(notification.createdAt)),
      })),
  };
}

export async function renderOrdersPage(app: HTMLElement): Promise<void> {
  const user = getCurrentUser();
  app.innerHTML = ordersPageTemplate({ user });
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
