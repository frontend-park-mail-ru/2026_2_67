import type { ApiProduct } from '../../data/map-api-product.js';
import { authorizedFetch, avatarSource } from '../../shared/auth.js';
import { productReviewsTemplate } from '../../templates/templates.js';

export interface ProductReview {
  buyerID: number;
  buyerName: string;
  buyerSurname: string;
  buyerAvatarUrl: string;
  createdAt: string;
  rating: number;
  review: string | null;
}

export interface ProductReviews {
  wasReview: boolean;
  canReview?: boolean;
  reviews: ProductReview[];
  avgRating: number;
  reviewsCount: number;
  rating5Count: number;
  rating4Count: number;
  rating3Count: number;
  rating2Count: number;
  rating1Count: number;
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const pluralRules = new Intl.PluralRules('ru-RU');
const ratingWords: Record<string, string> = { one: 'оценки', few: 'оценок', many: 'оценок', other: 'оценки' };

function stars(rating: number) {
  const value = Math.min(5, Math.max(0, rating));
  return Array.from({ length: 5 }, (_, index) => ({
    fill: Math.round(Math.min(1, Math.max(0, value - index)) * 100),
  }));
}

/** Prepares API data and the initial loading or failed request state. */
export function productReviewsView(product: ApiProduct, data?: ProductReviews, failed = false) {
  const distribution = [data?.rating5Count, data?.rating4Count, data?.rating3Count, data?.rating2Count, data?.rating1Count];
  const marksCount = data ? distribution.reduce<number>((sum, count) => sum + (count ?? 0), 0) : product.marksCount;
  const rating = data?.avgRating ?? product.raiting ?? product.rating;
  const hasRating = Number.isFinite(rating) && rating > 0;
  return {
    loading: !data && !failed,
    failed,
    wasReview: data?.wasReview ?? false,
    canReview: data?.canReview === true,
    textCount: data?.reviewsCount ?? product.reviewsCount,
    rating: hasRating ? numberFormatter.format(rating) : '—',
    ratingLabel: hasRating ? `${numberFormatter.format(rating)} из 5` : 'Оценок пока нет',
    stars: stars(hasRating ? rating : 0),
    basis: marksCount === undefined ? 'Количество оценок пока недоступно' : `На основе ${marksCount} ${ratingWords[pluralRules.select(marksCount)]}`,
    distribution: distribution.map((count, index) => ({
      rating: 5 - index,
      count: count ?? '—',
      percent: marksCount && count ? Math.round(count / marksCount * 100) : 0,
    })),
    emptyMessage: data ? 'Отзывов пока нет.' : failed ? 'Не удалось загрузить отзывы.' : 'Загрузка отзывов…',
    items: (data?.reviews ?? []).map((review) => {
      const date = new Date(review.createdAt);
      return {
        name: `${review.buyerName} ${review.buyerSurname}`.trim(),
        avatar: avatarSource(review.buyerAvatarUrl.trim()) || '/images/profile-avatar-placeholder.png',
        date: Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date),
        dateTime: Number.isNaN(date.getTime()) ? '' : date.toISOString(),
        ratingLabel: `${review.rating} из 5`,
        stars: stars(review.rating),
        text: review.review?.trim(),
      };
    }),
  };
}

function isProductReviews(value: unknown): value is ProductReviews {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  const counts = [data.reviewsCount, data.rating5Count, data.rating4Count, data.rating3Count, data.rating2Count, data.rating1Count];
  return typeof data.wasReview === 'boolean'
    && (data.canReview === undefined || typeof data.canReview === 'boolean')
    && typeof data.avgRating === 'number' && Number.isFinite(data.avgRating) && data.avgRating >= 0 && data.avgRating <= 5
    && counts.every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)
    && Array.isArray(data.reviews) && data.reviews.every((review: unknown) => {
      if (!review || typeof review !== 'object') return false;
      const item = review as Record<string, unknown>;
      return typeof item.buyerID === 'number' && Number.isSafeInteger(item.buyerID) && item.buyerID > 0
        && typeof item.buyerName === 'string' && typeof item.buyerSurname === 'string'
        && typeof item.buyerAvatarUrl === 'string' && typeof item.createdAt === 'string'
        && typeof item.rating === 'number' && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5
        && (item.review === null || typeof item.review === 'string');
    });
}

export function initProductReviews(container: HTMLElement, product: ApiProduct): () => Promise<void> {
  let request = 0;
  async function load(): Promise<void> {
    const current = ++request;
    container.innerHTML = productReviewsTemplate({ reviews: productReviewsView(product) });
    try {
      const path = `/products/${product.id}/reviews`;
      let response = await authorizedFetch(path);
      if (response.status === 401 || response.status === 403) {
        response = await fetch(`/api/v1${path}`, { credentials: 'omit' });
      }
      if (!response.ok) throw new Error(`Не удалось загрузить отзывы: ${response.status}`);
      const data: unknown = await response.json();
      if (!isProductReviews(data)) throw new Error('Неверный формат отзывов.');
      if (current === request && container.isConnected) container.innerHTML = productReviewsTemplate({ reviews: productReviewsView(product, data) });
    } catch {
      if (current === request && container.isConnected) container.innerHTML = productReviewsTemplate({ reviews: productReviewsView(product, undefined, true) });
    }
  }
  container.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-reviews-retry]')) void load();
  });
  container.addEventListener('error', (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.matches('.product-review__avatar')
      && image.getAttribute('src') !== '/images/profile-avatar-placeholder.png') {
      image.src = '/images/profile-avatar-placeholder.png';
    }
  }, true);
  void load();
  return load;
}
