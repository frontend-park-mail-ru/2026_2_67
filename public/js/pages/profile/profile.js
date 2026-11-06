import { getCurrentUser } from '../../shared/auth.js';
import { profileTemplate } from '../../templates/templates.js';
import { initCart } from '../../components/cart/cart.js';
import { getMissingPasswordRequirements } from '../../shared/forms/validation.js';

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

  const passwordDialog = page.querySelector('#profile-password-dialog');
  const newPasswordInput = passwordDialog.querySelector('input[name="newPassword"]');
  const passwordRules = passwordDialog.querySelector('#profile-new-password-rules');
  // Показываем только те правила, которым новый пароль ещё не соответствует.
  function updatePasswordRules() {
    const missingRules = getMissingPasswordRequirements(newPasswordInput.value);
    passwordRules.textContent = missingRules;
    newPasswordInput.setAttribute('aria-invalid', String(Boolean(missingRules)));
  }
  // Показываем окно смены пароля и ставим курсор в первое поле.
  page.querySelector('[data-open-password-editor]').addEventListener('click', () => {
    updatePasswordRules();
    passwordDialog.showModal();
    passwordDialog.querySelector('input').focus();
  });
  newPasswordInput.addEventListener('input', updatePasswordRules);
  // Закрываем окно смены пароля крестиком.
  passwordDialog.querySelector('.profile-edit-dialog__close').addEventListener('click', () => {
    passwordDialog.close();
  });

  const photoDialog = page.querySelector('#profile-photo-dialog');
  // Открываем окно выбора фото.
  page.querySelector('[data-open-photo-editor]').addEventListener('click', () => {
    photoDialog.showModal();
  });
  photoDialog.querySelector('.profile-edit-dialog__close').addEventListener('click', () => {
    photoDialog.close();
  });

  // Кнопка «Отмена» закрывает то окно профиля, в котором находится.
  page.querySelectorAll('.profile-edit-dialog').forEach((editDialog) => {
    editDialog.querySelector('.profile-edit-dialog__cancel').addEventListener('click', () => {
      editDialog.close();
    });
  });

  const searchForm = page.querySelector('[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());
}
