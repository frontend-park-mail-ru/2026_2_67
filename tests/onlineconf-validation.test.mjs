import test from 'node:test';
import assert from 'node:assert/strict';
import { validateValue, validateFlag, parseIds } from '../public/js/onlineconf/validate.ts';

test('config types and flag rules follow the OnlineConf contract', () => {
  assert.equal(validateValue('number', '1000'), 1000);
  assert.throws(() => validateValue('number', '"1000"'));
  assert.deepEqual(validateValue('array', '[1,2]'), [1, 2]);
  assert.deepEqual(parseIds('1, 42'), [1, 42]);
  assert.throws(() => parseIds('email'));
  const flag = { key: 'checkout.enabled', scope: 'frontend', description: '', enabled: true,
    rolloutPercent: 50, whitelist: [42], blacklist: [] };
  assert.equal(validateFlag(flag), flag);
  assert.throws(() => validateFlag({ ...flag, rolloutPercent: 101 }));
});
