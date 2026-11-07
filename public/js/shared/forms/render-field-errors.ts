import type { LoginErrors, SignupErrors, SignupFormValues } from './validation.js';

/**
 * Displays validation messages next to their corresponding fields.
 * @param {HTMLFormElement} form Form containing error placeholders.
 * @param {Record<string, string>} errors Validation errors by field name.
 * @param {string[]} highlightedFields Fields to mark without repeating a shared message.
 */
export function renderFieldErrors(
  form: HTMLFormElement,
  errors: LoginErrors | SignupErrors,
  highlightedFields: (keyof SignupFormValues)[] = [],
): void {
  const highlighted = new Set<string>(highlightedFields);
  form.querySelectorAll('[data-error-for]').forEach((element) => {
    const fieldName = element.getAttribute('data-error-for');
    if (fieldName === null) return;
    const error = Object.entries(errors).find(([key]) => key === fieldName)?.[1] || '';
    element.textContent = error;
    const field = form.elements.namedItem(fieldName);
    if (field instanceof Element) {
      field.setAttribute('aria-invalid', String(Boolean(error) || highlighted.has(fieldName)));
    }
  });
}
