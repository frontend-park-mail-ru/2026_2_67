/**
 * Displays validation messages next to their corresponding fields.
 * @param {HTMLFormElement} form Form containing error placeholders.
 * @param {Record<string, string>} errors Validation errors by field name.
 */
export function renderFieldErrors(form, errors) {
  form.querySelectorAll('[data-error-for]').forEach((element) => {
    element.textContent = errors[element.dataset.errorFor] || '';
    form.elements.namedItem(element.dataset.errorFor)?.setAttribute('aria-invalid', String(Boolean(errors[element.dataset.errorFor])));
  });
}
