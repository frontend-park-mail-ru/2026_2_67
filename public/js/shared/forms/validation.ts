const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getEmailError(email: string): string {
  return EMAIL_PATTERN.test(email.trim()) ? '' : 'Введите корректный email';
}

export function getProfileEmailError(email: string, typeMismatch: boolean): string {
  if (/\p{Script=Cyrillic}/u.test(email)) return 'Используйте латинские буквы в адресе почты';
  return typeMismatch ? 'Введите корректный email' : getEmailError(email);
}

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface SignupFormValues extends LoginFormValues {
  passwordRepeat: string;
}

export type LoginErrors = Partial<Record<keyof LoginFormValues, string>>;
export type SignupErrors = Partial<Record<keyof SignupFormValues, string>>;

export function getMissingPasswordRequirements(password: string): string {
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
 * @param {{email: string, password: string}} values Login values.
 * @returns {Record<string, string>} Errors by field name.
 */
export function validateLogin(values: LoginFormValues): LoginErrors {
  const errors: LoginErrors = {};
  const emailError = getEmailError(values.email);

  if (!values.email.trim()) {
    errors.email = 'Введите почту.';
  } else if (emailError) {
    errors.email = emailError;
  }
  if (!values.password) {
    errors.password = 'Введите пароль.';
  }

  return errors;
}

/**
 * Validates signup form values without accessing the DOM.
 * @param {{email: string, password: string, passwordRepeat: string}} values Signup values.
 * @returns {Record<string, string>} Errors by field name.
 */
export function validateSignup(values: SignupFormValues): SignupErrors {
  const errors: SignupErrors = {};

  const emailError = getEmailError(values.email);
  if (emailError) errors.email = emailError;
  const passwordError = getMissingPasswordRequirements(values.password);
  if (passwordError) {
    errors.password = passwordError;
  }
  if (values.password !== values.passwordRepeat) {
    errors.passwordRepeat = 'Пароли не совпадают';
  }

  return errors;
}
