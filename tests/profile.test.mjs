import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};

const { profileFields, updateProfile, ProfileRequestError } = await import('../public/js/pages/profile/profile-api.ts');

const fields = { name: 'Иван', surname: 'Иванов', telephone: '+70000000000',
  email: 'ivan@example.test', birthDate: '2000-01-01', description: 'Сохранить описание' };

test('profile PATCH sends all six text fields and accepts only confirmed response', async () => {
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return Response.json({ ...fields, name: 'Пётр', avatarUrl: '' });
  };
  const result = await updateProfile('42', { ...fields, name: 'Пётр' });
  assert.equal(request.url, '/api/v1/buyers/42/profile');
  assert.equal(request.options.method, 'PATCH');
  assert.deepEqual(JSON.parse(request.options.body), { ...fields, name: 'Пётр' });
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.equal(result.name, 'Пётр');
  assert.equal(result.description, fields.description);
  assert.deepEqual(profileFields(result), { ...fields, name: 'Пётр' });
});

test('profile rejects documented statuses and malformed success', async () => {
  for (const status of [400, 403, 404, 405, 422]) {
    globalThis.fetch = async () => Response.json({ nameErrMessage: 'Ошибка имени' }, { status });
    await assert.rejects(updateProfile('42', fields), (error) =>
      error instanceof ProfileRequestError && error.status === status && error.details.nameErrMessage === 'Ошибка имени');
  }
  globalThis.fetch = async () => Response.json({ name: 'partial' });
  await assert.rejects(updateProfile('42', fields), /неожиданном формате/);
});
