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

    renderFieldErrors(form, errors);
    const message = app.querySelector('[data-form-message]');
    message.textContent = isValid ? '' : 'Исправьте поля с ошибками.';

    if (!isValid) {
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const request = form.dataset.authForm === 'login'
      ? login(values.loginOrEmail, values.password)
      : register(values.login, values.email, values.password);

    request
      .then((result) => {
        if (result.ok) {
          onSuccess();
          return;
        }

        const errors = {
          ...(result.errors.loginErrMessage ? { login: result.errors.loginErrMessage } : {}),
          ...(result.errors.emailErrMessage ? { email: result.errors.emailErrMessage } : {}),
          ...(result.errors.passwordErrMessage ? { password: result.errors.passwordErrMessage } : {}),
          ...(result.errors.passswordErrMessage
            ? { password: result.errors.passswordErrMessage }
            : {}),
        };
        renderFieldErrors(form, errors);
        message.textContent = Object.keys(errors).length
          ? 'Проверьте поля формы.'
          : result.status === 401 && form.dataset.authForm === 'login'
            ? 'Неверный логин или пароль.'
            : result.errors.form || 'Не удалось выполнить запрос. Попробуйте позже.';
      })
      .catch(() => {
        message.textContent = 'Не удалось связаться с сервером. Попробуйте позже.';
      })
      .finally(() => {
        submitButton.disabled = false;
      });
  });
}
