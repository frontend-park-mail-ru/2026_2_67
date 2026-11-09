import { categoryButtonsTemplate } from '../../templates/templates.js';

type Category = {
  category: string;
  pictureUrl: string;
};

async function getCategories(query = ''): Promise<Category[]> {
  const response = await fetch(`/api/v1/categories/${query}`);
  if (!response.ok) throw new Error(`Не удалось загрузить категории: ${response.status}`);

  const result = await response.json() as { categories?: Category[] };
  if (!Array.isArray(result.categories)) throw new Error('Сервер не вернул список категорий.');
  return result.categories;
}

/** Заполняет оба списка категорий после отрисовки шапки страницы. */
export async function renderCategories(app: HTMLElement): Promise<void> {
  const menu = app.querySelector('.site-header__categories');
  const strip = app.querySelector('.site-header__category-strip');
  if (!(menu instanceof HTMLElement) || !(strip instanceof HTMLElement)) return;

  try {
    const [popular, all] = await Promise.all([
      getCategories('?sortBy=popular&limit=9'),
      getCategories(),
    ]);
    if (!menu.isConnected || !strip.isConnected) return;

    menu.innerHTML = categoryButtonsTemplate({ categories: all, isMenu: true });
    strip.innerHTML = categoryButtonsTemplate({ categories: popular, isMenu: false });
  } catch {
    if (menu.isConnected) menu.textContent = 'Не удалось загрузить категории.';
    if (strip.isConnected) strip.textContent = 'Не удалось загрузить категории.';
  }
}
