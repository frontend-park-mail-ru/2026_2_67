import { renderFieldErrors } from './render-field-errors.js';
import { login, register } from '../auth.js';
import type { LoginFormValues, SignupFormValues, LoginErrors, SignupErrors } from './validation.js';

type ValidateForm = ((values: LoginFormValues) => LoginErrors) | ((values: SignupFormValues) => SignupErrors);

function capitalizeFirstLetter(message: string): string {
  return message ? message.replace(/^./u, (letter) => letter.toLocaleUpperCase('ru-RU')) : message;
}

function readFormValues(form: HTMLFormElement): SignupFormValues {
  const entries = Object.fromEntries(new FormData(form));
  const text = (value: FormDataEntryValue | undefined): string => typeof value === 'string' ? value : '';
  return { email: text(entries.email), password: text(entries.password), passwordRepeat: text(entries.passwordRepeat) };
}

function getErrorText(errors: unknown, key: string): string {
  if (typeof errors !== 'object' || errors === null) return '';
  const value: unknown = Reflect.get(errors, key);
  return typeof value === 'string' ? value : '';
}

/**
 * Renders an auth form and connects the shared validation.
 * @param {HTMLElement} app Main application container.
 * @param {Function} template Handlebars template.
 * @param {Function} validate Pure form-data validation function.
 * @param {Function} onSuccess Callback after successful authentication.
 * @returns {void}
 */
function bindPasswordVisibility(form: HTMLFormElement): void {
  const passwordInputs = form.querySelectorAll('input[type="password"]');

  passwordInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
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

export function renderAuthPage(app: HTMLElement, template: () => string, validate: ValidateForm, onSuccess: () => void): void {
  app.innerHTML = template();
  const form = app.querySelector('[data-auth-form]');
  if (!(form instanceof HTMLFormElement)) throw new Error('Форма авторизации не найдена.');
  bindPasswordVisibility(form);

  if (form.dataset.authForm === 'signup') {
    const passwordInput = form.elements.namedItem('password');
    const passwordError = form.querySelector('[data-error-for="password"]');
    if (!(passwordInput instanceof HTMLInputElement) || !passwordError) throw new Error('Поле пароля не найдено.');
    passwordInput.addEventListener('input', () => {
      const error = validate(readFormValues(form)).password || '';
      passwordError.textContent = error;
      passwordInput.setAttribute('aria-invalid', String(Boolean(error)));
    });
  }

  form.addEventListener('submit', function validateBeforeSubmit(event: Event): void {
    event.preventDefault();
    const values = readFormValues(form);
    const errors = validate(values);
    const isValid = Object.keys(errors).length === 0;

    renderFieldErrors(form, errors, 'passwordRepeat' in errors && errors.passwordRepeat ? ['password'] : []);
    const message = app.querySelector('[data-form-message]');
    if (!message) throw new Error('Сообщение формы авторизации не найдено.');
    message.textContent = '';

    if (!isValid) {
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    if (!(submitButton instanceof HTMLButtonElement)) throw new Error('Кнопка отправки не найдена.');
    submitButton.disabled = true;
    const isLogin = form.dataset.authForm === 'login';
    const request = isLogin
      ? login(values.email, values.password)
      : register(values.email, values.password);

    request
      .then((result) => {
        if (result.ok) {
          onSuccess();
          return;
        }

        if (isLogin && result.status === 401) {
          renderFieldErrors(form, {}, ['email', 'password']);
          message.textContent = 'Неверный email или пароль';
          return;
        }

        const responseErrors: unknown = result.errors;
        const emailError = getErrorText(responseErrors, 'emailErrMessage');
        const passwordError = getErrorText(responseErrors, 'passwordErrMessage');
        const legacyPasswordError = getErrorText(responseErrors, 'passswordErrMessage');
        const fieldErrors = {
          ...(emailError ? { email: capitalizeFirstLetter(emailError) } : {}),
          ...(passwordError ? { password: capitalizeFirstLetter(passwordError) } : {}),
          ...(legacyPasswordError
            ? { password: capitalizeFirstLetter(legacyPasswordError) }
            : {}),
        };
        renderFieldErrors(form, fieldErrors);
        message.textContent = Object.keys(fieldErrors).length
          ? ''
          : getErrorText(responseErrors, 'errMessage') || getErrorText(responseErrors, 'form') || 'Не удалось выполнить запрос. Попробуйте позже.';
      })
      .catch(() => {
        message.textContent = 'Не удалось связаться с сервером. Попробуйте позже.';
      })
      .finally(() => {
        submitButton.disabled = false;
      });
  });
}
