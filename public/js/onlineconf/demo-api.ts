import type { Config, Entry, Evaluation, FeatureFlag, HistoryEntry, Kind } from './api.js';

const now = new Date(0).toISOString();
const audit = { createdBy: 1, updatedBy: 1, createdAt: now, updatedAt: now };
const entries: Entry[] = [
  { id: 1, key: 'cart.min_order_amount', scope: 'frontend', valueType: 'number', value: 1000, description: '', ...audit },
  { id: 2, key: 'checkout.enabled', scope: 'frontend', enabled: true, rolloutPercent: 100, whitelist: [], blacklist: [], description: '', ...audit },
];
let nextId = 3;
let nextHistoryId = 1;
const history: HistoryEntry[] = [];
export const demoApi = {
  async list(kind: Kind, q = '', scope = ''): Promise<Entry[]> {
    return entries.filter((entry) => (kind === 'configs' ? 'valueType' in entry : 'enabled' in entry)
      && entry.key.includes(q) && (!scope || entry.scope === scope));
  },
  async save(_kind: Kind, entry: Entry): Promise<void> {
    const index = entries.findIndex((item) => item.id === entry.id);
    const previous = index < 0 ? null : entries[index];
    const saved = index < 0 ? { ...entry, id: nextId++ } : entry;
    if (index < 0) entries.push(saved);
    else entries[index] = saved;
    history.unshift({ id: nextHistoryId++, entityType: 'valueType' in saved ? 'config' : 'flag', entityId: saved.id,
      entityKey: saved.key, scope: saved.scope, action: previous ? 'update' : 'create', oldValue: previous,
      newValue: saved, changedBy: 1, createdAt: new Date().toISOString() });
  },
  async remove(_kind: Kind, id: number): Promise<void> {
    const index = entries.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      const [previous] = entries.splice(index, 1);
      history.unshift({ id: nextHistoryId++, entityType: 'valueType' in previous ? 'config' : 'flag', entityId: id,
        entityKey: previous.key, scope: previous.scope, action: 'delete', oldValue: previous,
        newValue: null, changedBy: 1, createdAt: new Date().toISOString() });
    }
  },
  async history(entityType: 'config' | 'flag', entityId: number): Promise<HistoryEntry[]> {
    return history.filter((item) => item.entityType === entityType && item.entityId === entityId);
  },
  async evaluate(flag: FeatureFlag, userId: number): Promise<Evaluation> {
    let enabled = false;
    let reason = 'rollout';
    let bucket = 0;
    if (flag.blacklist.includes(userId)) reason = 'blacklist';
    else if (flag.whitelist.includes(userId)) { enabled = true; reason = 'whitelist'; }
    else if (!flag.enabled) reason = 'disabled';
    else {
      let hash = 2166136261;
      for (const byte of new TextEncoder().encode(`${flag.scope}.${flag.key}:${userId}`)) hash = Math.imul(hash ^ byte, 16777619);
      bucket = (hash >>> 0) % 100;
      enabled = bucket < flag.rolloutPercent;
    }
    return { flagId: flag.id, key: flag.key, scope: flag.scope, userId, enabled, reason, bucket };
  },
};
export function draft(kind: Kind): Entry {
  return kind === 'configs'
    ? { id: 0, key: '', scope: 'frontend', valueType: 'json', value: null, description: '', ...audit } satisfies Config
    : { id: 0, key: '', scope: 'frontend', enabled: false, rolloutPercent: 0, whitelist: [], blacklist: [], description: '', ...audit } satisfies FeatureFlag;
}
