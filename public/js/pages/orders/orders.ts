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

function invalidOrderFields(value: unknown): string[] {
  if (!isRecord(value)) return ['order'];
  const fields: string[] = [];
  const check = (path: string, valid: boolean): void => { if (!valid) fields.push(path); };
  check('id', isInteger(value.id));
  check('number', isInteger(value.number));
  check('status', typeof value.status === 'string');
  check('createdAt', isDate(value.createdAt));
  check('updatedAt', isDate(value.updatedAt));
  const point = value.pickupPoint;
  if (!isRecord(point)) fields.push('pickupPoint');
  else {
    check('pickupPoint.id', isInteger(point.id));
    check('pickupPoint.longitude', typeof point.longitude === 'number' && Number.isFinite(point.longitude));
    check('pickupPoint.latitude', typeof point.latitude === 'number' && Number.isFinite(point.latitude));
    check('pickupPoint.startTime', typeof point.startTime === 'string');
    check('pickupPoint.endTime', typeof point.endTime === 'string');
  }
  check('promocode', value.promocode === null || typeof value.promocode === 'string');
  check('totalCount', isInteger(value.totalCount));
  check('totalPrice', isPrice(value.totalPrice));
  if (!Array.isArray(value.products)) fields.push('products');
  else value.products.forEach((product: unknown, index: number) => {
    if (!isRecord(product)) { fields.push(`products[${index}]`); return; }
    const prefix = `products[${index}]`;
    check(`${prefix}.productId`, isInteger(product.productId));
    for (const key of ['name', 'description', 'category', 'sellerName', 'sellerAvatarUrl']) {
      check(`${prefix}.${key}`, typeof product[key] === 'string');
    }
    check(`${prefix}.pictureUrls`, Array.isArray(product.pictureUrls) && product.pictureUrls.every((url: unknown) => typeof url === 'string'));
    check(`${prefix}.count`, isInteger(product.count));
    check(`${prefix}.unitPrice`, isPrice(product.unitPrice));
    check(`${prefix}.totalPrice`, isPrice(product.totalPrice));
  });
  return fields;
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
    displayNumber: order.number,
    statusName: order.status,
    createdDate: dateFormatter.format(new Date(order.createdAt)),
    updatedDate: dateFormatter.format(new Date(order.updatedAt)),
    formattedTotal: formatMoney(order.totalPrice),
    pickupPoint: {
      ...order.pickupPoint,
      workingHours: `${order.pickupPoint.startTime.slice(0, 5)}–${order.pickupPoint.endTime.slice(0, 5)}`,
    },
    products: order.products.map((product) => ({
      ...product,
      categoryName: product.category,
      sellerDisplayName: product.sellerName,
      sellerAvatar: product.sellerAvatarUrl ? safeImageUrl(product.sellerAvatarUrl) : null,
      formattedUnitPrice: formatMoney(product.unitPrice),
      formattedTotal: formatMoney(product.totalPrice),
      pictures: product.pictureUrls.map(safeImageUrl).filter((url) => url !== null),
    })),
    promocodeCode: order.promocode,
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
      if (!Array.isArray(orders)) throw new Error('Сервер вернул неверный список заказов: поле orders не является массивом.');
      if (!orders.every(isOrder)) {
        const invalidIndex = orders.findIndex((order: unknown) => !isOrder(order));
        const fields = invalidOrderFields(orders[invalidIndex]);
        console.error('Неверный формат заказа:', fields.map((field) => `orders[${invalidIndex}].${field}`).join(', '));
        throw new Error(`Сервер вернул неверный формат заказа. Проверьте поля: ${fields.join(', ')}.`);
      }

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
