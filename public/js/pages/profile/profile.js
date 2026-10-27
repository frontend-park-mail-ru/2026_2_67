import { getCurrentUser } from '../../shared/auth.js';
import { profileTemplate } from '../../templates/templates.js';
import { initCart } from '../../components/cart/cart.js';

/** Shows the profile information already loaded for the current session. */
export function renderProfilePage(app) {
  const user = getCurrentUser();
  app.innerHTML = profileTemplate({ user, isProfile: true });

  const page = app.querySelector('.profile-page');
  initCart(page, user?.userId);

  const editButton = page.querySelector('[data-open-profile-editor]');
  const dialog = page.querySelector('.profile-edit-dialog');
  const closeButton = dialog.querySelector('.profile-edit-dialog__close');
  const surnameInput = dialog.querySelector('input[name="surname"]');

  editButton.addEventListener('click', () => {
    dialog.showModal();
    surnameInput.focus();
  });

  closeButton.addEventListener('click', () => {
    dialog.close();
  });

  const emailDialog = page.querySelector('#profile-email-dialog');
  const phoneDialog = page.querySelector('#profile-phone-dialog');

  page.querySelector('[data-open-email-editor]').addEventListener('click', () => {
    emailDialog.showModal();
    emailDialog.querySelector('input').focus();
  });
  emailDialog.querySelector('.profile-edit-dialog__close').addEventListener('click', () => {
    emailDialog.close();
  });

  page.querySelector('[data-open-phone-editor]').addEventListener('click', () => {
    phoneDialog.showModal();
    phoneDialog.querySelector('input').focus();
  });
  phoneDialog.querySelector('.profile-edit-dialog__close').addEventListener('click', () => {
    phoneDialog.close();
  });

  const searchForm = page.querySelector('[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());
}
