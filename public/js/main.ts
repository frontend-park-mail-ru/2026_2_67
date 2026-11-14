import { loadTemplates } from './templates/templates.js';
import { renderCatalogPage } from './pages/catalog/catalog.js';
import { renderLoginPage } from './pages/login/login.js';
import { renderSignupPage } from './pages/signup/signup.js';
import { renderProfilePage } from './pages/profile/profile.js';
import { renderCartPage } from './pages/cart/cart-page.js';
import { renderCheckoutPage } from './pages/checkout/checkout-page.js';
import { renderOrdersPage } from './pages/orders/orders.js';
import { renderCategories } from './components/categories/categories.js';
import { getCurrentUser, logout, restoreSession } from './shared/auth.js';
import { requiresAuthentication } from './shared/route-guards.js';

function requireApp(): HTMLElement {
  const element = document.getElementById('app');
  if (!element) throw new Error('Контейнер приложения не найден.');
  return element;
}

const app = requireApp();
const themeStorageKey = 'vibemarket-theme';

/** Применяет тему ко всем страницам и обновляет подпись кнопки после отрисовки. */
function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  const button = app.querySelector('[data-theme-toggle]');
  if (!(button instanceof HTMLButtonElement)) return;
  button.textContent = theme === 'dark' ? '☀' : '☾';
  button.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
}

try {
  applyTheme(window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light');
} catch {
  applyTheme('light');
}

const pathsByPage: Record<string, string> = { catalog: '/', login: '/login', signup: '/signup', profile: '/profile', cart: '/cart', checkout: '/checkout', orders: '/orders' };
const routes: Record<string, () => void> = {
  '/': () => renderCatalogPage(app),
  '/login': () => renderLoginPage(app, () => navigate('/')),
  '/signup': () => renderSignupPage(app, () => navigate('/')),
  '/profile': () => renderProfilePage(app),
  '/cart': () => renderCartPage(app),
  '/checkout': () => renderCheckoutPage(app, () => navigate('/cart')),
  '/orders': () => { void renderOrdersPage(app); },
};

/**
 * Renders the page for the current URL and normalizes unknown routes to the catalog.
 * @returns {void}
 */
function renderCurrentRoute(): void {
  if (requiresAuthentication(window.location.pathname, getCurrentUser())) {
    window.history.replaceState({}, '', '/login');
  }

  const renderPage = routes[window.location.pathname];
  if (renderPage) {
    renderPage();
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    void renderCategories(app);
    return;
  }

  window.history.replaceState({}, '', '/');
  routes['/']();
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  void renderCategories(app);
}

/**
 * Changes the current SPA route without reloading the document.
 * @param {string} path Frontend route.
 * @returns {void}
 */
function navigate(path: string): void {
  closeCatalogMenu();
  if (window.location.pathname + window.location.search !== path) {
    window.history.pushState({}, '', path);
  }
  renderCurrentRoute();
}

/** Закрывает список категорий и снова разрешает прокрутку страницы. */
function closeCatalogMenu(): void {
  const menu = app.querySelector('#catalog-menu');
  const button = app.querySelector('[data-catalog-toggle]');
  if (menu instanceof HTMLElement) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

/** Открывает или закрывает список категорий при повторном нажатии. */
function toggleCatalogMenu(): void {
  const menu = app.querySelector('#catalog-menu');
  const button = app.querySelector('[data-catalog-toggle]');
  if (!(menu instanceof HTMLElement) || !button) throw new Error('Меню каталога не найдено.');
  const shouldOpen = menu.hidden;
  menu.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', String(shouldOpen));
  document.body.style.overflow = shouldOpen ? 'hidden' : '';
}

/** Загружает шаблоны и подключает переключение экранов без перезагрузки. */
async function startApplication(): Promise<void> {
  try {
    await loadTemplates();
    app.addEventListener('submit', (event) => {
      if (!(event.target instanceof HTMLFormElement) || !event.target.matches('[data-catalog-search]')) return;
      event.preventDefault();
      const input = event.target.querySelector('input[name="query"]');
      if (!(input instanceof HTMLInputElement)) return;
      const query = input.value.trim();
      navigate(query ? `/?${new window.URLSearchParams({ query })}` : '/');
    });
    app.addEventListener('click', (event) => {
      if (event.defaultPrevented) {
        return;
      }
      if (!(event.target instanceof Element)) return;

      const themeButton = event.target.closest('[data-theme-toggle]');
      if (themeButton) {
        const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        try {
          window.localStorage.setItem(themeStorageKey, theme);
        } catch {
          // Если браузер запретил хранилище, тема всё равно меняется до обновления страницы.
        }
        return;
      }

      const catalogButton = event.target.closest('[data-catalog-toggle]');
      if (catalogButton) {
        toggleCatalogMenu();
        return;
      }

      // Открываем каталог с категорией в адресе, чтобы ссылку можно было сохранить.
      const categoryButton = event.target.closest('[data-category]');
      if (categoryButton) {
        navigate(`/?${new window.URLSearchParams({ category: categoryButton.getAttribute('data-category') ?? '' })}`);
        return;
      }

      const logoutButton = event.target.closest('[data-action="logout"]');
      if (logoutButton) {
        logout().finally(() => navigate('/'));
        return;
      }

      const link = event.target.closest('a[data-page]');
      if (!link) {
        return;
      }
      const path = pathsByPage[link.getAttribute('data-page') ?? ''];
      if (!path) {
        return;
      }
      event.preventDefault();
      navigate(path);
    });
    // Клик вне панели и кнопки закрывает список без перехода на другую страницу.
    document.addEventListener('click', (event) => {
      const menu = app.querySelector('#catalog-menu');
      if (menu instanceof HTMLElement && !menu.hidden && (!(event.target instanceof Element) || !event.target.closest('#catalog-menu, [data-catalog-toggle]'))) {
        closeCatalogMenu();
      }
    });
    // Escape закрывает панель и возвращает фокус на кнопку «Каталог».
    document.addEventListener('keydown', (event) => {
      const menu = app.querySelector('#catalog-menu');
      if (event.key === 'Escape' && menu instanceof HTMLElement && !menu.hidden) {
        closeCatalogMenu();
        const button = app.querySelector('[data-catalog-toggle]');
        if (button instanceof HTMLElement) button.focus();
      }
    });
    window.addEventListener('popstate', () => {
      closeCatalogMenu();
      renderCurrentRoute();
    });
    await restoreSession();
    renderCurrentRoute();
  } catch {
    app.textContent = 'Не удалось загрузить приложение. Обновите страницу.';
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((error: unknown) => {
    console.warn('Service Worker registration failed:', error);
  });
}

startApplication();
