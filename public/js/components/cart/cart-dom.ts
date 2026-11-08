/** Applies freshly rendered cart markup while keeping matching DOM nodes alive. */
export function updateCartMarkup(container: Element, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;
  syncChildren(container, template.content);
}

function key(node: Node): string | null {
  if (!(node instanceof Element)) return null;
  const itemId = node.getAttribute('data-cart-item-id');
  if (itemId !== null) return `item:${itemId}`;
  const className = node.getAttribute('class');
  if (!className) return null;
  return `${node.tagName}:${className}:${node.getAttribute('role') ?? ''}`;
}

function syncAttributes(current: Element, next: Element): void {
  for (const { name } of [...current.attributes]) {
    if (!next.hasAttribute(name)) current.removeAttribute(name);
  }
  for (const { name, value } of [...next.attributes]) {
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  }
}

function compatible(current: Node, next: Node): boolean {
  return current.nodeType === next.nodeType
    && (!(current instanceof Element) || (next instanceof Element && current.tagName === next.tagName && key(current) === key(next)));
}

function syncNode(current: Node, next: Node): void {
  if (current instanceof Element && next instanceof Element) {
    syncAttributes(current, next);
    syncChildren(current, next);
  } else if (current.nodeValue !== next.nodeValue) {
    current.nodeValue = next.nodeValue;
  }
}

function syncChildren(current: Node, next: Node): void {
  // Formatting whitespace in Handlebars templates has no visible content.
  for (const child of [...current.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE && !child.nodeValue?.trim()) current.removeChild(child);
  }
  const desired = [...next.childNodes].filter((child) => child.nodeType !== Node.TEXT_NODE || Boolean(child.nodeValue?.trim()));
  let position = current.firstChild;
  for (const [index, nextChild] of desired.entries()) {
    const nextKey = key(nextChild);
    let match: Node | null = null;
    if (nextKey) {
      match = [...current.childNodes].find((child) => key(child) === nextKey && compatible(child, nextChild)) ?? null;
    } else if (position && compatible(position, nextChild)) {
      match = position;
    }
    if (!match) {
      match = nextChild.cloneNode(true);
      current.insertBefore(match, position);
    } else {
      if (match !== position) {
        const remainingKeys = new Set(desired.slice(index).map(key));
        while (position && position !== match && !remainingKeys.has(key(position))) {
          const stale = position;
          position = stale.nextSibling;
          current.removeChild(stale);
        }
        if (match !== position) current.insertBefore(match, position);
      }
      syncNode(match, nextChild);
    }
    position = match.nextSibling;
  }
  while (position) {
    const following = position.nextSibling;
    current.removeChild(position);
    position = following;
  }
}
