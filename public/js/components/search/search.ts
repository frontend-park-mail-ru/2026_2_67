import { productUrl } from '../../shared/product-url.js';

type SearchProduct = { id: number; name: string };
type SearchCategory = { category: string };
type SearchSeller = { name: string };

async function fetchSuggestions<T>(resource: string, key: string, query: string, limit: number, signal: AbortSignal, isItem: (item: unknown) => item is T): Promise<T[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const response = await fetch(`/api/v1/${resource}/search?${params}`, { signal, credentials: 'include' });
  if (!response.ok) throw new Error(`Не удалось загрузить ${resource}.`);
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !(key in result)) {
    throw new Error(`Неверный ответ поиска ${resource}.`);
  }
  const values = (result as Record<string, unknown>)[key];
  if (!Array.isArray(values)) throw new Error(`Неверный ответ поиска ${resource}.`);
  const items: unknown[] = values;
  if (!items.every(isItem)) throw new Error(`Неверные данные поиска ${resource}.`);
  return items.slice(0, limit);
}

function isSearchProduct(item: unknown): item is SearchProduct {
  if (!item || typeof item !== 'object' || !('id' in item) || !('name' in item)) return false;
  return Number.isSafeInteger(item.id) && Number(item.id) > 0 && typeof item.name === 'string';
}

function isSearchCategory(item: unknown): item is SearchCategory {
  return Boolean(item && typeof item === 'object' && 'category' in item && typeof item.category === 'string');
}

function isSearchSeller(item: unknown): item is SearchSeller {
  return Boolean(item && typeof item === 'object' && 'name' in item && typeof item.name === 'string');
}

function highlight(element: HTMLElement, name: string, query: string): void {
  const index = name.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index < 0) { element.textContent = name; return; }
  element.append(document.createTextNode(name.slice(0, index)));
  const mark = document.createElement('mark');
  mark.textContent = name.slice(index, index + query.length);
  element.append(mark, document.createTextNode(name.slice(index + query.length)));
}

/** Подключается один раз к app и работает после замены шапки при SPA-переходах. */
export function initSearch(app: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let activePanel: HTMLElement | null = null;

  function close(): void {
    clearTimeout(timer);
    controller?.abort();
    if (activePanel) activePanel.hidden = true;
    activePanel = null;
  }

  function schedule(input: HTMLInputElement): void {
    close();
    const query = input.value.trim();
    if (query.length < 2) return;
    controller = new AbortController();
    const { signal } = controller;
    const form = input.closest('form');
    const panel = form?.querySelector<HTMLElement>('.site-header__suggestions');
    const products = panel?.querySelector<HTMLUListElement>('[aria-labelledby="search-products-title"] ul');
    const categories = panel?.querySelector<HTMLUListElement>('[aria-labelledby="search-categories-title"] ul');
    const sellers = panel?.querySelector<HTMLUListElement>('[aria-labelledby="search-sellers-title"] ul');
    const categorySection = categories?.closest('section');
    const sellerSection = sellers?.closest('section');
    const productStatus = panel?.querySelector<HTMLElement>('[data-search-products-status]');
    const categoryStatus = panel?.querySelector<HTMLElement>('[data-search-categories-status]');
    const sellerStatus = panel?.querySelector<HTMLElement>('[data-search-sellers-status]');
    if (!panel || !products || !categories || !sellers || !categorySection || !sellerSection || !productStatus || !categoryStatus || !sellerStatus) return;
    const productSection = productStatus.closest('section');
    if (!(productSection instanceof HTMLElement)) return;

    activePanel = panel;
    panel.hidden = true;
    products.replaceChildren();
    categories.replaceChildren();
    sellers.replaceChildren();
    productSection.hidden = true;
    categorySection.hidden = true;
    sellerSection.hidden = true;
    productStatus.textContent = '';
    categoryStatus.textContent = '';
    sellerStatus.textContent = '';
    const isCurrent = () => !signal.aborted && input.isConnected && input.value.trim() === query;

    timer = setTimeout(() => {
      if (!isCurrent()) return;
      void fetchSuggestions('products', 'products', query, 5, signal, isSearchProduct)
        .then((items) => {
          if (!isCurrent()) return;
          for (const product of items) {
            const link = document.createElement('a');
            link.className = 'site-header__suggestion';
            highlight(link, product.name, query);
            link.href = productUrl(product.id, product.name);
            link.dataset.productLink = '';
            const item = document.createElement('li');
            item.append(link);
            products.append(item);
          }
          productStatus.textContent = products.childElementCount ? '' : 'Товары не найдены.';
          productSection.hidden = false;
          panel.hidden = false;
        })
        .catch(() => {
          if (!isCurrent()) return;
          products.replaceChildren();
          productStatus.textContent = 'Не удалось загрузить товары. Измените запрос или повторно выберите поле поиска.';
          productSection.hidden = false;
          panel.hidden = false;
        });

      void fetchSuggestions('categories', 'categories', query, 3, signal, isSearchCategory).then((matches) => {
        if (!isCurrent()) return;
        for (const category of matches) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'site-header__suggestion';
          highlight(button, category.category, query);
          button.dataset.category = category.category;
          const item = document.createElement('li');
          item.append(button);
          categories.append(item);
        }
        categorySection.hidden = matches.length === 0;
        categoryStatus.textContent = '';
        if (matches.length) panel.hidden = false;
      }).catch(() => {
        if (isCurrent()) {
          categorySection.hidden = false;
          categoryStatus.textContent = 'Не удалось загрузить категории. Измените запрос или повторно выберите поле поиска.';
          panel.hidden = false;
        }
      });

      void fetchSuggestions('sellers', 'sellers', query, 3, signal, isSearchSeller).then((matches) => {
        if (!isCurrent()) return;
        for (const seller of matches) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'site-header__suggestion';
          highlight(button, seller.name, query);
          button.dataset.seller = seller.name;
          const item = document.createElement('li');
          item.append(button);
          sellers.append(item);
        }
        sellerSection.hidden = matches.length === 0;
        sellerStatus.textContent = '';
        if (matches.length) panel.hidden = false;
      }).catch(() => {
        if (isCurrent()) {
          sellerSection.hidden = false;
          sellerStatus.textContent = 'Не удалось загрузить продавцов. Измените запрос или повторно выберите поле поиска.';
          panel.hidden = false;
        }
      });
    }, 400);
  }

  function onInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-catalog-search] input')) return;
    if (event.type === 'focusin' && activePanel?.isConnected) return;
    schedule(event.target);
  }
  app.addEventListener('input', onInput);
  app.addEventListener('focusin', onInput);
  app.addEventListener('focusout', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-catalog-search]')
      && (!(event.relatedTarget instanceof Node) || !event.target.closest('form')?.contains(event.relatedTarget))) close();
  });
  app.addEventListener('keydown', (event) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && event.target instanceof Element) {
      const form = event.target.closest('[data-catalog-search]');
      const panel = form?.querySelector<HTMLElement>('.site-header__suggestions');
      if (panel && !panel.hidden) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>('.site-header__suggestion'));
        if (items.length) {
          const current = items.indexOf(event.target as HTMLElement);
          const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length);
          event.preventDefault();
          items[next].focus();
        }
      }
    }
    if (event.key === 'Escape' && event.target instanceof Element && event.target.closest('[data-catalog-search]')) {
      event.preventDefault();
      const input = event.target.closest('form')?.querySelector('input');
      input?.focus();
      close();
    }
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-catalog-search]')) close();
  });
  app.addEventListener('submit', close);
  return close;
}
