const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REQUIREMENTS = `Пароль должен:
- содержать не менее 8 символов;
- содержать хотя бы одну заглавную букву;
- содержать хотя бы одну строчную букву;
- содержать хотя бы одну цифру;
- содержать хотя бы один специальный символ;
- не содержать пробельных символов.`;

function isValidSignupPassword(password) {
  return [...password].length >= 8
    && /\p{Lu}/u.test(password)
    && /\p{Ll}/u.test(password)
    && /\p{N}/u.test(password)
    && /[\p{P}\p{S}]/u.test(password)
    && !/\p{White_Space}/u.test(password);
}

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
    errors.loginOrEmail = 'Введите корректный email';
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
    errors.email = 'Введите корректный email';
  }
  if (!isValidSignupPassword(values.password)) {
    errors.password = PASSWORD_REQUIREMENTS;
  }
  if (values.password !== values.passwordRepeat) {
    errors.passwordRepeat = 'Пароли не совпадают';
  }

  return errors;
}
