import { loadTemplates } from './templates/templates.js';
import { renderCatalogPage } from './pages/catalog/catalog.js';
import { renderLoginPage } from './pages/login/login.js';
import { renderSignupPage } from './pages/signup/signup.js';
import { renderProfilePage } from './pages/profile/profile.js';
import { renderCartPage } from './pages/cart/cart-page.js';
import { renderCheckoutPage } from './pages/checkout/checkout-page.js';
import { logout, restoreSession } from './shared/auth.js';

const app = document.getElementById('app');
const pathsByPage = { catalog: '/', login: '/login', signup: '/signup', profile: '/profile', cart: '/cart', checkout: '/checkout' };
const routes = {
  '/': () => renderCatalogPage(app),
  '/login': () => renderLoginPage(app, () => navigate('/')),
  '/signup': () => renderSignupPage(app, () => navigate('/')),
  '/profile': () => renderProfilePage(app),
  '/cart': () => renderCartPage(app),
  '/checkout': () => renderCheckoutPage(app),
};

/**
 * Renders the page for the current URL and normalizes unknown routes to the catalog.
 * @returns {void}
 */
function renderCurrentRoute() {
  const renderPage = routes[window.location.pathname];
  if (renderPage) {
    renderPage();
    return;
  }

  window.history.replaceState({}, '', '/');
  routes['/']();
}

/**
 * Changes the current SPA route without reloading the document.
 * @param {string} path Frontend route.
 * @returns {void}
 */
function navigate(path) {
  closeCatalogMenu();
  if (window.location.pathname + window.location.search !== path) {
    window.history.pushState({}, '', path);
  }
  renderCurrentRoute();
}

/** Закрывает список категорий и снова разрешает прокрутку страницы. */
function closeCatalogMenu() {
  const menu = app.querySelector('#catalog-menu');
  const button = app.querySelector('[data-catalog-toggle]');
  if (menu) menu.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

/** Открывает или закрывает список категорий при повторном нажатии. */
function toggleCatalogMenu() {
  const menu = app.querySelector('#catalog-menu');
  const button = app.querySelector('[data-catalog-toggle]');
  const shouldOpen = menu.hidden;
  menu.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', String(shouldOpen));
  document.body.style.overflow = shouldOpen ? 'hidden' : '';
}

/** Загружает шаблоны и подключает переключение экранов без перезагрузки. */
async function startApplication() {
  try {
    await loadTemplates();
    app.addEventListener('click', (event) => {
      const catalogButton = event.target.closest('[data-catalog-toggle]');
      if (catalogButton) {
        toggleCatalogMenu();
        return;
      }

      // Открываем каталог с категорией в адресе, чтобы ссылку можно было сохранить.
      const categoryButton = event.target.closest('[data-category]');
      if (categoryButton) {
        navigate(`/?${new window.URLSearchParams({ category: categoryButton.dataset.category })}`);
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
      const path = pathsByPage[link.dataset.page];
      if (!path) {
        return;
      }
      event.preventDefault();
      navigate(path);
    });
    // Клик вне панели и кнопки закрывает список без перехода на другую страницу.
    document.addEventListener('click', (event) => {
      const menu = app.querySelector('#catalog-menu');
      if (menu && !menu.hidden && !event.target.closest('#catalog-menu, [data-catalog-toggle]')) {
        closeCatalogMenu();
      }
    });
    // Escape закрывает панель и возвращает фокус на кнопку «Каталог».
    document.addEventListener('keydown', (event) => {
      const menu = app.querySelector('#catalog-menu');
      if (event.key === 'Escape' && menu && !menu.hidden) {
        closeCatalogMenu();
        app.querySelector('[data-catalog-toggle]')?.focus();
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

startApplication();
