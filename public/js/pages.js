import { renderAuthPage } from './shared/forms/render-auth-page.js';

window.OzonApp = window.OzonApp || {};

/**
 * Отрисовывает каталог и запускает независимые карточки товаров.
 * @param {HTMLElement} app Главный контейнеh.
 */
window.OzonApp.renderCatalogPage = function renderCatalogPage(app) {
  var productsHtml = window.OzonApp.products.map(window.OzonApp.createProductCard).join('');
  app.innerHTML = window.OzonApp.templates.catalog({ productsHtml: productsHtml });

  app.querySelectorAll('[data-product-card]').forEach(function connectProductCard(card) {
    var productId = Number(card.dataset.productId);
    var product = window.OzonApp.products.find(function findProduct(item) {
      return item.id === productId;
    });
    window.OzonApp.initProductCard(card, product);
  });
};

/**
 * Отрисовывает страницу авторизации.
 * @param {HTMLElement} app Главный контейнер.
 */
window.OzonApp.renderLoginPage = function renderLoginPage(app) {
  renderAuthPage(app, window.OzonApp.templates.login);
};
