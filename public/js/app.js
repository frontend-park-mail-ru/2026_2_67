// Запускаем приложение сразу после загрузки всех JavaScript-файлов.
(function startApplication() {
  // В этот пустой блок JavaScript будет вставлять содержимое нужной страницы.
  var app = document.getElementById('app');
  var pages = {
    catalog: window.OzonApp.renderCatalogPage,
    login: window.OzonApp.renderLoginPage,
    signup: window.OzonApp.renderSignupPage
  };

  // Слушаем клики по ссылкам, у которых есть data-page.
  // Например, у ссылки «Войти» значение data-page равно "login".
  document.addEventListener('click', function handleRouteClick(event) {
    var link = event.target.closest('[data-page]');
    if (!link) {
      return;
    }

    // Отменяем обычный переход браузера и меняем содержимое только внутри #app.
    event.preventDefault();
    pages[link.dataset.page](app);
  });

  // При первом открытии сайта показываем каталог.
  pages.catalog(app);
}());
