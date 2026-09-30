const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates login form values without accessing the DOM.
 * @param {{email: string, password: string}} values Login values.
 * @returns {Record<string, string>} Errors by field name.
 */
export function validateLogin(values) {
  const errors = {};

  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Введите корректный Email.';
  }
  if (values.password.length < 6) {
    errors.password = 'Пароль должен содержать не менее 6 символов.';
  }

  return errors;
}

/**
 * Validates signup form values without accessing the DOM.
 * @param {{name: string, email: string, password: string, passwordRepeat: string}} values Signup values.
 * @returns {Record<string, string>} Errors by field name.
 */
export function validateSignup(values) {
  const errors = {};

  if (!values.name.trim()) {
    errors.name = 'Введите имя.';
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Введите корректный Email.';
  }
  if (values.password.length < 6) {
    errors.password = 'Пароль должен содержать не менее 6 символов.';
  }
  if (values.password !== values.passwordRepeat) {
    errors.passwordRepeat = 'Пароли не совпадают.';
  }

  return errors;
}
