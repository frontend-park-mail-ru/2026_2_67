window.OzonApp = window.OzonApp || {};

/**
 * Находит Handlebars-шаблон по id и подготавливает его для передачи данных.
 * @param {string} id Идентификатор script-тега с шаблоном.
 * @returns {Function} Функция Handlebars для создания HTML.
 */
function compileTemplate(id) {
  return window.Handlebars.compile(document.getElementById(id).innerHTML);
}

window.OzonApp.templates = {
  catalog: compileTemplate('catalog-template'),
  productCard: compileTemplate('product-card-template'),
  login: compileTemplate('login-template'),
  signup: compileTemplate('signup-template')
};
