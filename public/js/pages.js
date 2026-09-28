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
 * Отрисовывает форму 
 * @param {HTMLElement} app Главный контейнер.
 * @param {Function} template Handlebars-шаблон.
 */
function renderAuthPage(app, template) {
  app.innerHTML = template();
  var form = app.querySelector('[data-auth-form]');

  form.addEventListener('submit', function validateBeforeSubmit(event) {
    event.preventDefault();
    var isValid = window.OzonApp.validateAuthForm(form);
    app.querySelector('[data-form-message]').textContent = isValid
      ? ' '
      : 'Исправьте поля с ошибками.';
  });
}

/**
 * Отрисовывает страницу авторизации.
 * @param {HTMLElement} app Главный контейнер.
 */
window.OzonApp.renderLoginPage = function renderLoginPage(app) {
  renderAuthPage(app, window.OzonApp.templates.login);
};

/**
 * Отрисовывает страницу регистрации.
 * @param {HTMLElement} app Главный контейнер.
 */
window.OzonApp.renderSignupPage = function renderSignupPage(app) {
  renderAuthPage(app, window.OzonApp.templates.signup);
};
