export interface PickupPoint {
  id: number;
  longitude: number;
  latitude: number;
}

const pickupAddresses: Record<number, string> = {
  17: 'Москва, Гоголевский бульвар, д. 29',
  18: 'Москва, Филипповский переулок, д. 18',
  19: 'Москва, Нижний Кисловский переулок, д. 3',
  20: 'Москва, Средний Кисловский переулок, д. 7/10',
  21: 'Москва, Средний Кисловский переулок, д. 5/6, стр. 14',
  22: 'Москва, Никитский бульвар, д. 17',
  23: 'Москва, Никитский бульвар, д. 25',
  24: 'Москва, Хлебный переулок, д. 9',
  25: 'Москва, Скатертный переулок, д. 8/1',
  26: 'Москва, Хлебный переулок, д. 6',
  27: 'Москва, ул. Арбат, д. 1',
  28: 'Москва, ул. Воздвиженка, д. 9',
};

export function showPickupList(container: HTMLElement, pickupPoints: PickupPoint[], onSelect: (point: PickupPoint, address: string) => Promise<void>): void {
  container.replaceChildren();
  let selectedButton: HTMLButtonElement | null = null;
  let isSelecting = false;

  for (const point of pickupPoints) {
    const address = pickupAddresses[point.id] ?? `Пункт выдачи №${point.id}`;
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
