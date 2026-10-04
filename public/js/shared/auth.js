const API_BASE_URL = 'http://localhost:8080/api/v1';
const ACCESS_TOKEN_KEY = 'accessToken';
const USER_ID_KEY = 'userId';

let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
let userId = localStorage.getItem(USER_ID_KEY);
let currentUser = null;

function saveSession(session) {
  accessToken = session.accessToken;
  userId = session.userId === undefined ? userId : String(session.userId);
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);

  if (userId !== null) {
    localStorage.setItem(USER_ID_KEY, userId);
  }
}

function clearSession() {
  accessToken = null;
  userId = null;
  currentUser = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

async function readResponse(response) {
  return response.json().catch(() => ({}));
}

async function refreshAccessToken() {
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
  if (!result.accessToken) {
    return false;
  }

  saveSession(result);
  return true;
}

/**
 * Sends a request to the backend with the current access token and refresh cookie.
 * @param {string} path API path relative to /api/v1.
 * @param {RequestInit} options Fetch options.
 * @returns {Promise<Response>} Backend response.
 */
export async function authorizedFetch(path, options = {}) {
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
export async function loadCurrentUser() {
  if (!userId || !accessToken) {
    currentUser = null;
    return null;
  }

  const response = await authorizedFetch(`/users/${encodeURIComponent(userId)}`);

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearSession();
    }
    currentUser = null;
    return null;
  }

  currentUser = await readResponse(response);
  return currentUser;
}

/**
 * Restores a session using the refresh cookie and loads the user's profile.
 * @returns {Promise<Object|null>} Profile or null if restoration fails.
 */
export async function restoreSession() {
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

async function submitCredentials(endpoint, payload) {
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

  if (!result.accessToken) {
    return { ok: false, errors: { form: result.errMessage || 'Сервер не вернул токен авторизации.' } };
  }

  saveSession(result);
  if (userId) {
    await loadCurrentUser();
  }
  return { ok: true };
}

/**
 * Authenticates with a login or email and password.
 * @param {string} loginOrEmail Account login or email.
 * @param {string} password Account password.
 * @returns {Promise<Object>} Authentication result.
 */
export function login(loginOrEmail, password) {
  return submitCredentials('login', { loginOrEmail, password });
}

/**
 * Registers an account and saves its session.
 * @param {string} loginValue Account login.
 * @param {string} email Account email.
 * @param {string} password Account password.
 * @returns {Promise<Object>} Registration result.
 */
export function register(loginValue, email, password) {
  return submitCredentials('register', { login: loginValue, email, password });
}

/**
 * Requests logout and always clears local session data.
 * @returns {Promise<void>}
 */
export async function logout() {
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
export function getCurrentUser() {
  return userId ? { ...currentUser, userId } : null;
}
