import { categoryButtonsTemplate } from '../../templates/templates.js';

type Category = {
  category: string;
  pictureUrl: string;
};

let categoriesPromise: Promise<Category[]> | null = null;

export function getCategories(): Promise<Category[]> {
  if (!categoriesPromise) {
    categoriesPromise = loadCategories().catch((error: unknown) => {
      categoriesPromise = null;
      throw error;
    });
  }
  return categoriesPromise;
}

async function loadCategories(): Promise<Category[]> {
  const response = await fetch('/api/v1/categories/');
  if (!response.ok) throw new Error(`Не удалось загрузить категории: ${response.status}`);

  const result = await response.json() as { categories?: Category[] };
  if (!Array.isArray(result.categories) || !result.categories.every((item) =>
    item && typeof item.category === 'string')) throw new Error('Сервер не вернул список категорий.');
  return result.categories;
}

/** Заполняет выпадающий список категорий после отрисовки шапки страницы. */
export async function renderCategories(app: HTMLElement): Promise<void> {
  const menu = app.querySelector('.site-header__categories');
  if (!(menu instanceof HTMLElement)) return;

  try {
    const all = await getCategories();
    if (!menu.isConnected) return;

    menu.innerHTML = categoryButtonsTemplate({ categories: all });
  } catch {
    if (menu.isConnected) menu.textContent = 'Не удалось загрузить категории.';
  }
}
