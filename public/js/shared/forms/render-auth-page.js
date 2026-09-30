/**
 * Renders an auth form and connects the shared validation.
 * @param {HTMLElement} app Main application container.
 * @param {Function} template Handlebars template.
 */
export function renderAuthPage(app, template) {
  app.innerHTML = template();
  const form = app.querySelector('[data-auth-form]');

  form.addEventListener('submit', function validateBeforeSubmit(event) {
    event.preventDefault();
    const isValid = window.OzonApp.validateAuthForm(form);
    app.querySelector('[data-form-message]').textContent = isValid
      ? ' '
      : 'Исправьте поля с ошибками.';
  });
}
