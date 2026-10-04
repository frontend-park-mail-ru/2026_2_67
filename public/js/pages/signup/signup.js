import { renderAuthPage } from '../../shared/forms/render-auth-page.js';
import { validateSignup } from '../../shared/forms/validation.js';
import { signupTemplate } from '../../templates/templates.js';
import { renderCatalogPage } from '../catalog/catalog.js';

/**
 * Renders the signup page and connects the shared auth validation.
 * @param {HTMLElement} app Main application container.
 */
export function renderSignupPage(app) {
  renderAuthPage(app, signupTemplate, validateSignup, () => renderCatalogPage(app));
}
