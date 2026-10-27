import { getCurrentUser } from '../../shared/auth.js';
import { profileTemplate } from '../../templates/templates.js';
import { initCart } from '../../components/cart/cart.js';

/** Shows the profile information already loaded for the current session. */
export function renderProfilePage(app) {
  const user = getCurrentUser();
  app.innerHTML = profileTemplate({ user, isProfile: true });

  const page = app.querySelector('.profile-page');
  initCart(page, user?.userId);

  const searchForm = page.querySelector('[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());
}
