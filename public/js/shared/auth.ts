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

export type AuthResult =
  | { ok: true }
  | { ok: false; status?: number; errors: unknown };

type Credentials = { email: string; password: string };

let accessToken: string | null = localStorage.getItem(ACCESS_TOKEN_KEY);
let userId = localStorage.getItem(USER_ID_KEY);
let currentUser: UserProfile | null = null;
let refreshPromise: Promise<boolean> | null = null;
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

function tokenIsExpired(token: string): boolean {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt !== null && Date.now() >= expiresAt;
}

function saveSession(session: AuthSession): void {
  if (typeof session.accessToken !== 'string' || tokenExpiresAt(session.accessToken) === null) {
    throw new TypeError('Access token has no valid expiration.');
  }
  accessToken = session.accessToken;
  userId = session.userId === undefined ? userId : String(session.userId);
  sessionGeneration += 1;
  localStorage.setItem(ACCESS_TOKEN_KEY, String(accessToken));

  if (userId !== null) {
    localStorage.setItem(USER_ID_KEY, userId);
  }
}

function clearSession(): void {
  sessionGeneration += 1;
  accessToken = null;
  userId = null;
  currentUser = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
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
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
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
    saveSession({ accessToken: token, userId: readField(result, 'userId') });
    return true;
  } catch {
    if (generation === sessionGeneration) clearSession();
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
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
  });

  const sentToken = accessToken;
  const response = await send(sentToken);
  if (response.status !== 401 || !sentToken || !accessToken) return response;

  if (accessToken !== sentToken && !tokenIsExpired(accessToken)) {
    return send(accessToken);
  }
  if (tokenIsExpired(accessToken) && await refreshOnce() && accessToken) {
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

  const response = await authorizedFetch(`/buyers/${encodeURIComponent(userId)}/profile`);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearSession();
    }
    currentUser = null;
    return null;
  }

  const profile = await readResponse(response);
  currentUser = { ...Object(profile), phoneNumber: readField(profile, 'telephone') };
  return currentUser;
}

/**
 * Restores a session with the saved access token, refreshing only after expiration.
 * @returns {Promise<Object|null>} Profile or null if restoration fails.
 */
export async function restoreSession(): Promise<UserProfile | null> {
  if (!userId || !accessToken) {
    if (userId || accessToken) clearSession();
    return null;
  }

  try {
    if (tokenExpiresAt(accessToken) === null) {
      clearSession();
      return null;
    }
    if (tokenIsExpired(accessToken) && !await refreshOnce()) return null;
    return await loadCurrentUser();
  } catch {
    return null;
  }
}

async function submitCredentials(endpoint: 'login' | 'register', payload: Credentials): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const result = await readResponse(response);

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
  try {
    if (accessToken) {
      await authorizedFetch('/auth/logout', { method: 'POST' });
    }
  } finally {
    clearSession();
  }
}

/**
 * Returns the identity currently available to the interface.
 * @returns {Object|null} User data or null for a guest.
 */
export function getCurrentUser(): CurrentUser | null {
  return userId ? { ...currentUser, userId } : null;
}
