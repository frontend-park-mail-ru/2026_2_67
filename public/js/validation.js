window.OzonApp = window.OzonApp || {};

/**
 * Проверяет поля формы и выводит сообщения рядом с невалидными полями.
 * @param {HTMLFormElement} form Форма входа или регистрации.
 * @returns {boolean} true, если ошибок нет.
 */
window.OzonApp.validateAuthForm = function validateAuthForm(form) {
  var values = Object.fromEntries(new FormData(form));
  var errors = {};
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (form.dataset.authForm === 'signup' && !values.name.trim()) {
    errors.name = 'Введите имя.';
  }
  if (!emailPattern.test(values.email.trim())) {
    errors.email = 'Введите корректный Email.';
  }
  if (values.password.length < 6) {
    errors.password = 'Пароль должен содержать не менее 6 символов.';
  }
  if (form.dataset.authForm === 'signup' && values.password !== values.passwordRepeat) {
    errors.passwordRepeat = 'Пароли не совпадают.';
  }

  form.querySelectorAll('[data-error-for]').forEach(function showError(element) {
    element.textContent = errors[element.dataset.errorFor] || '';
  });

  return Object.keys(errors).length === 0;
};
