import { divIcon, featureGroup, map, marker, tileLayer } from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';

export interface PickupPoint {
  id: number;
  longitude: number;
  latitude: number;
}

/** Показывает ПВЗ из backend; onSelect возвращает результат проверки товаров. */
export function showPickupMap(
  container: HTMLElement,
  tileError: HTMLElement,
  pickupPoints: PickupPoint[],
  onSelect: (point: PickupPoint) => Promise<boolean>,
): LeafletMap {
  // Сначала открываем блок, чтобы Leaflet измерил его настоящие размеры.
  container.hidden = false;
  const pickupMap = map(container, { scrollWheelZoom: false });
  // Убираем отдельную подпись Leaflet, оставляя короткую ссылку на источник карты.
  pickupMap.attributionControl.setPrefix(false);
  const tiles = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

  // Ошибка фона карты не должна заменять сообщение о проверке товаров.
  tiles.on('loading', () => { tileError.hidden = true; });
  tiles.on('tileerror', () => { tileError.hidden = false; });
  tiles.addTo(pickupMap);

  const markers = featureGroup().addTo(pickupMap);
  let selectedButton: HTMLButtonElement | null = null;
  let isSelecting = false;

  for (const point of pickupPoints) {
    // Обычная кнопка внутри метки доступна и мышью, и с клавиатуры.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'checkout-page__pickup-marker-button';
    button.textContent = String(point.id);
    button.title = `ПВЗ №${point.id}`;
    button.setAttribute('aria-label', `Выбрать ПВЗ №${point.id}`);
    button.setAttribute('aria-pressed', 'false');

    const icon = divIcon({
      className: 'checkout-page__pickup-marker',
      html: button,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
    // У Leaflet сначала широта (latitude), затем долгота (longitude).
    marker([point.latitude, point.longitude], { icon, keyboard: false }).addTo(markers);

    button.addEventListener('click', async () => {
      // Не запускаем две проверки одновременно и не меняем ПВЗ во время заказа.
      if (isSelecting || container.inert || !container.isConnected) return;
      isSelecting = true;
      selectedButton?.setAttribute('aria-pressed', 'false');
      selectedButton = null;
      try {
        const isAvailable = await onSelect(point);
        // Выделяем метку только после успешной проверки наличия товаров.
        if (isAvailable && container.isConnected) {
          button.setAttribute('aria-pressed', 'true');
          selectedButton = button;
        }
      } finally {
        isSelecting = false;
      }
    });
  }

  // Подбираем область по всем точкам, без фиксированного города и геолокации.
  pickupMap.fitBounds(markers.getBounds(), { padding: [32, 32], maxZoom: 17 });
  return pickupMap;
}
