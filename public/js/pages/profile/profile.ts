import { avatarSource, getCurrentUser, setCurrentUserProfile } from '../../shared/auth.js';
import { profileTemplate } from '../../templates/templates.js';
import { initCart } from '../../components/cart/cart.js';
import { getEmailError, getMissingPasswordRequirements } from '../../shared/forms/validation.js';
import { ProfileRequestError, changePassword, profileFields, updateProfile } from './profile-api.js';
import type { ProfileFields } from './profile-api.js';

const PERSON_NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;

function phoneDigits(value: string): string {
  // Берём только цифры номера; +7 или начальную 8 из сохранённого номера пропускаем.
  const digits = value.replace(/\D/g, '');
  return value.startsWith('+7') || (digits.length === 11 && /^[78]/.test(digits))
    ? digits.slice(1, 11) : digits.slice(0, 10);
}

function formatPhone(value: string): string {
  // Отделяем +7 пробелом от цифр и делим цифры на группы 3, 3, 2 и 2.
  const digits = phoneDigits(value);
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  return ['+7', ...groups.filter(Boolean)].join(' ');
}

let uploadedAvatar: { userId: string; avatarUrl: string; previewUrl: string } | null = null;

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
  if (uploadedAvatar && (uploadedAvatar.userId !== user?.userId || uploadedAvatar.avatarUrl !== user?.avatarUrl)) {
    URL.revokeObjectURL(uploadedAvatar.previewUrl);
    uploadedAvatar = null;
  }
  const fullName = [user?.name, user?.surname].filter(Boolean).join(' ');
  const savedBirthDate = typeof user?.birthDate === 'string' ? user.birthDate : '';
  const birthDate = /^\d{4}-\d{2}-\d{2}/.test(savedBirthDate)
    ? savedBirthDate.slice(0, 10) : '';
  const [year, month, day] = birthDate.split('-');
  const birthDateDisplay = birthDate ? `${day}-${month}-${year}` : '';
  const avatarUrl = uploadedAvatar?.previewUrl || avatarSource(user?.avatarUrl);
  const displayedUser = user ? { ...user, avatarSrc: avatarUrl } : null;
  app.innerHTML = profileTemplate({ user: displayedUser, isProfile: true, fullName, birthDate, birthDateDisplay, avatarUrl });

  const page = requireElement(app, '.profile-page');
  initCart(page, user?.userId);

  const editButton = requireElement(page, '[data-open-profile-editor]');
  const dialog = requireDialog(page, '.profile-edit-dialog');
  const closeButton = requireElement(dialog, '.profile-edit-dialog__close');
  const surnameInput = requireInput(dialog, 'input[name="surname"]');
  const birthDateInput = requireInput(dialog, 'input[name="birthDate"]');

  editButton.addEventListener('click', () => {
    const today = new Date();
    birthDateInput.max = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    dialog.showModal();
    surnameInput.focus();
  });

  closeButton.addEventListener('click', () => {
    dialog.close();
  });

  const emailDialog = requireDialog(page, '#profile-email-dialog');
  const phoneDialog = requireDialog(page, '#profile-phone-dialog');

  const phoneInput = requireInput(phoneDialog, 'input[name="phoneNumber"]');
  function showPhoneMask(): void {
    // После ввода оставляем курсор в конце уже заполненной части номера.
    phoneInput.value = formatPhone(phoneInput.value);
    phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
  }
  phoneInput.addEventListener('input', showPhoneMask);

  const editableDialogs = [dialog, emailDialog, phoneDialog];
  const errorNames: Record<keyof ProfileFields, string> = {
    name: 'nameErrMessage', surname: 'surnameErrMessage', telephone: 'telephoneErrMessage',
    email: 'emailErrMessage', birthDate: 'birthDateErrMessage', description: 'descriptionErrMessage',
  };
  let saved = profileFields(user ?? {});
  function errorText(value: unknown, key: string): string {
    if (typeof value !== 'object' || value === null) return '';
    const text: unknown = Reflect.get(value, key);
    return typeof text === 'string' ? text : '';
  }
  editableDialogs.forEach((editor) => {
    const apply = requireElement(editor, '.profile-edit-dialog__apply');
    if (!(apply instanceof HTMLButtonElement)) throw new Error('Кнопка сохранения профиля не найдена.');
    const message = document.createElement('p');
    message.className = 'profile-edit-dialog__message';
    message.setAttribute('role', 'alert');
    editor.querySelector('.profile-edit-dialog__footer')?.before(message);
    editor.querySelectorAll('input').forEach((input) => {
      if (!(input instanceof HTMLInputElement) || !(input.name in errorNames || input.name === 'phoneNumber')) return;
      const error = document.createElement('span');
      error.className = 'profile-edit-dialog__error';
      error.setAttribute('data-profile-error', input.name === 'phoneNumber' ? 'telephone' : input.name);
      error.setAttribute('role', 'alert');
      input.closest('label')?.append(error);
      input.addEventListener('input', () => {
        error.textContent = '';
        input.removeAttribute('aria-invalid');
      });
    });
    apply.addEventListener('click', async () => {
      if (!user?.userId || apply.disabled) return;
      if (!(Object.keys(errorNames) as (keyof ProfileFields)[]).every((key) => typeof user[key] === 'string')) {
        message.textContent = 'Не удалось загрузить профиль. Обновите страницу и попробуйте снова.';
        return;
      }
      message.textContent = '';
      editor.querySelectorAll('[data-profile-error]').forEach((element) => { element.textContent = ''; });
      const fields = { ...saved };
      editor.querySelectorAll('input').forEach((input) => {
        if (!(input instanceof HTMLInputElement) || !(input.name in fields || input.name === 'phoneNumber')) return;
        const key = (input.name === 'phoneNumber' ? 'telephone' : input.name) as keyof ProfileFields;
        if (input.type !== 'date' || input.dataset.changed === 'true') {
          fields[key] = input.value;
        }
      });
      if (editor === dialog) {
        const invalidName = fields.name !== '' && !PERSON_NAME_PATTERN.test(fields.name.trim());
        const invalidSurname = fields.surname !== '' && !PERSON_NAME_PATTERN.test(fields.surname.trim());
        if (invalidName) {
          requireElement(editor, '[data-profile-error="name"]').textContent = 'Имя может содержать только буквы, пробелы, дефисы и апострофы.';
          requireInput(editor, 'input[name="name"]').setAttribute('aria-invalid', 'true');
        }
        if (invalidSurname) {
          requireElement(editor, '[data-profile-error="surname"]').textContent = 'Фамилия может содержать только буквы, пробелы, дефисы и апострофы.';
          requireInput(editor, 'input[name="surname"]').setAttribute('aria-invalid', 'true');
        }
        if (invalidName || invalidSurname) return;

        let dateError = '';
        if (birthDateInput.validity.badInput) {
          dateError = 'Введите корректную дату рождения.';
        } else if (birthDateInput.validity.rangeUnderflow) {
          dateError = 'Дата рождения не может быть раньше 01.01.1909.';
        } else if (birthDateInput.validity.rangeOverflow) {
          dateError = 'Дата рождения не может быть позже сегодняшнего дня.';
        }
        if (dateError) {
          requireElement(editor, '[data-profile-error="birthDate"]').textContent = dateError;
          birthDateInput.setAttribute('aria-invalid', 'true');
          return;
        }
      }
      if (editor === emailDialog) {
        const emailError = getEmailError(fields.email);
        if (emailError) {
          requireElement(editor, '[data-profile-error="email"]').textContent = emailError;
          requireInput(editor, 'input[name="email"]').setAttribute('aria-invalid', 'true');
          return;
        }
      }
      if (editor === phoneDialog) {
        const digits = phoneDigits(phoneInput.value);
        if (digits.length > 0 && digits.length < 10) {
          requireElement(editor, '[data-profile-error="telephone"]').textContent = 'Введите 10 цифр после +7.';
          phoneInput.setAttribute('aria-invalid', 'true');
          return;
        }
        fields.telephone = digits ? `+7${digits}` : '';
      }
      apply.disabled = true;
      try {
        const result = await updateProfile(user.userId, fields);
        saved = profileFields(result);
        setCurrentUserProfile(result, user.userId);
        if (page.isConnected) renderProfilePage(app);
      } catch (error) {
        if (error instanceof ProfileRequestError && error.status === 422) {
          let shown = false;
          (Object.keys(errorNames) as (keyof ProfileFields)[]).forEach((key) => {
            const text = errorText(error.details, errorNames[key]);
            if (!text) return;
            const target = editor.querySelector(`[data-profile-error="${key}"]`);
            if (target) {
              target.textContent = text;
              const input = editor.querySelector(`input[name="${key === 'telephone' ? 'phoneNumber' : key}"]`);
              input?.setAttribute('aria-invalid', 'true');
              shown = true;
            }
          });
          message.textContent = shown ? '' : errorText(error.details, 'errMessage') || 'Проверьте данные профиля.';
        } else if (error instanceof ProfileRequestError) {
          message.textContent = ({ 400: 'Некорректный запрос.', 403: 'Нет доступа к изменению профиля.',
            404: 'Профиль не найден.', 405: 'Сохранение профиля пока не поддерживается сервером.' } as Record<number, string>)[error.status]
            || 'Не удалось сохранить профиль. Попробуйте позже.';
        } else {
          message.textContent = 'Не удалось сохранить профиль. Попробуйте позже.';
        }
      } finally {
        apply.disabled = false;
      }
    });
  });
  birthDateInput.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement) event.target.dataset.changed = 'true';
  });

  requireElement(page, '[data-open-email-editor]').addEventListener('click', () => {
    emailDialog.showModal();
    requireInput(emailDialog, 'input').focus();
  });
  requireElement(emailDialog, '.profile-edit-dialog__close').addEventListener('click', () => {
    emailDialog.close();
  });

  requireElement(page, '[data-open-phone-editor]').addEventListener('click', () => {
    phoneDialog.showModal();
    phoneInput.focus();
    showPhoneMask();
  });
  requireElement(phoneDialog, '.profile-edit-dialog__close').addEventListener('click', () => {
    phoneDialog.close();
  });

  const passwordDialog = requireDialog(page, '#profile-password-dialog');
  const newPasswordInput = requireInput(passwordDialog, 'input[name="newPassword"]');
  const confirmPasswordInput = requireInput(passwordDialog, 'input[name="confirmPassword"]');
  const passwordRules = requireElement(passwordDialog, '#profile-new-password-rules');
  const passwordMessage = requireElement(passwordDialog, '#profile-password-message');
  const applyPassword = requireElement(passwordDialog, '.profile-edit-dialog__apply');
  if (!(applyPassword instanceof HTMLButtonElement)) throw new Error('Кнопка смены пароля не найдена.');
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
    newPasswordInput.focus();
  });
  newPasswordInput.addEventListener('input', updatePasswordRules);
  applyPassword.addEventListener('click', async () => {
    if (applyPassword.disabled) return;
    passwordMessage.textContent = '';
    if (getMissingPasswordRequirements(newPasswordInput.value)) {
      passwordMessage.textContent = 'Проверьте требования к новому паролю.';
      return;
    }
    if (newPasswordInput.value !== confirmPasswordInput.value) {
      passwordMessage.textContent = 'Пароли не совпадают.';
      return;
    }
    applyPassword.disabled = true;
    try {
      const response = await changePassword(newPasswordInput.value);
      if (response.ok) {
        passwordDialog.close();
        return;
      }
      if (response.status === 422) {
        const details: unknown = await response.json().catch(() => ({}));
        passwordMessage.textContent = errorText(details, 'passwordErrMessage') || 'Проверьте новый пароль.';
      } else if (response.status === 401 || response.status === 403) {
        passwordMessage.textContent = 'Не удалось подтвердить вход. Войдите в аккаунт снова.';
      } else {
        passwordMessage.textContent = 'Не удалось изменить пароль. Попробуйте позже.';
      }
    } catch {
      passwordMessage.textContent = 'Не удалось изменить пароль. Попробуйте позже.';
    } finally {
      applyPassword.disabled = false;
    }
  });
  passwordDialog.addEventListener('close', () => {
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    passwordMessage.textContent = '';
  });
  // Закрываем окно смены пароля крестиком.
  requireElement(passwordDialog, '.profile-edit-dialog__close').addEventListener('click', () => {
    passwordDialog.close();
  });

  const photoDialog = requireDialog(page, '#profile-photo-dialog');
  const photoFile = requireInput(photoDialog, '[data-photo-file]');
  const photoStatus = requireElement(photoDialog, '[data-photo-status]');
  const savePhoto = requireElement(photoDialog, '.profile-edit-dialog__apply');
  if (!(savePhoto instanceof HTMLButtonElement)) throw new Error('Кнопка сохранения фото не найдена.');
  const currentPhotoStatus = photoStatus.textContent ?? '';

  // При каждом открытии начинаем выбор файла заново.
  requireElement(page, '[data-open-photo-editor]').addEventListener('click', () => {
    photoFile.value = '';
    photoStatus.textContent = currentPhotoStatus;
    photoDialog.showModal();
  });
  requireElement(photoDialog, '[data-select-photo]').addEventListener('click', () => {
    photoFile.click();
  });
  photoFile.addEventListener('change', () => {
    const file = photoFile.files?.[0];
    photoStatus.textContent = file ? `Выбран файл: ${file.name}` : currentPhotoStatus;
  });
  savePhoto.addEventListener('click', async () => {
    if (!user?.userId || savePhoto.disabled) return;
    const file = photoFile.files?.[0];
    if (!file) {
      photoStatus.textContent = 'Сначала выберите файл.';
      return;
    }
    if (!file.type.startsWith('image/') || file.size > 16 * 1024 * 1024) {
      photoStatus.textContent = 'Выберите изображение размером не более 16 МБ.';
      return;
    }
    if (!saved.name.trim() || !saved.email.trim() || !saved.birthDate.trim()) {
      photoStatus.textContent = 'Для сохранения фото заполните имя, почту и дату рождения.';
      return;
    }

    savePhoto.disabled = true;
    try {
      const result = await updateProfile(user.userId, saved, file);
      setCurrentUserProfile(result, user.userId);
      if (uploadedAvatar) URL.revokeObjectURL(uploadedAvatar.previewUrl);
      uploadedAvatar = { userId: user.userId, avatarUrl: result.avatarUrl, previewUrl: URL.createObjectURL(file) };
      if (page.isConnected) renderProfilePage(app);
    } catch (error) {
      photoStatus.textContent = error instanceof ProfileRequestError && error.status === 422
        ? errorText(error.details, 'avatarErrMessage') || 'Не удалось сохранить фото. Проверьте данные профиля.'
        : 'Не удалось сохранить фото. Попробуйте ещё раз.';
    } finally {
      savePhoto.disabled = false;
    }
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

}
