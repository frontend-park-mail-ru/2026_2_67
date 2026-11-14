export type Template = (context?: unknown) => string;

declare const Handlebars: {
  compile(source: string): Template;
  registerPartial(name: string, source: string): void;
};

export let catalogTemplate: Template;
export let categoryButtonsTemplate: Template;
export let cartTemplate: Template;
export let cartItemsTemplate: Template;
export let cartPageTemplate: Template;
export let checkoutPageTemplate: Template;
export let ordersPageTemplate: Template;
export let ordersListTemplate: Template;
export let loginTemplate: Template;
export let productCardTemplate: Template;
export let productPageTemplate: Template;
export let productDetailTemplate: Template;
export let profileTemplate: Template;
export let signupTemplate: Template;

/**
 * Загружает локальный шаблон и компилирует его.
 * @param {string} name Имя файла без расширения.
 * @returns {Promise<Function>} Функция отображения шаблона.
 */
async function loadTemplate(name: string): Promise<Template> {
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

  [categoryButtonsTemplate, catalogTemplate, cartTemplate, cartPageTemplate, checkoutPageTemplate, ordersPageTemplate, ordersListTemplate, loginTemplate, productCardTemplate, profileTemplate, signupTemplate, productPageTemplate, productDetailTemplate] = await Promise.all([
    loadTemplate('category-buttons'),
    loadTemplate('catalog'),
    loadTemplate('cart'),
    loadTemplate('cart-page'),
    loadTemplate('checkout-page'),
    loadTemplate('orders-page'),
    loadTemplate('orders-list'),
    loadTemplate('login'),
    loadTemplate('product-card'),
    loadTemplate('profile'),
    loadTemplate('signup'),
    loadTemplate('product-page'),
    loadTemplate('product-detail'),
  ]);
}
