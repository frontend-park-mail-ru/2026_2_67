const mapsScriptUrl = 'https://api-maps.yandex.ru/v3/?apikey=3fbdaee1-974a-4c38-9b95-f59cb6010d13&lang=ru_RU';

export interface PickupPoint {
  id: number;
  longitude: number;
  latitude: number;
}

type MapChild = object;
type MapLocation = { center: [number, number]; zoom: number } | { bounds: [[number, number], [number, number]] };
interface YandexMaps {
  ready: Promise<unknown>;
  YMap: new (container: HTMLElement, options: { location: MapLocation }) => { addChild(child: MapChild): void };
  YMapDefaultSchemeLayer: new () => MapChild;
  YMapDefaultFeaturesLayer: new () => MapChild;
  YMapMarker: new (options: { coordinates: [number, number] }, marker: HTMLElement) => MapChild;
}

declare global {
  interface Window { ymaps3?: YandexMaps }
}

function loadMaps(): Promise<YandexMaps | undefined> {
  if (window.ymaps3) {
    return Promise.resolve(window.ymaps3);
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = mapsScriptUrl;
    script.onload = () => resolve(window.ymaps3);
    script.onerror = () => reject(new Error('Не удалось загрузить карту.'));
    document.head.append(script);
  });
}

export async function showPickupMap(container: HTMLElement, pickupPoints: PickupPoint[], onSelect: (point: PickupPoint) => Promise<void>): Promise<void> {
  const ymaps3 = await loadMaps();
  if (!ymaps3) throw new Error('Не удалось загрузить карту.');
  await ymaps3.ready;

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker } = ymaps3;
  const longitudes = pickupPoints.map((point) => point.longitude);
  const latitudes = pickupPoints.map((point) => point.latitude);
  const location: MapLocation = pickupPoints.length === 1
    ? { center: [pickupPoints[0].longitude, pickupPoints[0].latitude], zoom: 14 }
    : { bounds: [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ] };

  container.hidden = false;
  container.replaceChildren();

  const map = new YMap(container, { location });
  map.addChild(new YMapDefaultSchemeLayer());
  map.addChild(new YMapDefaultFeaturesLayer());

  let selectedMarker: HTMLButtonElement | null = null;
  let isSelecting = false;
  for (const point of pickupPoints) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'checkout-page__pickup-marker';
    marker.textContent = 'ПВЗ';
    marker.setAttribute('aria-label', `Выбрать пункт выдачи №${point.id}`);
    marker.setAttribute('aria-pressed', 'false');
    marker.addEventListener('click', async () => {
      if (isSelecting) return;
      isSelecting = true;
      selectedMarker?.setAttribute('aria-pressed', 'false');
      marker.setAttribute('aria-pressed', 'true');
      selectedMarker = marker;
      try {
        await onSelect(point);
      } finally {
        isSelecting = false;
      }
    });
    map.addChild(new YMapMarker({ coordinates: [point.longitude, point.latitude] }, marker));
  }
}
