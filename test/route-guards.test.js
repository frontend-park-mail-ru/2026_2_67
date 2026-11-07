import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';

const source = new URL('../public/js/shared/route-guards.ts', import.meta.url);
const result = await transformFileAsync(fileURLToPath(source), {
  presets: ['@babel/preset-typescript'],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`;
const {
  blockUnavailableNavigation,
  requiresAuthentication,
  shouldLeaveEmptyCheckout,
} = await import(moduleUrl);

test('protected cart routes require an authenticated user', () => {
  assert.equal(requiresAuthentication('/cart', null), true);
  assert.equal(requiresAuthentication('/checkout', null), true);
  assert.equal(requiresAuthentication('/cart', { userId: '1' }), false);
  assert.equal(requiresAuthentication('/checkout', { userId: '1' }), false);
});

test('public routes remain available to guests', () => {
  assert.equal(requiresAuthentication('/', null), false);
  assert.equal(requiresAuthentication('/login', null), false);
  assert.equal(requiresAuthentication('/signup', null), false);
});

test('unavailable navigation is cancelled before delegated SPA navigation', () => {
  let defaultPrevented = false;
  let propagationStopped = false;
  const event = {
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
  };

  assert.equal(blockUnavailableNavigation(event, false), true);
  assert.equal(defaultPrevented, true);
  assert.equal(propagationStopped, true);
});

test('available navigation is not changed', () => {
  const event = {
    preventDefault() {
      assert.fail('available navigation must not be cancelled');
    },
    stopPropagation() {
      assert.fail('available navigation must keep propagating');
    },
  };

  assert.equal(blockUnavailableNavigation(event, true), false);
});

test('checkout leaves only an active page with a loaded empty cart', () => {
  const loadedEmptyCart = {
    isPageActive: true,
    isLoading: false,
    errorMessage: '',
    canCheckout: false,
  };

  assert.equal(shouldLeaveEmptyCheckout(loadedEmptyCart), true);
  assert.equal(shouldLeaveEmptyCheckout({ ...loadedEmptyCart, isLoading: true }), false);
  assert.equal(shouldLeaveEmptyCheckout({ ...loadedEmptyCart, errorMessage: 'Request failed' }), false);
  assert.equal(shouldLeaveEmptyCheckout({ ...loadedEmptyCart, canCheckout: true }), false);
  assert.equal(shouldLeaveEmptyCheckout({ ...loadedEmptyCart, isPageActive: false }), false);
});
