import { getCurrentUser } from '../../shared/auth.js';
import { initCart } from '../../components/cart/cart.js';
import { mapApiProduct } from '../../data/map-api-product.js';
import { productDetailTemplate, productPageTemplate } from '../../templates/templates.js';
import { formatProductTotal } from './product-price.js';
import { loadProduct } from './load-product.js';

export async function renderProductPage(app: HTMLElement, id: number, navigate: (path: string) => void): Promise<void> {
  const user = getCurrentUser();
  app.innerHTML = productPageTemplate({ user });
  const page = app.querySelector('.product-page');
  const body = app.querySelector('.product-page__body');
  if (!(page instanceof HTMLElement) || !(body instanceof HTMLElement)) throw new Error('Страница товара не найдена.');

  page.querySelector('[data-product-back]')?.addEventListener('click', (event) => {
    event.preventDefault();
    if (window.history.state?.productFrom) window.history.back();
    else navigate('/');
  });

  let onCartChange = (_productId: number | null): void => {};
  const cart = initCart(page, user?.userId, (productId) => onCartChange(productId));
  const product = await loadProduct(id);
  if (!page.isConnected) return;
  if (!product) {
    body.innerHTML = '<div class="product-page__empty" role="alert"><h1>Не удалось открыть товар</h1><p>Сведения об этом товаре сейчас недоступны. Попробуйте найти его в каталоге.</p><a href="/" data-page="catalog">Перейти в каталог</a></div>';
    body.setAttribute('aria-busy', 'false');
    return;
  }

  const mapped = mapApiProduct(product);
  const unitPrice = product.priceResult;
  const photos = Array.isArray(mapped.images) ? mapped.images.filter((url) => typeof url === 'string' && url.trim()) : [];
  body.innerHTML = productDetailTemplate({
    title: mapped.title,
    price: mapped.price,
    sellerName: mapped.sellerName,
    description: typeof product.description === 'string' ? product.description.trim() : '',
    hasPhotos: photos.length > 0,
    firstPhoto: photos[0],
    photoCount: photos.length,
    hasMultiplePhotos: photos.length > 1,
    photos: photos.map((url, index) => ({ url, index, number: index + 1, active: index === 0 })),
    isGuest: !user,
  });
  body.setAttribute('aria-busy', 'false');

  let imageIndex = 0;
  const image = body.querySelector('[data-detail-image]');
  const thumbs = body.querySelectorAll<HTMLButtonElement>('[data-detail-thumbnail]');
  function showImage(index: number): void {
    if (!(image instanceof HTMLImageElement) || photos.length === 0) return;
    imageIndex = (index + photos.length) % photos.length;
    image.src = photos[imageIndex];
    image.alt = `${mapped.title}, фото ${imageIndex + 1} из ${photos.length}`;
    thumbs.forEach((thumb, thumbIndex) => thumb.setAttribute('aria-pressed', String(thumbIndex === imageIndex)));
  }
  body.querySelector('[data-detail-prev]')?.addEventListener('click', () => showImage(imageIndex - 1));
  body.querySelector('[data-detail-next]')?.addEventListener('click', () => showImage(imageIndex + 1));
  thumbs.forEach((thumb) => thumb.addEventListener('click', () => showImage(Number(thumb.dataset.detailThumbnail))));

  const quantity = body.querySelector<HTMLInputElement>('[data-quantity]');
  const price = body.querySelector<HTMLElement>('.product-page__price');
  const add = body.querySelector<HTMLButtonElement>('[data-detail-add]');
  const plus = body.querySelector<HTMLButtonElement>('[data-quantity-plus]');
  const message = body.querySelector<HTMLElement>('[data-detail-message]');
  const retry = body.querySelector<HTMLButtonElement>('[data-detail-retry]');
  let quantitySynced = false;
  function selectedCount(): number {
    const count = Number(quantity?.value);
    return Number.isInteger(count) && count >= 1 && count <= 99 ? count : 0;
  }
  function updateCartState(changedProductId: number | null = null): void {
    if (!add || !message) return;
    if (quantity && cart.canUseCart() && !cart.getErrorMessage() && (!quantitySynced || changedProductId === id)) {
      const savedCount = cart.getProductQuantity(id);
      if (savedCount) quantity.value = String(savedCount);
      else if (changedProductId === id) quantity.value = '1';
      quantitySynced = true;
    }
    const count = selectedCount();
    const stockLimited = count > 0 && cart.isRequestedCountRejected(id, count);
    if (price) price.textContent = count ? formatProductTotal(unitPrice, count) : '—';
    add.disabled = !cart.canUseCart() || !count || stockLimited;
    if (plus) plus.disabled = !count || count >= 99 || cart.isRequestedCountRejected(id, count + 1);
    const cartError = cart.getErrorMessage();
    if (stockLimited) message.textContent = count === 1 ? 'Товара сейчас нет в наличии.' : 'Выбранного количества нет в наличии.';
    else if (cartError && !cartError.includes('наличии')) message.textContent = cartError;
    if (retry) retry.hidden = !cart.getErrorMessage().startsWith('Не удалось');
  }
  onCartChange = updateCartState;
  quantity?.addEventListener('input', () => {
    if (message) message.textContent = '';
    updateCartState();
  });
  body.querySelector('[data-quantity-minus]')?.addEventListener('click', () => {
    if (quantity) quantity.value = String(Math.max(1, selectedCount() - 1));
    if (message) message.textContent = '';
    updateCartState();
  });
  plus?.addEventListener('click', () => {
    if (quantity) quantity.value = String(Math.min(99, selectedCount() + 1));
    if (message) message.textContent = '';
    updateCartState();
  });
  async function addToCart(): Promise<void> {
    const count = selectedCount();
    if (!count || !cart.canUseCart() || cart.isRequestedCountRejected(id, count)) return;
    if (message) message.textContent = '';
    const success = await cart.setProductQuantity(id, count);
    if (success && message) message.textContent = 'Товар добавлен в корзину.';
    updateCartState();
  }
  retry?.addEventListener('click', () => {
    retry.disabled = true;
    if (message) message.textContent = 'Повторная загрузка корзины…';
    void cart.reloadCart().finally(() => { retry.disabled = false; updateCartState(); });
  });
  add?.addEventListener('click', () => { void addToCart(); });
  updateCartState();
}
