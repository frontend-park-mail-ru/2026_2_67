import { renderAuthPage } from '../../pages.js';

/**
 * Renders the signup page and connects the shared auth validation.
 * @param {HTMLElement} app Main application container.
 */
export function renderSignupPage(app) {
  renderAuthPage(app, window.OzonApp.templates.signup);
}

window.OzonApp.renderSignupPage = renderSignupPage;
