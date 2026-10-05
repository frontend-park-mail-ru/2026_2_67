import { renderAuthPage } from '../../shared/forms/render-auth-page.js';
import { validateLogin } from '../../shared/forms/validation.js';
import { loginTemplate } from '../../templates/templates.js';

/**
 * Renders the login page and connects login-specific validation.
 * @param {HTMLElement} app Main application container.
 * @param {Function} onSuccess Callback after successful login.
 */
export function renderLoginPage(app, onSuccess) {
  renderAuthPage(app, loginTemplate, validateLogin, onSuccess);
}
