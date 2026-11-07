import { getCurrentUser } from '../../shared/auth.js';
import { profileTemplate } from '../../templates/templates.js';
import { initCart } from '../../components/cart/cart.js';
import { getMissingPasswordRequirements } from '../../shared/forms/validation.js';

function requireElement(parent: Element, selector: string): HTMLElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Не найден элемент профиля: ${selector}`);
  return element;
}

function requireDialog(parent: Element, selector: string): HTMLDialogElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLDialogElement)) throw new Error(`Не найден диалог профиля: ${selector}`);
  return element;
}

function requireInput(parent: Element, selector: string): HTMLInputElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Не найдено поле профиля: ${selector}`);
  return element;
}

/** Shows the profile information already loaded for the current session. */
export function renderProfilePage(app: HTMLElement): void {
  const user = getCurrentUser();
  app.innerHTML = profileTemplate({ user, isProfile: true });

  const page = requireElement(app, '.profile-page');
  initCart(page, user?.userId);

  const editButton = requireElement(page, '[data-open-profile-editor]');
  const dialog = requireDialog(page, '.profile-edit-dialog');
  const closeButton = requireElement(dialog, '.profile-edit-dialog__close');
  const surnameInput = requireInput(dialog, 'input[name="surname"]');

  editButton.addEventListener('click', () => {
    dialog.showModal();
    surnameInput.focus();
  });

  closeButton.addEventListener('click', () => {
    dialog.close();
  });

  const emailDialog = requireDialog(page, '#profile-email-dialog');
  const phoneDialog = requireDialog(page, '#profile-phone-dialog');

  requireElement(page, '[data-open-email-editor]').addEventListener('click', () => {
    emailDialog.showModal();
    requireInput(emailDialog, 'input').focus();
  });
  requireElement(emailDialog, '.profile-edit-dialog__close').addEventListener('click', () => {
    emailDialog.close();
  });

  requireElement(page, '[data-open-phone-editor]').addEventListener('click', () => {
    phoneDialog.showModal();
    requireInput(phoneDialog, 'input').focus();
  });
  requireElement(phoneDialog, '.profile-edit-dialog__close').addEventListener('click', () => {
    phoneDialog.close();
  });

  const passwordDialog = requireDialog(page, '#profile-password-dialog');
  const newPasswordInput = requireInput(passwordDialog, 'input[name="newPassword"]');
  const passwordRules = requireElement(passwordDialog, '#profile-new-password-rules');
  // Показываем только те правила, которым новый пароль ещё не соответствует.
  function updatePasswordRules(): void {
    const missingRules = getMissingPasswordRequirements(newPasswordInput.value);
    passwordRules.textContent = missingRules;
    newPasswordInput.setAttribute('aria-invalid', String(Boolean(missingRules)));
  }
  // Показываем окно смены пароля и ставим курсор в первое поле.
  requireElement(page, '[data-open-password-editor]').addEventListener('click', () => {
    updatePasswordRules();
    passwordDialog.showModal();
    requireInput(passwordDialog, 'input').focus();
  });
  newPasswordInput.addEventListener('input', updatePasswordRules);
  // Закрываем окно смены пароля крестиком.
  requireElement(passwordDialog, '.profile-edit-dialog__close').addEventListener('click', () => {
    passwordDialog.close();
  });

  const photoDialog = requireDialog(page, '#profile-photo-dialog');
  // Открываем окно выбора фото.
  requireElement(page, '[data-open-photo-editor]').addEventListener('click', () => {
    photoDialog.showModal();
  });
  requireElement(photoDialog, '.profile-edit-dialog__close').addEventListener('click', () => {
    photoDialog.close();
  });

  // Кнопка «Отмена» закрывает то окно профиля, в котором находится.
  page.querySelectorAll('.profile-edit-dialog').forEach((editDialog) => {
    if (!(editDialog instanceof HTMLDialogElement)) throw new Error('Не найден диалог профиля.');
    requireElement(editDialog, '.profile-edit-dialog__cancel').addEventListener('click', () => {
      editDialog.close();
    });
  });

  const searchForm = requireElement(page, '[data-catalog-search]');
  searchForm.addEventListener('submit', (event) => event.preventDefault());
}
