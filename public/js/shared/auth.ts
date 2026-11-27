import { clearStockState } from '../components/cart/stock-state.js';

const API_BASE_URL = '/api/v1';
const ACCESS_TOKEN_KEY = 'accessToken';
const USER_ID_KEY = 'userId';

export interface AuthSession {
  accessToken: unknown;
  userId: unknown;
}

export interface UserProfile {
  [field: string]: unknown;
  phoneNumber: unknown;
}

export interface CurrentUser {
  [field: string]: unknown;
  userId: string;
  phoneNumber?: unknown;
}

export function avatarSource(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (/^https?:\/\//.test(value) || value.startsWith('/media/')) return value;
  return `/media/media/${value.replace(/^\/+/, '')}`;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; status?: number; errors: unknown };

type Credentials = { email: string; password: string };

localStorage.removeItem(ACCESS_TOKEN_KEY);
localStorage.removeItem(USER_ID_KEY);
if (typeof sessionStorage !== 'undefined') {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(USER_ID_KEY);
}
let accessToken: string | null = null;
let userId: string | null = null;
let currentUser: UserProfile | null = null;
let avatarCacheVersion = Date.now();

function refreshAvatarCacheVersion(): void {
  avatarCacheVersion = Math.max(Date.now(), avatarCacheVersion + 1);
}
let refreshPromise: Promise<boolean> | null = null;
let refreshController: AbortController | null = null;
let sessionGeneration = 0;

function tokenExpiresAt(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function tokenUserId(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { UserID?: unknown };
    return typeof payload.UserID === 'number' && Number.isSafeInteger(payload.UserID) && payload.UserID > 0
      ? String(payload.UserID) : null;
  } catch { return null; }
}

function tokenIsExpired(token: string): boolean {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && Date.now() >= expiresAt;
}

function saveSession(session: AuthSession): void {
  if (typeof session.accessToken !== 'string' || tokenExpiresAt(session.accessToken) === null) {
    throw new TypeError('Access token has no valid expiration.');
  }
  const nextUserId = session.userId === undefined ? tokenUserId(session.accessToken) : String(session.userId);
  if (!nextUserId || !/^\d+$/.test(nextUserId)) throw new TypeError('Access token has no valid user ID.');
  accessToken = session.accessToken;
  userId = nextUserId;
  sessionGeneration += 1;
}

function clearSession(): void {
  clearStockState();
  sessionGeneration += 1;
  refreshController?.abort();
  refreshPromise = null;
  accessToken = null;
  userId = null;
  currentUser = null;
  refreshAvatarCacheVersion();
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(USER_ID_KEY);
  }
}

async function readResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

function readField(value: unknown, key: string): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read property ${key} from null or undefined`);
  }
  return Reflect.get(Object(value), key);
}

async function refreshAccessToken(): Promise<boolean> {
  const generation = sessionGeneration;
  const controller = new AbortController();
  refreshController = controller;
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (generation !== sessionGeneration) return false;
    if (!response.ok) {
      clearSession();
      return false;
    }

    const result = await readResponse(response);
    if (generation !== sessionGeneration) return false;
    const token = readField(result, 'accessToken');
    if (typeof token !== 'string' || tokenExpiresAt(token) === null || tokenIsExpired(token)) {
      clearSession();
      return false;
    }
    saveSession({ accessToken: token, userId: undefined });
    return true;
  } catch {
    if (generation === sessionGeneration) clearSession();
    return false;
  } finally {
    if (refreshController === controller) refreshController = null;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    const pending = refreshAccessToken().finally(() => {
      if (refreshPromise === pending) refreshPromise = null;
    });
    refreshPromise = pending;
  }
  return refreshPromise;
}

/**
 * Sends a request to the backend with the current access token and refresh cookie.
 * @param {string} path API path relative to /api/v1.
 * @param {RequestInit} options Fetch options.
 * @returns {Promise<Response>} Backend response.
 */
export async function authorizedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (accessToken && tokenIsExpired(accessToken) && !await refreshOnce()) {
    return new Response(null, { status: 401 });
  }

  const send = (token: string | null) => fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
  });

  const sentToken = accessToken;
  const response = await send(sentToken);
  if ((response.status !== 401 && response.status !== 403) || !sentToken || !accessToken) return response;
  if (response.status === 403 && !tokenIsExpired(accessToken)) return response;

  if (accessToken !== sentToken && !tokenIsExpired(accessToken)) {
    return send(accessToken);
  }
  if (await refreshOnce() && accessToken) {
    return send(accessToken);
  }
  return response;
}

/**
 * Loads the current user's profile when a user ID and access token are available.
 * @returns {Promise<Object|null>} Profile or null if it cannot be loaded.
 */
export async function loadCurrentUser(): Promise<UserProfile | null> {
  if (!userId || !accessToken) {
    currentUser = null;
    return null;
  }

  const requestedUserId = userId;
  const response = await authorizedFetch(`/buyers/${encodeURIComponent(userId)}/profile`);
  if (requestedUserId !== userId || !accessToken) return null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearSession();
    }
    currentUser = null;
    return null;
  }

  const profile = await readResponse(response);
  if (requestedUserId !== userId || !accessToken) return null;
  currentUser = { ...Object(profile), phoneNumber: readField(profile, 'telephone') };
  refreshAvatarCacheVersion();
  return currentUser;
}

/**
 * Restores a session from the HttpOnly refresh cookie.
 * @returns {Promise<Object|null>} Profile or null if restoration fails.
 */
export async function restoreSession(): Promise<UserProfile | null> {
  try {
    if (!await refreshOnce()) return null;
    return await loadCurrentUser();
  } catch {
    return null;
  }
}

async function submitCredentials(endpoint: 'login' | 'register', payload: Credentials): Promise<AuthResult> {
  refreshController?.abort();
  sessionGeneration += 1;
  const generation = sessionGeneration;
  const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const result = await readResponse(response);

  if (generation !== sessionGeneration) return { ok: false, errors: {} };

  if (!response.ok) {
    return { ok: false, status: response.status, errors: result };
  }

  const token = readField(result, 'accessToken');
  if (!token) {
    return { ok: false, errors: { form: readField(result, 'errMessage') || 'Сервер не вернул токен авторизации.' } };
  }

  saveSession({ accessToken: token, userId: readField(result, 'userId') });
  if (userId) {
    await loadCurrentUser();
  }
  return { ok: true };
}

/**
 * Authenticates with an email and password.
 * @param {string} email Account email.
 * @param {string} password Account password.
 * @returns {Promise<Object>} Authentication result.
 */
export function login(email: string, password: string): Promise<AuthResult> {
  return submitCredentials('login', { email, password });
}

/**
 * Registers an account and saves its session.
 * @param {string} email Account email.
 * @param {string} password Account password.
 * @returns {Promise<Object>} Registration result.
 */
export function register(email: string, password: string): Promise<AuthResult> {
  return submitCredentials('register', { email, password });
}

/**
 * Requests logout and always clears local session data.
 * @returns {Promise<void>}
 */
export async function logout(): Promise<void> {
  if (accessToken && tokenIsExpired(accessToken)) await refreshOnce();
  const token = accessToken;
  clearSession();
  try {
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` } });
    }
  } catch { /* The local session is already cleared. */ }
}

/**
 * Returns the identity currently available to the interface.
 * @returns {Object|null} User data or null for a guest.
 */
export function getCurrentUser(): CurrentUser | null {
  if (!userId) return null;
  const fullName = typeof currentUser?.name === 'string' ? currentUser.name.trim() : '';
  const nameSegments = Array.from(new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(fullName),
    ({ segment }) => segment);
  const headerLabel = nameSegments.length > 6 ? `${nameSegments.slice(0, 6).join('')}...` : fullName || 'Профиль';
  const source = avatarSource(currentUser?.avatarUrl);
  const hashIndex = source.indexOf('#');
  const sourceWithoutHash = hashIndex === -1 ? source : source.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : source.slice(hashIndex);
  const avatarSrc = source
    ? `${sourceWithoutHash}${sourceWithoutHash.includes('?') ? '&' : '?'}v=${avatarCacheVersion}${hash}`
    : '';
  return { ...currentUser, userId, avatarSrc,
    headerName: fullName || 'Профиль', headerLabel };
}

/** Replaces the cached profile only after a confirmed backend update. */
export function setCurrentUserProfile(profile: object, expectedUserId: string): void {
  if (userId !== expectedUserId || !accessToken) return;
  currentUser = { ...profile, phoneNumber: Reflect.get(profile, 'telephone') };
  refreshAvatarCacheVersion();
}
