import { renderFieldErrors } from './render-field-errors.js';

/**
 * Renders an auth form and connects the shared validation.
 * @param {HTMLElement} app Main application container.
 * @param {Function} template Handlebars template.
 * @param {Function} validate Pure form-data validation function.
 */
export function renderAuthPage(app, template, validate) {
  app.innerHTML = template();
  const form = app.querySelector('[data-auth-form]');

  form.addEventListener('submit', function validateBeforeSubmit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const errors = validate(values);
    const isValid = Object.keys(errors).length === 0;

    renderFieldErrors(form, errors);
    app.querySelector('[data-form-message]').textContent = isValid
      ? ' '
      : 'Исправьте поля с ошибками.';
  });
}
