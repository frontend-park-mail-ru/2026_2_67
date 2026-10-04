import { renderFieldErrors } from './render-field-errors.js';
import { login, register } from '../auth.js';

/**
 * Renders an auth form and connects the shared validation.
 * @param {HTMLElement} app Main application container.
 * @param {Function} template Handlebars template.
 * @param {Function} validate Pure form-data validation function.
 */
export function renderAuthPage(app, template, validate, onSuccess) {
  app.innerHTML = template();
  const form = app.querySelector('[data-auth-form]');

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
          : responseErrors.form || 'Не удалось выполнить запрос. Попробуйте позже.';
      })
      .catch(() => {
        message.textContent = 'Не удалось связаться с сервером. Попробуйте позже.';
      })
      .finally(() => {
        submitButton.disabled = false;
      });
  });
}
