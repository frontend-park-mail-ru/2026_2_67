import { authorizedFetch } from '../shared/auth.js';

export type Kind = 'configs' | 'flags';
export type ValueType = 'string' | 'number' | 'boolean' | 'array' | 'json';
export interface Config {
  id: number; key: string; scope: string; valueType: ValueType; value: unknown; description: string;
  createdBy: number; updatedBy: number; createdAt: string; updatedAt: string;
}
export interface FeatureFlag {
  id: number; key: string; scope: string; enabled: boolean; rolloutPercent: number;
  whitelist: number[]; blacklist: number[]; description: string;
  createdBy: number; updatedBy: number; createdAt: string; updatedAt: string;
}
export type Entry = Config | FeatureFlag;
export type ConfigInput = Pick<Config, 'key' | 'scope' | 'valueType' | 'value' | 'description'>;
export type FlagInput = Pick<FeatureFlag, 'key' | 'scope' | 'enabled' | 'rolloutPercent' | 'whitelist' | 'blacklist' | 'description'>;
export interface Admin { userId: number; role: 'admin' | 'superadmin' }
export interface Evaluation { flagId: number; key: string; scope: string; userId: number; enabled: boolean; reason: string; bucket: number }
export interface HistoryEntry {
  id: number; entityType: 'config' | 'flag'; entityId: number; entityKey: string; scope: string;
  action: 'create' | 'update' | 'delete'; oldValue: unknown; newValue: unknown;
  changedBy: number; createdAt: string;
}
export interface RuntimeFrontend { configs: Record<string, unknown>; flags: Record<string, boolean> }

const base = '/onlineconf/admin';
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await authorizedFetch(`${base}${path}`, options);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === 'object' && 'errMessage' in body && typeof body.errMessage === 'string'
      ? body.errMessage : `HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
function body(value: unknown): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) };
}
function listPath(kind: Kind, q = '', scope = ''): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (scope) params.set('scope', scope);
  return `/${kind}${params.size ? `?${params}` : ''}`;
}

export const onlineConfApi = {
  me: () => request<Admin>('/me'),
  list: async (kind: Kind, q = '', scope = ''): Promise<Entry[]> => {
    if (kind === 'configs') return (await request<{ configs: Config[] }>(listPath(kind, q, scope))).configs;
    return (await request<{ flags: FeatureFlag[] }>(listPath(kind, q, scope))).flags;
  },
  create: (input: ConfigInput): Promise<Config> => request('/configs', { method: 'POST', ...body(input) }),
  createFlag: (input: FlagInput): Promise<FeatureFlag> => request('/flags', { method: 'POST', ...body(input) }),
  update: (id: number, input: Pick<ConfigInput, 'valueType' | 'value' | 'description'>): Promise<Config> =>
    request(`/configs/${id}`, { method: 'PUT', ...body(input) }),
  updateFlag: (id: number, input: Pick<FlagInput, 'enabled' | 'rolloutPercent' | 'whitelist' | 'blacklist' | 'description'>): Promise<FeatureFlag> =>
    request(`/flags/${id}`, { method: 'PUT', ...body(input) }),
  remove: (kind: Kind, id: number): Promise<void> => request(`/${kind}/${id}`, { method: 'DELETE' }),
  evaluate: (id: number, userId: number): Promise<Evaluation> =>
    request(`/flags/${id}/evaluate?${new URLSearchParams({ userId: String(userId) })}`),
  history: (entityType?: 'config' | 'flag', entityId?: number): Promise<HistoryEntry[]> => {
    const params = new URLSearchParams({ limit: '50' });
    if (entityType) params.set('entityType', entityType);
    if (entityId) params.set('entityId', String(entityId));
    return request<{ history: HistoryEntry[] }>(`/history?${params}`).then((result) => result.history);
  },
};

// Runtime stays separate from admin routes and is not wired into the storefront yet.
export async function getRuntimeFrontend(): Promise<RuntimeFrontend> {
  const response = await authorizedFetch('/onlineconf/runtime/frontend');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<RuntimeFrontend>;
}
