import { renderAuthPage } from '../../shared/forms/render-auth-page.js';
import { validateLogin } from '../../shared/forms/validation.js';
import { loginTemplate } from '../../templates/templates.js';
import { renderCatalogPage } from '../catalog/catalog.js';

/**
 * Renders the login page and connects login-specific validation.
 * @param {HTMLElement} app Main application container.
 */
export function renderLoginPage(app) {
  renderAuthPage(app, loginTemplate, validateLogin, () => renderCatalogPage(app));
}
