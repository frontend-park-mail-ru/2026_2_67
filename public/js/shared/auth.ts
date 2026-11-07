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

let accessToken: unknown = localStorage.getItem(ACCESS_TOKEN_KEY);
let userId = localStorage.getItem(USER_ID_KEY);
let currentUser: UserProfile | null = null;

function saveSession(session: AuthSession): void {
  accessToken = session.accessToken;
  userId = session.userId === undefined ? userId : String(session.userId);
  localStorage.setItem(ACCESS_TOKEN_KEY, String(accessToken));

  if (userId !== null) {
    localStorage.setItem(USER_ID_KEY, userId);
  }
}

function clearSession(): void {
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
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      clearSession();
    }
    return false;
  }

  const result = await readResponse(response);
  const token = readField(result, 'accessToken');
  if (!token) {
    return false;
  }

  saveSession({ accessToken: token, userId: readField(result, 'userId') });
  return true;
}

/**
 * Sends a request to the backend with the current access token and refresh cookie.
 * @param {string} path API path relative to /api/v1.
 * @param {RequestInit} options Fetch options.
 * @returns {Promise<Response>} Backend response.
 */
export async function authorizedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const send = () => fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: 'include',
  });

  let response = await send();
  if (response.status === 401 && await refreshAccessToken()) {
    response = await send();
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
 * Restores a session using the refresh cookie and loads the user's profile.
 * @returns {Promise<Object|null>} Profile or null if restoration fails.
 */
export async function restoreSession(): Promise<UserProfile | null> {
  if (!userId) {
    return null;
  }

  try {
    await refreshAccessToken();
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
