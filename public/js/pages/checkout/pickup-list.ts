export interface PickupPoint {
  id: number;
  longitude: number;
  latitude: number;
  address?: string;
}

// Адреса из go-park-mail-ru/db/migrations/000009_seed_pickup_points.up.sql.
// ID генерируются базой, поэтому связываем адреса с координатами, а не с ID.
const pickupAddresses: Record<string, string> = {
  '37.599545,55.749604': 'г. Москва, Гоголевский бульвар, д. 29',
  '37.598776,55.749804': 'г. Москва, Филипповский переулок, д. 18',
  '37.604675,55.754013': 'г. Москва, Нижний Кисловский переулок, д. 3',
  '37.603307,55.755738': 'г. Москва, Средний Кисловский переулок, д. 7/10',
  '37.603929,55.755732': 'г. Москва, Средний Кисловский переулок, д. 5/6, стр. 14',
  '37.598567,55.756258': 'г. Москва, Никитский бульвар, д. 17',
  '37.598096,55.756908': 'г. Москва, Никитский бульвар, д. 25',
  '37.596200,55.754766': 'г. Москва, Хлебный переулок, д. 9',
  '37.596148,55.755778': 'г. Москва, Скатертный переулок, д. 8/1',
  '37.596192,55.755053': 'г. Москва, Хлебный переулок, д. 6',
  '37.599284,55.751709': 'г. Москва, ул. Арбат, д. 1',
  '37.604793,55.752549': 'г. Москва, ул. Воздвиженка, д. 9',
};

export function getPickupAddress(point: PickupPoint): string {
  if (typeof point.address === 'string' && point.address.trim()) return point.address.trim();
  const coordinates = `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;
  return pickupAddresses[coordinates]
    ?? `Адрес не указан · координаты: ${point.latitude}, ${point.longitude}`;
}

export function showPickupList(container: HTMLElement, pickupPoints: PickupPoint[], onSelect: (point: PickupPoint, address: string) => Promise<void>): void {
  container.replaceChildren();
  let selectedButton: HTMLButtonElement | null = null;
  let isSelecting = false;

  for (const point of pickupPoints) {
    const address = getPickupAddress(point);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'checkout-page__pickup-option';
    button.textContent = address;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', async () => {
      if (isSelecting) return;
      isSelecting = true;
      selectedButton?.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      selectedButton = button;
      try {
        await onSelect(point, address);
      } finally {
        isSelecting = false;
      }
    });
    container.append(button);
  }

  container.hidden = false;
}
