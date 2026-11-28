import { authorizedFetch, getCurrentUser } from './auth.js';

const defaults = {
  minOrderAmount: 1000,
  checkoutEnabled: true,
  reviewsEnabled: true,
};

export const settings = { ...defaults };

// Каждая открытая страница передаёт функцию обновления интерфейса.
const pages = new Map<Element, () => void>();

let userId: string | undefined;
let requestNumber = 0;

export function watchSettings(page: Element, update: () => void): void {
  pages.set(page, update);
}

function updatePages(): void {
  for (const [page, update] of pages) {
    if (page.isConnected) {
      update();
    } else {
      pages.delete(page);
    }
  }
}

export async function loadSettings(): Promise<void> {
  requestNumber += 1;
  const thisRequest = requestNumber;
  const thisUser = getCurrentUser()?.userId;

  // При смене аккаунта убираем настройки предыдущего пользователя.
  if (userId !== thisUser) {
    userId = thisUser;
    settings.minOrderAmount = defaults.minOrderAmount;
    settings.checkoutEnabled = defaults.checkoutEnabled;
    settings.reviewsEnabled = defaults.reviewsEnabled;
    updatePages();
  }

  try {
    const response = await authorizedFetch('/onlineconf/runtime/frontend', {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return;

    const data = await response.json();

    // За время запроса мог начаться новый запрос или смениться аккаунт.
    if (thisRequest !== requestNumber) return;
    if (thisUser !== getCurrentUser()?.userId) return;
    if (!data?.configs || !data?.flags) return;

    const amount = data.configs.min_order_amount ?? 0;
    const checkout = data.flags.checkout_enabled ?? false;
    const reviews = data.flags.reviews_enabled ?? false;

    if (typeof amount !== 'number') return;
    if (!Number.isFinite(amount) || amount < 0) return;
    if (typeof checkout !== 'boolean') return;
    if (typeof reviews !== 'boolean') return;

    // Не перерисовываем страницы, если сервер вернул прежние значения.
    if (
      settings.minOrderAmount === amount
      && settings.checkoutEnabled === checkout
      && settings.reviewsEnabled === reviews
    ) {
      return;
    }

    settings.minOrderAmount = amount;
    settings.checkoutEnabled = checkout;
    settings.reviewsEnabled = reviews;
    updatePages();
  } catch {
    // При ошибке соединения оставляем последние полученные настройки.
  }
}
