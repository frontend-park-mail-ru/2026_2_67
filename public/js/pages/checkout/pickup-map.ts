const mapsScriptUrl = 'https://api-maps.yandex.ru/v3/?apikey=3fbdaee1-974a-4c38-9b95-f59cb6010d13&lang=ru_RU';

export interface PickupPoint {
  longitude: number;
  latitude: number;
}

type MapChild = object;
interface YandexMaps {
  ready: Promise<unknown>;
  YMap: new (container: HTMLElement, options: { location: { center: [number, number]; zoom: number } }) => { addChild(child: MapChild): void };
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

export async function showPickupMap(container: HTMLElement, pickupPoint: PickupPoint): Promise<void> {
  const ymaps3 = await loadMaps();
  if (!ymaps3) throw new Error('Не удалось загрузить карту.');
  await ymaps3.ready;

  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker } = ymaps3;
  const coordinates: [number, number] = [pickupPoint.longitude, pickupPoint.latitude];

  container.hidden = false;
  container.replaceChildren();

  const map = new YMap(container, {
    location: { center: coordinates, zoom: 14 },
  });
  map.addChild(new YMapDefaultSchemeLayer());
  map.addChild(new YMapDefaultFeaturesLayer());

  const marker = document.createElement('div');
  marker.className = 'checkout-page__pickup-marker';
  marker.textContent = 'ПВЗ';
  map.addChild(new YMapMarker({ coordinates }, marker));
}
