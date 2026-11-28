import { restoreSession } from '../shared/auth.js';
import { renderAuthPage } from '../shared/forms/render-auth-page.js';
import { validateLogin } from '../shared/forms/validation.js';
import { ApiError, onlineConfApi } from './api.js';

export async function startLogin(host: HTMLElement, onAuthorized: () => void): Promise<void> {
  const message = host.querySelector<HTMLElement>('[data-access-error]');
  const fields = host.querySelector<HTMLElement>('#login-fields');
  if (!fields || !message) throw new Error('Не найдена форма входа OnlineConf.');
  const response = await fetch('/templates/login.hbs');
  if (!response.ok) throw new Error('Не удалось загрузить форму входа.');
  const form = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('form[data-auth-form="login"]');
  if (!form) throw new Error('Форма входа не найдена.');
  renderAuthPage(fields, () => form.outerHTML, validateLogin, () => { void checkAccess(); });

  async function checkAccess(): Promise<void> {
    fields!.inert = true;
    try {
      await onlineConfApi.me();
      onAuthorized();
    } catch (error) {
      message!.textContent = error instanceof ApiError && error.status === 403 ? 'У этого аккаунта нет прав администратора OnlineConf.'
        : error instanceof ApiError && error.status === 401 ? 'Сессия завершилась. Войдите снова.'
          : 'Не удалось проверить права доступа.';
    } finally { fields!.inert = false; }
  }

  fields.inert = true;
  try { if (await restoreSession()) await checkAccess(); }
  finally { fields.inert = false; fields.removeAttribute('aria-busy'); }
}
