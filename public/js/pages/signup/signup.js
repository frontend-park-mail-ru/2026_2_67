import { renderAuthPage } from '../../shared/forms/render-auth-page.js';
import { validateSignup } from '../../shared/forms/validation.js';
import { signupTemplate } from '../../templates/templates.js';

/**
 * Renders the signup page and connects the shared auth validation.
 * @param {HTMLElement} app Main application container.
 * @param {Function} onSuccess Callback after successful registration.
 */
export function renderSignupPage(app, onSuccess) {
  renderAuthPage(app, signupTemplate, validateSignup, onSuccess);
}
