import type { ApiProduct } from '../../data/map-api-product.js';
import { authorizedFetch, avatarSource } from '../../shared/auth.js';
import { productReviewsTemplate } from '../../templates/templates.js';
import { fetchProduct } from './load-product.js';

export interface ProductReview {
  buyerId: number;
  buyerName: string;
  buyerPatronymic?: string;
  buyerSurname: string;
  buyerAvatarUrl: string;
  createdAt: string;
  rating: number;
  review: string;
}

export interface ProductReviews {
  reviews: ProductReview[];
  nextCursor: string;
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const pluralRules = new Intl.PluralRules('ru-RU');
const ratingWords: Record<string, string> = { one: 'оценки', few: 'оценок', many: 'оценок', other: 'оценки' };
const sortOptions = [
  { value: 'desc-date', label: 'новые' },
  { value: 'asc-date', label: 'старые' },
  { value: 'desc-rating', label: 'с высокой оценкой' },
  { value: 'asc-rating', label: 'с низкой оценкой' },
];

function stars(rating: number) {
  const value = Math.min(5, Math.max(0, rating));
  return Array.from({ length: 5 }, (_, index) => ({
    fill: Math.round(Math.min(1, Math.max(0, value - index)) * 100),
  }));
}

/** Prepares API data and the initial loading or failed request state. */
export function productReviewsView(product: ApiProduct, data?: ProductReviews, failed = false, sortBy = 'desc-date') {
  const distribution = [product.rating5Count, product.rating4Count, product.rating3Count, product.rating2Count, product.rating1Count];
  const marksCount = product.marksCount;
  const rating = product.rating ?? product.raiting ?? 0;
  const hasRating = Number.isFinite(rating) && rating > 0;
  return {
    sortOptions: sortOptions.map((option) => ({ ...option, selected: option.value === sortBy })),
    loading: !data && !failed,
    failed,
    wasReview: product.wasReview === true,
    canReview: product.canReview === true,
    textCount: product.reviewsCount,
    rating: hasRating ? `${numberFormatter.format(rating)}/5` : '—',
    basis: marksCount === undefined ? 'Количество оценок пока недоступно' : `На основе ${marksCount} ${ratingWords[pluralRules.select(marksCount)]}`,
    distribution: distribution.map((count, index) => ({
      rating: 5 - index,
      count: count ?? '—',
      percent: marksCount && count ? Math.round(count / marksCount * 100) : 0,
    })),
    emptyMessage: data ? 'Отзывов пока нет.' : failed ? 'Не удалось загрузить отзывы.' : 'Загрузка отзывов…',
    items: (data?.reviews ?? []).filter((review) => review.review.trim()).map((review) => {
      const date = new Date(review.createdAt);
      return {
        name: [review.buyerName, review.buyerPatronymic, review.buyerSurname].filter(Boolean).join(' '),
        avatar: avatarSource(review.buyerAvatarUrl.trim()) || '/images/profile-avatar-placeholder.png',
        date: Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date),
        dateTime: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
        ratingLabel: `${review.rating} из 5`,
        stars: stars(review.rating),
        text: review.review.trim(),
      };
    }),
  };
}

function isProductReviews(value: unknown): value is ProductReviews {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return typeof data.nextCursor === 'string'
    && Array.isArray(data.reviews) && data.reviews.every((review: unknown) => {
      if (!review || typeof review !== 'object') return false;
      const item = review as Record<string, unknown>;
      return typeof item.buyerId === 'number' && Number.isSafeInteger(item.buyerId) && item.buyerId > 0
        && typeof item.buyerName === 'string' && typeof item.buyerSurname === 'string'
        && (item.buyerPatronymic === undefined || typeof item.buyerPatronymic === 'string')
        && typeof item.buyerAvatarUrl === 'string' && typeof item.createdAt === 'string'
        && typeof item.rating === 'number' && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5
        && typeof item.review === 'string';
    });
}

export function initProductReviews(container: HTMLElement, product: ApiProduct): () => Promise<void> {
  let request = 0;
  let sortBy = 'desc-date';
  let data: ProductReviews | undefined;
  let failed = false;
  let loading = false;
  let productRequest = 0;
  let productFailed = false;
  function render(): void {
    if (!container.isConnected) return;
    const sortFocused = document.activeElement?.matches('[data-review-sort]') && container.contains(document.activeElement);
    container.innerHTML = productReviewsTemplate({
      reviews: { ...productReviewsView(product, data, failed, sortBy), loading, more: data?.nextCursor, productFailed },
    });
    if (sortFocused) container.querySelector<HTMLInputElement>('[data-review-sort]:checked')?.focus({ preventScroll: true });
  }
  async function load(append = false): Promise<void> {
    const current = ++request;
    const cursor = append ? data?.nextCursor : '';
    if (!append) data = undefined;
    loading = true;
    failed = false;
    render();
    try {
      const params = new URLSearchParams({ sortBy });
      if (cursor) params.set('cursor', cursor);
      const path = `/products/${product.id}/reviews?${params}`;
      let response = await authorizedFetch(path, { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) {
        response = await fetch(`/api/v1${path}`, { credentials: 'omit', cache: 'no-store' });
      }
      if (!response.ok) throw new Error(`Не удалось загрузить отзывы: ${response.status}`);
      const result: unknown = await response.json();
      if (!isProductReviews(result) || (cursor && result.nextCursor === cursor)) throw new Error('Неверный формат отзывов.');
      if (current === request) data = { reviews: [...(data?.reviews ?? []), ...result.reviews], nextCursor: result.nextCursor };
    } catch {
      if (current === request) failed = true;
    } finally {
      if (current === request) {
        loading = false;
        render();
      }
    }
  }
  async function refreshProduct(): Promise<void> {
    const current = ++productRequest;
    product = { ...product, canReview: false, wasReview: false };
    productFailed = false;
    render();
    const fresh = await fetchProduct(product.id).catch(() => null);
    if (current !== productRequest) return;
    if (fresh) product = fresh;
    productFailed = !fresh;
    render();
  }
  container.addEventListener('change', (event) => {
    const option = event.target;
    if (!(option instanceof HTMLInputElement) || !option.matches('[data-review-sort]:checked') || option.value === sortBy) return;
    sortBy = option.value;
    void load();
  });
  container.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-product-refresh]')) void refreshProduct();
    if (!loading && event.target.closest('[data-reviews-load]')) void load(Boolean(data?.nextCursor));
  });
  container.addEventListener('error', (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.matches('.product-review__avatar')
      && image.getAttribute('src') !== '/images/profile-avatar-placeholder.png') {
      image.src = '/images/profile-avatar-placeholder.png';
    }
  }, true);
  void load();
  return async () => { await Promise.all([refreshProduct(), load()]); };
}
