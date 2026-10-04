/**
 * Displays validation messages next to their corresponding fields.
 * @param {HTMLFormElement} form Form containing error placeholders.
 * @param {Record<string, string>} errors Validation errors by field name.
 * @param {string[]} highlightedFields Fields to mark without repeating a shared message.
 */
export function renderFieldErrors(form, errors, highlightedFields = []) {
  const highlighted = new Set(highlightedFields);
  form.querySelectorAll('[data-error-for]').forEach((element) => {
    const fieldName = element.dataset.errorFor;
    element.textContent = errors[fieldName] || '';
    form.elements.namedItem(fieldName)?.setAttribute('aria-invalid', String(Boolean(errors[fieldName]) || highlighted.has(fieldName)));
  });
}
