const routes = {
  catalog: window.OzonApp.renderCatalogPage,
  login: window.OzonApp.renderLoginPage,
  signup: window.OzonApp.renderSignupPage,
};

/**
 * Renders a known application page.
 * @param {HTMLElement} app Main application container.
 * @param {string} page Route name.
 * @returns {boolean} Whether the route was found and rendered.
 */
export function navigate(app, page) {
  const renderPage = routes[page];

  if (typeof renderPage !== 'function') {
    return false;
  }

  renderPage(app);
  return true;
}

/**
 * Starts delegated navigation for elements with a data-page attribute.
 * @param {HTMLElement} app Main application container.
 */
export function initRouter(app) {
  document.addEventListener('click', function handleRouteClick(event) {
    const link = event.target.closest('[data-page]');

    if (!link) {
      return;
    }

    event.preventDefault();
    navigate(app, link.dataset.page);
  });

  navigate(app, 'catalog');
}
