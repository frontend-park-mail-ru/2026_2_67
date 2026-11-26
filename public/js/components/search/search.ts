import { productUrl } from '../../shared/product-url.js';
import { getCategories } from '../categories/categories.js';

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
    const categorySection = categories?.closest('section');
    const productStatus = panel?.querySelector<HTMLElement>('[data-search-products-status]');
    const categoryStatus = panel?.querySelector<HTMLElement>('[data-search-categories-status]');
    if (!panel || !products || !categories || !categorySection || !productStatus || !categoryStatus) return;
    const productSection = productStatus.closest('section');
    if (!(productSection instanceof HTMLElement)) return;

    activePanel = panel;
    panel.hidden = true;
    products.replaceChildren();
    categories.replaceChildren();
    productSection.hidden = true;
    categorySection.hidden = true;
    productStatus.textContent = '';
    categoryStatus.textContent = '';
    const isCurrent = () => !signal.aborted && input.isConnected && input.value.trim() === query;

    timer = setTimeout(() => {
      if (!isCurrent()) return;
      const params = new URLSearchParams({ query, limit: '5' });
      void fetch(`/api/v1/products?${params}`, { signal, credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Не удалось загрузить товары.');
          const result: unknown = await response.json();
          if (!isCurrent()) return;
          if (!result || typeof result !== 'object' || !('products' in result) || !Array.isArray(result.products)) {
            throw new Error('Неверный ответ поиска.');
          }
          for (const product of result.products.slice(0, 5)) {
            if (!product || !Number.isSafeInteger(product.id) || product.id <= 0 || typeof product.name !== 'string') {
              throw new Error('Неверный товар в ответе поиска.');
            }
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

      void getCategories().then((all) => {
        if (!isCurrent()) return;
        const matches = all.filter((item) => item.category.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 3);
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
          categoryStatus.textContent = 'Не удалось загрузить категории. Измените запрос или повторно выберите поле поиска.';
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
