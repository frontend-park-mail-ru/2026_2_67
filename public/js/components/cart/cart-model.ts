import type { BasketResponse } from './cart-api.js';
import { formatMoney } from '../../shared/format-money.js';

export interface CartItem {
  id: number;
  title: string;
  image: string;
  price: string;
  quantity: number;
}

export interface CartModel {
  items: CartItem[];
  priceSum: number;
}

export function mapBasket(basket: BasketResponse): CartModel {
  return {
    items: basket.basketProducts.map((product) => ({
      id: product.id,
      title: product.name,
      image: product.pictureUrl,
      price: formatMoney(product.priceResult * product.count),
      quantity: product.count,
    })),
    priceSum: basket.basketSumResult,
  };
}
