import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLogin, validateSignup } from '../public/js/shared/forms/validation.js';

test('validateLogin accepts valid credentials', () => {
  assert.deepEqual(validateLogin({ email: 'user@example.com', password: '123456' }), {});
});

test('validateLogin returns the existing email and password messages', () => {
  assert.deepEqual(validateLogin({ email: 'invalid', password: '12345' }), {
    email: 'Введите корректный Email.',
    password: 'Пароль должен содержать не менее 6 символов.',
  });
});

test('validateSignup accepts valid registration data', () => {
  assert.deepEqual(validateSignup({
    name: 'Иван',
    email: 'user@example.com',
    password: '123456',
    passwordRepeat: '123456',
  }), {});
});

test('validateSignup returns all existing signup messages', () => {
  assert.deepEqual(validateSignup({
    name: ' ',
    email: 'invalid',
    password: '12345',
    passwordRepeat: 'other',
  }), {
    name: 'Введите имя.',
    email: 'Введите корректный Email.',
    password: 'Пароль должен содержать не менее 6 символов.',
    passwordRepeat: 'Пароли не совпадают.',
  });
});
