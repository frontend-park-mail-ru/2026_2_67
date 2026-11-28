import type { Config, Entry, FeatureFlag, Kind } from './api.js';

const now = new Date(0).toISOString();
const audit = { createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now };
const entries: Entry[] = [
  { id: 1, key: 'cart.min_order_amount', scope: 'frontend', valueType: 'number', value: 1000, description: '', ...audit },
  { id: 2, key: 'checkout.enabled', scope: 'frontend', enabled: true, rolloutPercent: 100, whitelist: [], blacklist: [], description: '', ...audit },
];
let nextId = 3;
export const demoApi = {
  async list(kind: Kind, q = '', scope = ''): Promise<Entry[]> {
    return entries.filter((entry) => (kind === 'configs' ? 'valueType' in entry : 'enabled' in entry)
      && entry.key.includes(q) && (!scope || entry.scope === scope));
  },
  async save(_kind: Kind, entry: Entry): Promise<void> {
    const index = entries.findIndex((item) => item.id === entry.id);
    if (index < 0) entries.push({ ...entry, id: nextId++ });
    else entries[index] = entry;
  },
  async remove(_kind: Kind, id: number): Promise<void> {
    const index = entries.findIndex((entry) => entry.id === id);
    if (index >= 0) entries.splice(index, 1);
  },
};
export function draft(kind: Kind): Entry {
  return kind === 'configs'
    ? { id: 0, key: '', scope: 'frontend', valueType: 'json', value: null, description: '', ...audit } satisfies Config
    : { id: 0, key: '', scope: 'frontend', enabled: false, rolloutPercent: 0, whitelist: [], blacklist: [], description: '', ...audit } satisfies FeatureFlag;
}
