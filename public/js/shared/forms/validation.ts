const EMAIL_LOCAL_PART = "[A-Za-z0-9!#$%&'*+/=?^`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^`{|}~-]+)*";
const EMAIL_DOMAIN_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const EMAIL_PATTERN = new RegExp('^' + EMAIL_LOCAL_PART + '@' + EMAIL_DOMAIN_LABEL + '(?:\\.' + EMAIL_DOMAIN_LABEL + ')+$', 'i');

export function getEmailError(email: string): string {
  const [localPart] = email.split('@');
  return email.length <= 254 && localPart.length <= 64 && EMAIL_PATTERN.test(email)
    ? '' : '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email';
}

export function getProfileEmailError(email: string, typeMismatch: boolean): string {
  if (/\p{Script=Cyrillic}/u.test(email)) return '\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u043b\u0430\u0442\u0438\u043d\u0441\u043a\u0438\u0435 \u0431\u0443\u043a\u0432\u044b \u0432 \u0430\u0434\u0440\u0435\u0441\u0435 \u043f\u043e\u0447\u0442\u044b';
  return typeMismatch ? '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 email' : getEmailError(email);
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
  if (password.length < 8) missing.push('\u043d\u0435 \u043c\u0435\u043d\u0435\u0435 8 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432');
  if (password.length > 72) missing.push('\u043d\u0435 \u0431\u043e\u043b\u0435\u0435 72 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432');
  if (/[^\x21-\x7E]/.test(password)) missing.push('\u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0447\u0430\u0442\u043d\u044b\u0435 ASCII-\u0441\u0438\u043c\u0432\u043e\u043b\u044b \u0431\u0435\u0437 \u043f\u0440\u043e\u0431\u0435\u043b\u043e\u0432');
  if (!/[A-Z]/.test(password)) missing.push('\u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0443 \u0437\u0430\u0433\u043b\u0430\u0432\u043d\u0443\u044e \u043b\u0430\u0442\u0438\u043d\u0441\u043a\u0443\u044e \u0431\u0443\u043a\u0432\u0443');
  if (!/[a-z]/.test(password)) missing.push('\u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0443 \u0441\u0442\u0440\u043e\u0447\u043d\u0443\u044e \u043b\u0430\u0442\u0438\u043d\u0441\u043a\u0443\u044e \u0431\u0443\u043a\u0432\u0443');
  if (!/[0-9]/.test(password)) missing.push('\u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0443 \u0446\u0438\u0444\u0440\u0443');
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('\u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u0438\u043d \u0441\u043f\u0435\u0446\u0438\u0430\u043b\u044c\u043d\u044b\u0439 \u0441\u0438\u043c\u0432\u043e\u043b');
  return missing.length ? `\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d:\n- ${missing.join(';\n- ')}.` : '';
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
    errors.email = '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043f\u043e\u0447\u0442\u0443.';
  } else if (emailError) {
    errors.email = emailError;
  }
  if (!values.password) {
    errors.password = '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043f\u0430\u0440\u043e\u043b\u044c.';
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
    errors.passwordRepeat = '\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442';
  }

  return errors;
}