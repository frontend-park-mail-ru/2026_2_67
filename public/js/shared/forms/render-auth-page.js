import { renderFieldErrors } from './render-field-errors.js';
import { login, register } from '../auth.js';

/**
 * Renders an auth form and connects the shared validation.
 * @param {HTMLElement} app Main application container.
 * @param {Function} template Handlebars template.
 * @param {Function} validate Pure form-data validation function.
 * @param {Function} onSuccess Callback after successful authentication.
 * @returns {void}
 */
function bindPasswordVisibility(form) {
  const passwordInputs = form.querySelectorAll('input[type="password"]');

  passwordInputs.forEach((input) => {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.setAttribute('aria-label', 'Показать пароль');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Zm10.5 3.3A3.3 3.3 0 1 0 12 8.7a3.3 3.3 0 0 0 0 6.6Z"/></svg>';

    input.insertAdjacentElement('afterend', toggle);

    toggle.addEventListener('click', () => {
      const isPasswordHidden = input.type === 'password';
      input.type = isPasswordHidden ? 'text' : 'password';
      toggle.setAttribute('aria-label', isPasswordHidden ? 'Скрыть пароль' : 'Показать пароль');
      toggle.setAttribute('aria-pressed', String(isPasswordHidden));
      toggle.classList.toggle('is-visible', isPasswordHidden);
    });
  });
}

export function renderAuthPage(app, template, validate, onSuccess) {
  app.innerHTML = template();
  const form = app.querySelector('[data-auth-form]');
  bindPasswordVisibility(form);

  form.addEventListener('submit', function validateBeforeSubmit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const errors = validate(values);
    const isValid = Object.keys(errors).length === 0;

    renderFieldErrors(form, errors, errors.passwordRepeat ? ['password'] : []);
    const message = app.querySelector('[data-form-message]');
    message.textContent = '';

    if (!isValid) {
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const isLogin = form.dataset.authForm === 'login';
    const request = isLogin
      ? login(values.loginOrEmail, values.password)
      : register(values.login, values.email, values.password);

    request
      .then((result) => {
        if (result.ok) {
          onSuccess();
          return;
        }

        if (isLogin && result.status === 401) {
          renderFieldErrors(form, {}, ['loginOrEmail', 'password']);
          message.textContent = 'Неверный логин или пароль';
          return;
        }

        const responseErrors = result.errors ?? {};
        const fieldErrors = {
          ...(responseErrors.loginErrMessage
            ? { [isLogin ? 'loginOrEmail' : 'login']: responseErrors.loginErrMessage }
            : {}),
          ...(responseErrors.emailErrMessage ? { email: responseErrors.emailErrMessage } : {}),
          ...(responseErrors.passwordErrMessage ? { password: responseErrors.passwordErrMessage } : {}),
          ...(responseErrors.passswordErrMessage
            ? { password: responseErrors.passswordErrMessage }
            : {}),
        };
        renderFieldErrors(form, fieldErrors);
        message.textContent = Object.keys(fieldErrors).length
          ? ''
          : responseErrors.errMessage || responseErrors.form || 'Не удалось выполнить запрос. Попробуйте позже.';
      })
      .catch(() => {
        message.textContent = 'Не удалось связаться с сервером. Попробуйте позже.';
      })
      .finally(() => {
        submitButton.disabled = false;
      });
  });
}
