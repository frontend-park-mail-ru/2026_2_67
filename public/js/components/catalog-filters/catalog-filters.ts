import { authorizedFetch } from '../../shared/auth.js';

export function initCatalogFilters(page: HTMLElement, category: string, query: string, initial: URLSearchParams, onApply: (filters: URLSearchParams) => void): (maxPrice: number) => void {
  const form = page.querySelector<HTMLFormElement>('[data-catalog-filters]');
  const min = form?.elements.namedItem('priceMin');
  const max = form?.elements.namedItem('priceMax');
  const minRange = form?.querySelector<HTMLInputElement>('[data-price-min-range]');
  const maxRange = form?.querySelector<HTMLInputElement>('[data-price-max-range]');
  const track = form?.querySelector<HTMLElement>('.catalog-page__price-sliders');
  const error = form?.querySelector<HTMLElement>('[data-price-error]');
  const sellers = form?.querySelector<HTMLElement>('[data-sellers]');
  const toggle = form?.querySelector<HTMLButtonElement>('[data-seller-toggle]');
  if (!form || !(min instanceof HTMLInputElement) || !(max instanceof HTMLInputElement)
    || !minRange || !maxRange || !track || !error || !sellers || !toggle) throw new Error('Не найдены фильтры каталога.');

  let scaleMax = 300000;
  let expanded = false;
  min.value = initial.has('priceMin') ? String(Number(initial.get('priceMin')) / 100) : '';
  max.value = initial.has('priceMax') ? String(Number(initial.get('priceMax')) / 100) : '';
  const updateTrack = () => {
    track.style.setProperty('--start', `${Number(minRange.value) / scaleMax * 100}%`);
    track.style.setProperty('--end', `${Number(maxRange.value) / scaleMax * 100}%`);
  };
  const validate = (): boolean => {
    const fields = [min, max];
    let message = '';
    if (fields.some((field) => field.validity.badInput || (field.value && !Number.isFinite(Number(field.value))))) message = 'Введите корректную цену.';
    else if (fields.some((field) => field.value && Number(field.value) < 0)) message = 'Цена не может быть отрицательной.';
    else if (fields.some((field) => field.value && Number(field.value) > Number.MAX_SAFE_INTEGER / 100)) message = 'Цена слишком велика.';
    else if (fields.some((field) => field.value && Number(field.value) % 10 !== 0)) message = 'Укажите цену с шагом 10 ₽.';
    else if (min.value && max.value && Number(min.value) > Number(max.value)) message = 'Цена «От» не может превышать цену «До».';
    error.textContent = message;
    error.hidden = !message;
    return !message;
  };
  const syncRange = (field: HTMLInputElement, range: HTMLInputElement) => {
    if (!field.value || field.validity.badInput) range.value = field === min ? '0' : String(scaleMax);
    else range.value = String(Math.min(scaleMax, Math.max(0, Math.round(Number(field.value) / 10) * 10)));
    if (Number(minRange.value) > Number(maxRange.value)) range.value = field === min ? maxRange.value : minRange.value;
    updateTrack();
    validate();
  };
  for (const [field, range] of [[min, minRange], [max, maxRange]] as const) {
    field.addEventListener('input', () => syncRange(field, range));
    range.addEventListener('input', () => {
      if (range === minRange && Number(range.value) > Number(maxRange.value)) range.value = maxRange.value;
      if (range === maxRange && Number(range.value) < Number(minRange.value)) range.value = minRange.value;
      field.value = range.value;
      updateTrack();
      validate();
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validate() || !form.reportValidity()) return;
    const filters = new URLSearchParams();
    if (min.value) filters.set('priceMin', String(Number(min.value) * 100));
    if (max.value) filters.set('priceMax', String(Number(max.value) * 100));
    sellers.querySelectorAll<HTMLInputElement>('input:checked').forEach((input) => filters.append('seller', input.value));
    onApply(filters);
  });
  form.addEventListener('reset', () => {
    onApply(new URLSearchParams());
    queueMicrotask(() => { syncRange(min, minRange); syncRange(max, maxRange); });
  });
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    sellers.querySelectorAll<HTMLElement>('[data-extra-seller]').forEach((row) => { row.hidden = !expanded; });
    toggle.textContent = expanded ? 'Скрыть' : 'Показать ещё';
  });

  void (async () => {
    try {
      const found: { id: number; name: string }[] = [];
      for (let offset = 0; page.isConnected; offset += 30) {
        const params = new URLSearchParams({ category, limit: '30', offset: String(offset) });
        if (query) params.set('query', query);
        const response = await authorizedFetch(`/sellers?${params}`);
        if (!response.ok) throw new Error('Sellers request failed');
        const data: unknown = await response.json();
        if (typeof data !== 'object' || data === null || !('sellers' in data) || !Array.isArray(data.sellers)) throw new Error('Invalid sellers response');
        const batch = data.sellers.filter((item: unknown): item is { id: number; name: string } =>
          typeof item === 'object' && item !== null && 'id' in item && Number.isInteger(item.id)
          && 'name' in item && typeof item.name === 'string');
        found.push(...batch);
        if (data.sellers.length < 30) break;
      }
      if (!page.isConnected) return;
      found.forEach((item, index) => {
        const label = document.createElement('label');
        if (index >= 8) { label.dataset.extraSeller = ''; label.hidden = true; }
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'seller';
        checkbox.value = item.name;
        checkbox.checked = initial.getAll('seller').includes(item.name);
        label.append(checkbox, document.createTextNode(item.name));
        sellers.append(label);
      });
      toggle.hidden = found.length <= 8;
    } catch {
      if (page.isConnected) sellers.textContent = 'Не удалось загрузить продавцов.';
    }
  })();

  return (maxPrice: number) => {
    if (!Number.isFinite(maxPrice) || maxPrice < 0) return;
    const unit = 10 ** Math.max(1, Math.floor(Math.log10(Math.max(maxPrice, 1))) - 1);
    scaleMax = Math.min(300000, Math.max(10, Math.ceil(maxPrice / unit) * unit));
    minRange.max = maxRange.max = String(scaleMax);
    syncRange(min, minRange);
    syncRange(max, maxRange);
  };
}
