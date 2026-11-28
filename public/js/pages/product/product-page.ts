import { settings, watchSettings } from '../../shared/onlineconf.js';
import { authorizedFetch, getCurrentUser } from '../../shared/auth.js';
import { updateCartMarkup } from '../../components/cart/cart-dom.js';
import { initCart } from '../../components/cart/cart.js';
import { mapApiProduct } from '../../data/map-api-product.js';
import { productCartControlsTemplate, productDetailTemplate, productPageTemplate } from '../../templates/templates.js';
import { loadProduct } from './load-product.js';
import { initProductReviews, productReviewsView } from './product-reviews.js';

function initProductBar(app: HTMLElement, header: HTMLElement, bar: HTMLElement, reviews: HTMLElement): void {
  let headerHeight = 0;

  function updateVisibility(): void {
    const reviewsTop = reviews.getBoundingClientRect().top;
    const showBar = window.scrollY > 0 && reviewsTop <= headerHeight;

    bar.inert = !showBar;
    bar.classList.toggle('product-bar--visible', showBar);
  }

  function updatePosition(): void {
    headerHeight = header.getBoundingClientRect().height;
    bar.style.setProperty('--header-height', headerHeight + 'px');
    updateVisibility();
  }

  updatePosition();
  window.addEventListener('scroll', updateVisibility, { passive: true });

  let resize: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver(updatePosition);
    resize.observe(header);
    const productLayout = reviews.previousElementSibling;
    if (productLayout) resize.observe(productLayout);
  }
  const removal = new window.MutationObserver(() => {
    if (bar.isConnected) return;
    window.removeEventListener('scroll', updateVisibility);
    resize?.disconnect();
    removal.disconnect();
  });
  removal.observe(app, { childList: true });

}

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
    document.title = 'VibeMarket — Товар недоступен';
    body.innerHTML = '<div class="product-page__empty" role="alert"><h1>Не удалось открыть товар</h1><p>Сведения об этом товаре сейчас недоступны. Попробуйте найти его в каталоге.</p><a href="/" data-page="catalog">Перейти в каталог</a></div>';
    body.setAttribute('aria-busy', 'false');
    return;
  }

  const mapped = mapApiProduct(product);
  document.title = `VibeMarket — ${mapped.title}`;
  const photos = Array.isArray(mapped.images) ? mapped.images.filter((url) => typeof url === 'string' && url.trim()) : [];
  body.innerHTML = productDetailTemplate({
    id,
    title: mapped.title,
    price: mapped.price,
    oldPrice: mapped.oldPrice,
    discountPercent: mapped.discountPercent,
    availableCountLabel: mapped.availableCount !== undefined ? `В наличии: ${mapped.availableCount} шт.` : '',
    sellerName: mapped.sellerName,
    description: typeof product.description === 'string' ? product.description.trim() : '',
    hasPhotos: photos.length > 0,
    firstPhoto: photos[0],
    photoCount: photos.length,
    hasMultiplePhotos: photos.length > 1,
    photos: photos.map((url, index) => ({ url, index, number: index + 1, active: index === 0 })),
    isGuest: !user,
    reviews: productReviewsView(product),
    ratings: [1, 2, 3, 4, 5],
  });
  body.setAttribute('aria-busy', 'false');

  const reviewsSection = body.querySelector<HTMLElement>('[data-product-reviews]');
  const bar = body.querySelector<HTMLElement>('.product-bar');
  const header = page.querySelector<HTMLElement>('.site-header');
  if (bar && header && reviewsSection) initProductBar(app, header, bar, reviewsSection);
  const barRating = bar?.querySelector('[data-bar-rating]');
  const reloadReviews = reviewsSection ? initProductReviews(reviewsSection, product, (label) => {
    if (barRating) barRating.textContent = label;
  }) : null;

  const dialog = body.querySelector<HTMLDialogElement>('.review-dialog');
  const rating = dialog?.querySelector<HTMLElement>('.review-dialog__stars');
  if (dialog && rating) {
    const form = dialog.querySelector('form');
    const text = dialog.querySelector<HTMLTextAreaElement>('textarea');
    const publish = dialog.querySelector<HTMLButtonElement>('[data-publish-review]');
    const error = dialog.querySelector<HTMLElement>('[data-review-error]');
    const stars = rating.querySelectorAll<HTMLElement>('[data-rating]');
    const getRating = () => Number(rating.querySelector<HTMLInputElement>('input:checked')?.value ?? 0);
    function highlightStars(rating: number): void {
      stars.forEach((star) => {
        star.classList.toggle('is-active', Number(star.dataset.rating) <= rating);
      });
    }
    const path = `/products/${id}/reviews`;
    let editing = false;
    let saving = false;
    let opened = 0;
    watchSettings(dialog, () => {
      if (editing || !dialog.open || saving || !publish || !error) return;
      publish.disabled = !settings.reviewsEnabled;
      error.textContent = settings.reviewsEnabled ? '' : 'Публикация отзывов временно недоступна.';
    });
    reviewsSection?.addEventListener('click', async (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-write-review], [data-own-review]')) return;
      if (!form || !error || !text || !publish || saving) return;
      const title = dialog.querySelector('h2');
      if (!title) return;
      const current = ++opened;
      editing = Boolean(event.target.closest('[data-own-review]'));
      if (editing && !user) return;
      form.reset();
      highlightStars(0);
      title.textContent = editing ? 'Ваш отзыв' : 'Написать отзыв';
      publish.textContent = editing ? 'Сохранить изменения' : 'Опубликовать отзыв';
      publish.disabled = editing || !settings.reviewsEnabled;
      text.disabled = editing;
      rating.querySelectorAll('input').forEach((input) => { input.disabled = editing; });
      error.textContent = '';
      if (editing) {
        error.textContent = 'Загрузка отзыва…';
      } else if (!settings.reviewsEnabled) {
        error.textContent = 'Публикация отзывов временно недоступна.';
      }
      dialog.showModal();
      if (!editing || !user) return;
      try {
        const response = await authorizedFetch(`${path}/${encodeURIComponent(user.userId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const own = await response.json();
        if (!own || !Number.isInteger(own.rating) || own.rating < 1 || own.rating > 5 || typeof own.review !== 'string') throw new Error();
        if (current !== opened || !dialog.open || !page.isConnected) return;
        rating.querySelectorAll('input').forEach((input) => {
          input.checked = Number(input.value) === own.rating;
          input.disabled = false;
        });
        highlightStars(own.rating);
        text.value = own.review;
        text.disabled = false;
        publish.disabled = false;
        error.textContent = '';
      } catch {
        if (current === opened && dialog.open) error.textContent = 'Не удалось загрузить ваш отзыв. Откройте его ещё раз.';
      }
    });
    rating.addEventListener('pointerover', (event) => {
      if (!(event.target instanceof Element)) return;
      const star = event.target.closest<HTMLElement>('[data-rating]');
      if (star) highlightStars(Number(star.dataset.rating));
    });
    rating.addEventListener('pointerleave', () => highlightStars(getRating()));
    rating.addEventListener('change', () => highlightStars(getRating()));
    form?.addEventListener('submit', async (event) => {
      if (event.submitter !== publish) return;
      event.preventDefault();
      if (!publish || !text || !error || publish.disabled) return;
      if (!editing && !settings.reviewsEnabled) {
        error.textContent = 'Публикация отзывов временно недоступна.';
        return;
      }
      const value = getRating();
      if (!value) {
        error.textContent = 'Выберите оценку от 1 до 5 звёзд.';
        return;
      }
      error.textContent = '';
      publish.disabled = true;
      saving = true;
      publish.textContent = editing ? 'Сохранение…' : 'Публикация…';
      form.setAttribute('aria-busy', 'true');
      text.disabled = true;
      rating.querySelectorAll('input').forEach((input) => { input.disabled = true; });
      try {
        const response = await authorizedFetch(editing && user ? `${path}/${encodeURIComponent(user.userId)}` : path, {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: value, review: text.value.trim() }),
        });
        if (!page.isConnected) return;
        if (response.ok) {
          dialog.close();
          form.reset();
          highlightStars(0);
          void reloadReviews?.();
        } else if (response.status === 401 || response.status === 403) {
          error.textContent = 'Не удалось подтвердить вход. Войдите в аккаунт снова.';
        } else if (response.status === 409) {
          error.textContent = 'Вы уже оставили отзыв на этот товар.';
          void reloadReviews?.();
        } else if (response.status === 422) {
          const details: unknown = await response.json().catch(() => null);
          error.textContent = details && typeof details === 'object'
            && 'errMessage' in details && typeof details.errMessage === 'string'
            ? details.errMessage : 'Оставить отзыв можно после получения товара. Проверьте оценку.';
          void reloadReviews?.();
        } else if (response.status === 404) {
          error.textContent = editing ? 'Отзыв не найден.' : 'Товар не найден.';
        } else {
          error.textContent = 'Не удалось сохранить отзыв. Попробуйте ещё раз.';
        }
      } catch {
        if (page.isConnected) error.textContent = 'Не удалось связаться с сервером. Попробуйте ещё раз.';
      } finally {
        saving = false;
        publish.disabled = !editing && !settings.reviewsEnabled;
        publish.textContent = editing ? 'Сохранить изменения' : 'Опубликовать отзыв';
        form.setAttribute('aria-busy', 'false');
        text.disabled = false;
        rating.querySelectorAll('input').forEach((input) => { input.disabled = false; });
      }
    });
    let outside = false;
    dialog.addEventListener('pointerdown', (event) => {
      outside = event.target === dialog;
    });
    dialog.addEventListener('click', (event) => {
      if (outside && event.target === dialog) dialog.close();
      outside = false;
    });
  }

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

  const cartControls = body.querySelectorAll<HTMLElement>('[data-product-cart]');
  const message = body.querySelector<HTMLElement>('[data-detail-message]');
  const retry = body.querySelector<HTMLButtonElement>('[data-detail-retry]');

  function updateCartState(): void {
    const error = cart.getErrorMessage();
    if (message) message.textContent = error;
    if (retry) retry.hidden = !error.startsWith('Не удалось');

    for (const controls of cartControls) {
      if (user && !cart.canUseCart()) {
        controls.textContent = cart.isLoading() ? 'Загрузка корзины…' : '';
        continue;
      }
      const item = cart.getDisplayItems().find((item) => item.id === id);
      updateCartMarkup(controls, productCartControlsTemplate({
        title: mapped.title,
        quantity: cart.getProductQuantity(id),
        stockLimited: cart.isIncreaseDisabled(id),
        stockWarning: item?.stockWarning,
        availableCountLabel: mapped.availableCount === undefined ? '' : `В наличии: ${mapped.availableCount} шт.`,
      }));
    }
  }

  onCartChange = updateCartState;
  retry?.addEventListener('click', () => {
    retry.disabled = true;
    void cart.reloadCart().finally(() => {
      retry.disabled = false;
      updateCartState();
    });
  });
  updateCartState();
}
