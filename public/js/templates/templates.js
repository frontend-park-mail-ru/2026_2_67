export let catalogTemplate;
export let cartTemplate;
export let cartItemsTemplate;
export let loginTemplate;
export let productCardTemplate;
export let signupTemplate;

/**
 * Загружает локальный шаблон и компилирует его.
 * @param {string} name Имя файла без расширения.
 * @returns {Promise<Function>} Функция отображения шаблона.
 */
async function loadTemplate(name) {
  const response = await fetch(new URL(`./${name}.hbs`, import.meta.url));
  if (!response.ok) {
    throw new Error(`Не удалось загрузить шаблон ${name}: ${response.status}`);
  }
  return Handlebars.compile(await response.text());
}

/**
 * Подготавливает шаблоны перед первым отображением приложения.
 * @returns {Promise<void>}
 */
export async function loadTemplates() {
  const headerResponse = await fetch(new URL('./site-header.hbs', import.meta.url));
  if (!headerResponse.ok) {
    throw new Error(`Не удалось загрузить шаблон шапки: ${headerResponse.status}`);
  }
  Handlebars.registerPartial('siteHeader', await headerResponse.text());

  const footerResponse = await fetch(new URL('./site-footer.hbs', import.meta.url));
  if (!footerResponse.ok) {
    throw new Error(`Не удалось загрузить шаблон футера: ${footerResponse.status}`);
  }
  Handlebars.registerPartial('siteFooter', await footerResponse.text());

  const cartItemsResponse = await fetch(new URL('./cart-items.hbs', import.meta.url));
  if (!cartItemsResponse.ok) {
    throw new Error(`Не удалось загрузить шаблон товаров корзины: ${cartItemsResponse.status}`);
  }
  const cartItemsSource = await cartItemsResponse.text();
  Handlebars.registerPartial('cartItems', cartItemsSource);
  cartItemsTemplate = Handlebars.compile(cartItemsSource);

  [catalogTemplate, cartTemplate, loginTemplate, productCardTemplate, signupTemplate] = await Promise.all([
    loadTemplate('catalog'),
    loadTemplate('cart'),
    loadTemplate('login'),
    loadTemplate('product-card'),
    loadTemplate('signup'),
  ]);
}
