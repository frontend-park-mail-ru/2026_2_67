const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates login form values without accessing the DOM.
 * @param {{loginOrEmail: string, password: string}} values Login values.
 * @returns {Record<string, string>} Errors by field name.
 */
export function validateLogin(values) {
  const errors = {};

  if (!values.loginOrEmail.trim()) {
    errors.loginOrEmail = 'Введите логин или почту.';
  } else if (values.loginOrEmail.includes('@') && !EMAIL_PATTERN.test(values.loginOrEmail.trim())) {
    errors.loginOrEmail = 'Введите корректную почту.';
  }
  if (!values.password) {
    errors.password = 'Введите пароль.';
  }

  return errors;
}

/**
 * Validates signup form values without accessing the DOM.
 * @param {{login: string, email: string, password: string, passwordRepeat: string}} values Signup values.
 * @returns {Record<string, string>} Errors by field name.
 */
export function validateSignup(values) {
  const errors = {};

  if (!values.login.trim()) {
    errors.login = 'Введите логин.';
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Введите корректную почту.';
  }
  if (values.password.length < 8) {
    errors.password = 'Пароль должен содержать не менее 8 символов.';
  }
  if (values.password !== values.passwordRepeat) {
    errors.passwordRepeat = 'Пароли не совпадают.';
  }

  return errors;
}
