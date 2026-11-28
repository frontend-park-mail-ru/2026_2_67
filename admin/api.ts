export type Key = {
  id: string;
  name: string;
  description: string;
  scope: string;
} & (
  | { type: 'config'; value: string }
  | { type: 'flag'; enabled: boolean; percent: number; include: string[]; exclude: string[] }
);

const sample: Key[] = [
  { id: 'banner', name: 'catalog.banner', description: 'Заголовок баннера', scope: 'catalog', type: 'config', value: 'Новинки недели' },
  { id: 'checkout', name: 'checkout.new', description: 'Новая форма заказа', scope: 'checkout', type: 'flag', enabled: true, percent: 20, include: [], exclude: [] },
];


export interface Entry {
  createdAt: string;
  changedBy: string;
  oldValue: Key | null;
  newValue: Key;
}
type RecordKey = Key & { history?: Entry[] };

function initialHistory(key: Key): Entry[] {
  if (!sample.some(item => item.id === key.id)) return [];
  const original = sample.find(item => item.id === key.id)!;
  return [{ createdAt: '2026-11-01T09:00:00Z', changedBy: 'Демо-администратор', oldValue: null, newValue: original }];
}

function snapshot(record: RecordKey): Key {
  const { history, ...key } = record;
  return key;
}

export class KeyNameError extends Error {}

export function nameError(name: string): string {
  if (!name) return 'Введите название ключа.';
  if (name.length > 64) return 'Сократите название до 64 символов.';
  if (/[^a-z0-9._-]/.test(name)) return 'Допустимы только строчные латинские буквы, цифры 0–9 и символы . _ -';
  if (name.includes('..')) return 'Две точки подряд запрещены.';
  if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) {
    return 'Начните и закончите название строчной латинской буквой или цифрой.';
  }
  return '';
}

const storageKey = 'vibemarket.onlineconf.v1';

function records(): RecordKey[] {
  const data = localStorage.getItem(storageKey);
  return data === null ? structuredClone(sample) : JSON.parse(data);
}

export const api = {
  async list(): Promise<Key[]> {
    return records().map(snapshot);
  },

  history(key: Key): Entry[] {
    return records().find(item => item.id === key.id)?.history ?? initialHistory(key);
  },

  async save(key: Key, actor: string): Promise<void> {
    const error = nameError(key.name);
    if (error) throw new KeyNameError(error);
    const keys = records();
    if (keys.some(item => item.id !== key.id && item.scope === key.scope && item.name === key.name)) {
      throw new KeyNameError('Ключ с таким названием уже есть в этом scope.');
    }
    const index = keys.findIndex(item => item.id === key.id);
    const previous = keys[index];
    const history = previous ? previous.history ?? initialHistory(previous) : [];
    const entry = { createdAt: new Date().toISOString(), changedBy: actor, oldValue: previous ? snapshot(previous) : null, newValue: key };
    const record = { ...key, history: [...history, entry] };
    if (index === -1) keys.push(record);
    else keys[index] = record;
    localStorage.setItem(storageKey, JSON.stringify(keys));
  },
};
