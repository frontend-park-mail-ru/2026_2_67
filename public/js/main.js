import { loadTemplates } from './templates/templates.js';
import { renderCatalogPage } from './pages/catalog/catalog.js';
import { renderLoginPage } from './pages/login/login.js';
import { renderSignupPage } from './pages/signup/signup.js';
import { renderProfilePage } from './pages/profile/profile.js';
import { renderCartPage } from './pages/cart/cart-page.js';
import { logout, restoreSession } from './shared/auth.js';

const app = document.getElementById('app');
const pathsByPage = { catalog: '/', login: '/login', signup: '/signup', profile: '/profile', cart: '/cart' };
const routes = {
  '/': () => renderCatalogPage(app),
  '/login': () => renderLoginPage(app, () => navigate('/')),
  '/signup': () => renderSignupPage(app, () => navigate('/')),
  '/profile': () => renderProfilePage(app),
  '/cart': () => renderCartPage(app),
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
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
  renderCurrentRoute();
}

/** Загружает шаблоны и подключает переключение экранов без перезагрузки. */
async function startApplication() {
  try {
    await loadTemplates();
    app.addEventListener('click', (event) => {
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
    window.addEventListener('popstate', renderCurrentRoute);
    await restoreSession();
    renderCurrentRoute();
  } catch {
    app.textContent = 'Не удалось загрузить приложение. Обновите страницу.';
  }
}

startApplication();
