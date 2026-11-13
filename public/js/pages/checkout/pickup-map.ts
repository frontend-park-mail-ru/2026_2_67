export interface PickupPoint {
  id: number;
  longitude: number;
  latitude: number;
}

const tileSize = 256;
const maxLatitude = 85.05112878;

// OpenStreetMap разбивает карту на квадраты 256 × 256 пикселей.
function position(point: PickupPoint, zoom: number): { x: number; y: number } {
  const latitude = Math.max(-maxLatitude, Math.min(maxLatitude, point.latitude));
  const radians = latitude * Math.PI / 180;
  const scale = tileSize * 2 ** zoom;
  return {
    x: (point.longitude + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * scale,
  };
}

/** Показывает ПВЗ на плитках OpenStreetMap без библиотеки карт. */
export function showPickupMap(
  container: HTMLElement,
  tileError: HTMLElement,
  pickupPoints: PickupPoint[],
  onSelect: (point: PickupPoint) => Promise<boolean>,
): { remove: () => void } {
  container.hidden = false;
  let zoom = 14;
  // Все текущие ПВЗ рядом: при открытии ставим центр на первую точку.
  const firstPoint = position(pickupPoints[0], zoom);
  let centerX = firstPoint.x;
  let centerY = firstPoint.y;
  let selectedId: number | null = null;
  let isSelecting = false;
  let dragStart: { x: number; y: number; centerX: number; centerY: number } | null = null;
  const markers = new Map<number, HTMLButtonElement>();
  const listeners = new AbortController();

  function updateSelection(): void {
    for (const [id, marker] of markers) {
      marker.setAttribute('aria-pressed', String(id === selectedId));
    }
  }

  function draw(): void {
    container.replaceChildren();
    markers.clear();
    tileError.hidden = true;
    const left = centerX - container.clientWidth / 2;
    const top = centerY - container.clientHeight / 2;
    const tileCount = 2 ** zoom;

    for (let x = Math.floor(left / tileSize); x <= Math.floor((left + container.clientWidth) / tileSize); x += 1) {
      for (let y = Math.floor(top / tileSize); y <= Math.floor((top + container.clientHeight) / tileSize); y += 1) {
        if (y < 0 || y >= tileCount) continue;
        const tile = document.createElement('img');
        tile.className = 'checkout-page__map-tile';
        tile.alt = '';
        tile.draggable = false;
        tile.style.left = `${x * tileSize - left}px`;
        tile.style.top = `${y * tileSize - top}px`;
        tile.src = `https://tile.openstreetmap.org/${zoom}/${((x % tileCount) + tileCount) % tileCount}/${y}.png`;
        tile.addEventListener('error', () => { tileError.hidden = false; });
        container.append(tile);
      }
    }

    for (const point of pickupPoints) {
      const coordinates = position(point, zoom);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'checkout-page__pickup-marker-button';
      button.textContent = String(point.id);
      button.title = `ПВЗ №${point.id}`;
      button.setAttribute('aria-label', `Выбрать ПВЗ №${point.id}`);
      button.setAttribute('aria-pressed', String(point.id === selectedId));
      button.style.left = `${coordinates.x - left}px`;
      button.style.top = `${coordinates.y - top}px`;
      button.addEventListener('click', async () => {
        if (isSelecting || container.inert || !container.isConnected) return;
        isSelecting = true;
        selectedId = null;
        updateSelection();
        try {
          if (await onSelect(point) && container.isConnected) selectedId = point.id;
        } finally {
          isSelecting = false;
          if (container.isConnected) updateSelection();
        }
      });
      markers.set(point.id, button);
      container.append(button);
    }

    function zoomButton(label: string, step: number): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', step === 1 ? 'Приблизить карту' : 'Отдалить карту');
      button.disabled = zoom + step < 2 || zoom + step > 19;
      button.addEventListener('click', () => {
        zoom += step;
        centerX *= 2 ** step;
        centerY *= 2 ** step;
        draw();
      });
      return button;
    }
    const controls = document.createElement('div');
    controls.className = 'checkout-page__map-controls';
    controls.append(zoomButton('+', 1), zoomButton('−', -1));
    container.append(controls);

    const attribution = document.createElement('a');
    attribution.className = 'checkout-page__map-attribution';
    attribution.href = 'https://www.openstreetmap.org/copyright';
    attribution.target = '_blank';
    attribution.rel = 'noopener noreferrer';
    attribution.textContent = '© OpenStreetMap';
    container.append(attribution);
  }

  container.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Element && event.target.closest('button, a')) return;
    dragStart = { x: event.clientX, y: event.clientY, centerX, centerY };
    container.setPointerCapture(event.pointerId);
  }, { signal: listeners.signal });
  container.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    centerX = dragStart.centerX - (event.clientX - dragStart.x);
    centerY = dragStart.centerY - (event.clientY - dragStart.y);
    draw();
  }, { signal: listeners.signal });
  container.addEventListener('pointerup', () => { dragStart = null; }, { signal: listeners.signal });
  container.addEventListener('pointercancel', () => { dragStart = null; }, { signal: listeners.signal });

  const resizeObserver = new ResizeObserver(draw);
  resizeObserver.observe(container);
  draw();
  return { remove: () => { listeners.abort(); resizeObserver.disconnect(); } };
}
