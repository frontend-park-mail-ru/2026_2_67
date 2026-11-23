import { initCart } from '../../components/cart/cart.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { ordersPageTemplate, ordersListTemplate } from '../../templates/templates.js';
import { formatMoney } from '../../shared/format-money.js';

interface OrderProduct {
  id: number;
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
  status: string;
  createdAt: string;
  updatedAt: string;
  pickupPoint: { id: number; longitude: number; latitude: number; startTime: string; endTime: string };
  promocode: string;
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
  return isRecord(value) && isInteger(value.id)
    && typeof value.name === 'string' && typeof value.description === 'string'
    && typeof value.category === 'string' && typeof value.sellerName === 'string'
    && typeof value.sellerAvatarUrl === 'string'
    && Array.isArray(value.pictureUrls) && value.pictureUrls.every((url: unknown) => typeof url === 'string')
    && isInteger(value.count) && isPrice(value.unitPrice) && isPrice(value.totalPrice);
}

function isOrder(value: unknown): value is Order {
  if (!isRecord(value)) return false;
  const { pickupPoint, promocode } = value;
  return isInteger(value.id) && typeof value.status === 'string'
    && isDate(value.createdAt) && isDate(value.updatedAt)
    && isRecord(pickupPoint) && isInteger(pickupPoint.id)
    && typeof pickupPoint.longitude === 'number' && Number.isFinite(pickupPoint.longitude)
    && typeof pickupPoint.latitude === 'number' && Number.isFinite(pickupPoint.latitude)
    && typeof pickupPoint.startTime === 'string' && typeof pickupPoint.endTime === 'string'
    && typeof promocode === 'string'
    && Array.isArray(value.products) && value.products.every(isProduct)
    && isInteger(value.totalCount) && isPrice(value.totalPrice);
}

function invalidOrderFields(value: unknown): string[] {
  if (!isRecord(value)) return ['order'];
  const fields: string[] = [];
  const check = (path: string, valid: boolean): void => { if (!valid) fields.push(path); };
  check('id', isInteger(value.id));
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
  check('promocode', typeof value.promocode === 'string');
  check('totalCount', isInteger(value.totalCount));
  check('totalPrice', isPrice(value.totalPrice));
  if (!Array.isArray(value.products)) fields.push('products');
  else value.products.forEach((product: unknown, index: number) => {
    if (!isRecord(product)) { fields.push(`products[${index}]`); return; }
    const prefix = `products[${index}]`;
    check(`${prefix}.id`, isInteger(product.id));
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
    displayNumber: order.id,
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
      productId: product.id,
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
  const filters = app.querySelector('.orders-page__filters');
  const loading = app.querySelector('.orders-page__loading');
  const more = app.querySelector('.orders-page__load-more');
  const sentinel = app.querySelector('.orders-page__sentinel');
  if (!(list instanceof HTMLElement) || !(filters instanceof HTMLFormElement)
    || !(loading instanceof HTMLElement) || !(more instanceof HTMLButtonElement) || !(sentinel instanceof HTMLElement)) {
    throw new Error('Не найдены элементы страницы заказов.');
  }

  const status = filters.elements.namedItem('status');
  const sortBy = filters.elements.namedItem('sortBy');
  if (!(status instanceof HTMLInputElement) || !(sortBy instanceof HTMLInputElement)) {
    throw new Error('Не найдены фильтры заказов.');
  }
  const statusFilter = filters.querySelector('.orders-page__status-filter');
  const statusToggle = filters.querySelector('.orders-page__status-toggle');
  const statusValue = filters.querySelector('#orders-status-value');
  if (!(statusFilter instanceof HTMLDetailsElement) || !(statusToggle instanceof HTMLElement) || !(statusValue instanceof HTMLElement)) {
    throw new Error('Не найден выбор статуса заказа.');
  }
  const statusOptions = statusFilter.querySelectorAll<HTMLButtonElement>('button[data-status]');
  statusOptions.forEach((option) => option.addEventListener('click', () => {
    const value = option.dataset.status ?? '';
    statusOptions.forEach((item) => item.setAttribute('aria-pressed', String(item === option)));
    statusValue.textContent = option.textContent;
    statusFilter.open = false;
    statusToggle.focus();
    if (status.value === value) return;
    status.value = value;
    status.dispatchEvent(new window.Event('change', { bubbles: true }));
  }));
  statusFilter.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      statusFilter.open = false;
      statusToggle.focus();
    }
  });
  statusFilter.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !statusFilter.contains(event.relatedTarget)) statusFilter.open = false;
  });
  filters.addEventListener('click', (event) => {
    if (event.target instanceof Node && !statusFilter.contains(event.target)) statusFilter.open = false;
  });
  const sortFilter = filters.querySelector('.orders-page__sort-filter');
  const sortToggle = filters.querySelector('.orders-page__sort-toggle');
  const sortValue = filters.querySelector('#orders-sort-value');
  if (!(sortFilter instanceof HTMLDetailsElement) || !(sortToggle instanceof HTMLElement) || !(sortValue instanceof HTMLElement)) {
    throw new Error('Не найдена сортировка заказов.');
  }
  const sortOptions = sortFilter.querySelectorAll<HTMLButtonElement>('button[data-sort-by]');
  sortOptions.forEach((option) => option.addEventListener('click', () => {
    const value = option.dataset.sortBy ?? 'desc-date';
    sortOptions.forEach((item) => item.setAttribute('aria-pressed', String(item === option)));
    sortValue.textContent = option.textContent;
    sortFilter.open = false;
    sortToggle.focus();
    if (sortBy.value === value) return;
    sortBy.value = value;
    sortBy.dispatchEvent(new window.Event('change', { bubbles: true }));
  }));
  sortFilter.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      sortFilter.open = false;
      sortToggle.focus();
    }
  });
  sortFilter.addEventListener('focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !sortFilter.contains(event.relatedTarget)) sortFilter.open = false;
  });
  filters.addEventListener('click', (event) => {
    if (event.target instanceof Node && !sortFilter.contains(event.target)) sortFilter.open = false;
  });

  let cursor = '';
  let hasMore = true;
  let isLoading = false;
  let failed = false;
  let generation = 0;
  let controller: AbortController | null = null;
  const seenIds = new Set<number>();
  const seenCursors = new Set<string>();
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    if (!list.isConnected) { observer?.disconnect(); return; }
    if (entries.some((entry) => entry.isIntersecting) && !failed) void loadOrders();
  }, { rootMargin: '400px' });

  async function loadOrders(): Promise<void> {
    if (!(list instanceof HTMLElement) || !(loading instanceof HTMLElement) || !(more instanceof HTMLButtonElement)
      || !(status instanceof HTMLInputElement) || !(sortBy instanceof HTMLInputElement)
      || isLoading || !hasMore || !list.isConnected) return;
    const requestGeneration = generation;
    const requestCursor = cursor;
    const requestController = new AbortController();
    controller = requestController;
    isLoading = true;
    failed = false;
    observer?.unobserve(sentinel as Element);
    list.setAttribute('aria-busy', 'true');
    loading.className = 'orders-page__loading';
    loading.textContent = 'Загружаем заказы…';
    more.hidden = true;
    try {
      const params = new URLSearchParams({ sortBy: sortBy.value });
      if (status.value) params.set('status', status.value);
      if (requestCursor) params.set('cursor', requestCursor);
      const response = await authorizedFetch(`/orders?${params}`, { cache: 'no-store', signal: requestController.signal });
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
      if (!isRecord(result) || typeof result.nextCursor !== 'string') throw new Error('Сервер вернул неверный курсор заказов.');
      if (result.nextCursor && (result.nextCursor === requestCursor || seenCursors.has(result.nextCursor))) {
        throw new Error('Сервер вернул повторяющийся курсор заказов.');
      }

      if (!list.isConnected || requestGeneration !== generation) return;
      const newOrders = orders.filter((order) => {
        if (seenIds.has(order.id)) return false;
        seenIds.add(order.id);
        return true;
      });
      if (newOrders.length) list.insertAdjacentHTML('beforeend', ordersListTemplate({ orders: newOrders.map(orderView) }));
      cursor = result.nextCursor;
      if (cursor) seenCursors.add(cursor);
      hasMore = Boolean(cursor);
      if (seenIds.size === 0 && !hasMore) list.innerHTML = ordersListTemplate({ orders: [], filtered: Boolean(status.value) });
      loading.textContent = '';
      more.textContent = 'Показать ещё';
      more.hidden = !hasMore;
    } catch (error) {
      if (!list.isConnected || requestGeneration !== generation || requestController.signal.aborted) return;
      failed = true;
      loading.className = 'orders-page__loading orders-page__error';
      loading.textContent = error instanceof Error ? error.message : 'Не удалось загрузить заказы.';
      more.textContent = 'Попробовать снова';
      more.hidden = false;
    } finally {
      if (requestGeneration === generation) {
        isLoading = false;
        controller = null;
        list.setAttribute('aria-busy', 'false');
        if (list.isConnected && hasMore && !failed) observer?.observe(sentinel as Element);
      }
    }
  }

  filters.addEventListener('submit', (event) => event.preventDefault());
  filters.addEventListener('change', () => {
    generation += 1;
    controller?.abort();
    observer?.unobserve(sentinel);
    cursor = '';
    hasMore = true;
    isLoading = false;
    failed = false;
    seenIds.clear();
    seenCursors.clear();
    list.replaceChildren();
    void loadOrders();
  });
  more.addEventListener('click', () => { void loadOrders(); });
  await loadOrders();
}
