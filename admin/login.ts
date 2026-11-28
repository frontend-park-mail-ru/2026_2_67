import { authorizedFetch, restoreSession } from '../public/js/shared/auth';
import { renderAuthPage } from '../public/js/shared/forms/render-auth-page';
import { validateLogin } from '../public/js/shared/forms/validation';

export async function startLogin(openPanel: (userId: number) => void) {
  const host = document.getElementById('login-fields')!;
  try {
    const response = await fetch(new URL('../public/js/templates/login.hbs', import.meta.url));
    if (!response.ok) throw new Error();
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const form = page.querySelector('form[data-auth-form="login"]');
    if (!form) throw new Error();
    renderAuthPage(host, () => form.outerHTML, validateLogin, checkAccess);
  } catch {
    host.textContent = 'Не удалось загрузить форму входа. Обновите страницу.';
    host.removeAttribute('aria-busy');
    return;
  }

  async function checkAccess() {
    host.inert = true;
    const message = host.querySelector<HTMLElement>('[data-form-message]')!;
    try {
      const response = await authorizedFetch('/onlineconf/admin/me');
      if (response.status === 403) {
        message.textContent = 'У этого аккаунта нет прав администратора OnlineConf.';
        return;
      }
      if (response.status === 401) {
        message.textContent = 'Сессия завершилась. Войдите снова.';
        return;
      }
      if (!response.ok) throw new Error();
      const user = await response.json();
      if (!Number.isInteger(user?.userId) || !['admin', 'superadmin'].includes(user.role)) throw new Error();
      host.querySelector('form')!.reset();
      openPanel(user.userId);
    } catch {
      message.textContent = 'Не удалось проверить права доступа.';
    } finally {
      host.inert = false;
    }
  }

  host.inert = true;
  try {
    if (await restoreSession()) await checkAccess();
  } finally {
    host.inert = false;
    host.removeAttribute('aria-busy');
  }
}
