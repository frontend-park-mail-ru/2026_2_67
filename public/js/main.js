import Handlebars from 'handlebars';

window.Handlebars = Handlebars;

async function startApplication() {
  await import('./products.js');
  await import('./templates.js');
  await import('./product-card.js');
  await import('./validation.js');
  await import('./pages.js');

  const { initRouter } = await import('./router.js');
  const app = document.getElementById('app');

  if (app) {
    initRouter(app);
  }
}

startApplication();
