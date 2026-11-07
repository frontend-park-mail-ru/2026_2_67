import assert from 'node:assert/strict';
import test from 'node:test';
import { getMissingPasswordRequirements, validateLogin, validateSignup } from '../public/js/shared/forms/validation.js';

test('login validates email and permits a nonempty short password', () => {
  assert.deepEqual(validateLogin({ email: '', password: '' }), { email: 'Введите почту.', password: 'Введите пароль.' });
  assert.deepEqual(validateLogin({ email: 'nickname', password: 'x' }), { email: 'Введите корректный email' });
  assert.deepEqual(validateLogin({ email: 'user@example.com', password: 'x' }), {});
});

test('signup validates email, password complexity and confirmation', () => {
  const valid = { email: 'user@example.com', password: 'Strong1!', passwordRepeat: 'Strong1!' };
  assert.deepEqual(validateSignup(valid), {});
  assert.equal(validateSignup({ ...valid, email: 'wrong' }).email, 'Введите корректный email');
  assert.equal(validateSignup({ ...valid, passwordRepeat: 'different' }).passwordRepeat, 'Пароли не совпадают');
  const passwordError = getMissingPasswordRequirements('weak');
  assert.ok(passwordError.includes('не менее 8 символов'));
  assert.ok(passwordError.includes('заглавную букву'));
  assert.ok(passwordError.includes('цифру'));
  assert.ok(passwordError.includes('специальный символ'));
  assert.equal(validateSignup({ ...valid, password: 'weak' }).password, passwordError);
  assert.ok(getMissingPasswordRequirements('Strong 1!').includes('не содержать пробелов'));
});
