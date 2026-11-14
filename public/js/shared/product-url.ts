const cyrillic = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function productSlug(name: string): string {
  return [...name.toLowerCase()]
    .map((character) => cyrillic[character as keyof typeof cyrillic] ?? character)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function productUrl(id: number, name: string): string {
  const slug = productSlug(name);
  return `/products/${id}${slug ? `/${slug}` : ''}`;
}

export function productIdFromPath(pathname: string): number | null {
  const match = /^\/products\/([1-9]\d*)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.exec(pathname);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}
