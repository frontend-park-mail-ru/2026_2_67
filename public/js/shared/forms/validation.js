const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function getMissingPasswordRequirements(password) {
  const missing = [];
  if ([...password].length < 8) missing.push('содержать не менее 8 символов');
  if (!/\p{Lu}/u.test(password)) missing.push('содержать хотя бы одну заглавную букву');
  if (!/\p{Ll}/u.test(password)) missing.push('содержать хотя бы одну строчную букву');
  if (!/\p{N}/u.test(password)) missing.push('содержать хотя бы одну цифру');
  if (!/[\p{P}\p{S}]/u.test(password)) missing.push('содержать хотя бы один специальный символ');
  if (/\p{White_Space}/u.test(password)) missing.push('не содержать пробелов');
  return missing.length ? `Пароль должен:\n- ${missing.join(';\n- ')}.` : '';
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
  const passwordError = getMissingPasswordRequirements(values.password);
  if (passwordError) {
    errors.password = passwordError;
  }
  if (values.password !== values.passwordRepeat) {
    errors.passwordRepeat = 'Пароли не совпадают';
  }

  return errors;
}
