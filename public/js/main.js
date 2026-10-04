import { loadTemplates } from './templates/templates.js';
import { renderCatalogPage } from './pages/catalog/catalog.js';
import { renderLoginPage } from './pages/login/login.js';
import { renderSignupPage } from './pages/signup/signup.js';

const app = document.getElementById('app');
const pages = { catalog: renderCatalogPage, login: renderLoginPage, signup: renderSignupPage };

/**
 * Показывает выбранный экран внутри корневого контейнера.
 * @param {string} name Имя экрана.
 * @returns {void}
 */
function showPage(name) {
  if (Object.hasOwn(pages, name)) {
    pages[name](app);
  }
}

/** Загружает шаблоны и подключает переключение экранов без перезагрузки. */
async function startApplication() {
  try {
    await loadTemplates();
    app.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-page]');
      if (!link) {
        return;
      }
      event.preventDefault();
      showPage(link.dataset.page);
    });
    showPage('catalog');
  } catch {
    app.textContent = 'Не удалось загрузить приложение. Обновите страницу.';
  }
}

startApplication();
