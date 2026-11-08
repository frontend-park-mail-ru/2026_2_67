import { authorizedFetch } from '../../shared/auth.js';

export interface ProfileFields {
  name: string;
  surname: string;
  telephone: string;
  email: string;
  birthDate: string;
  description: string;
}

export interface ProfileResponse extends ProfileFields {
  avatarUrl: string;
}

export class ProfileRequestError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(status: number, details: unknown) {
    super(`Не удалось сохранить профиль: ${status}`);
    this.status = status;
    this.details = details;
  }
}

export function profileFields(value: object): ProfileFields {
  const field = (name: keyof ProfileFields): string => {
    const result: unknown = Reflect.get(value, name);
    return typeof result === 'string' ? result : '';
  };
  return { name: field('name'), surname: field('surname'), telephone: field('telephone'),
    email: field('email'), birthDate: field('birthDate'), description: field('description') };
}

export async function updateProfile(userId: string, fields: ProfileFields, avatar?: File): Promise<ProfileResponse> {
  const birthDate = /^\d{4}-\d{2}-\d{2}/.test(fields.birthDate)
    ? fields.birthDate.slice(0, 10) : fields.birthDate;
  const body = new FormData();
  body.set('name', fields.name);
  body.set('surname', fields.surname);
  body.set('telephone', fields.telephone);
  body.set('email', fields.email);
  body.set('birthDate', birthDate);
  body.set('description', fields.description);
  if (avatar) body.set('avatar', avatar);
  const response = await authorizedFetch(`/buyers/${encodeURIComponent(userId)}/profile`, {
    method: 'PATCH',
    body,
  });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProfileRequestError(response.status, result);
  if (typeof result !== 'object' || result === null ||
    !(['name', 'surname', 'telephone', 'email', 'birthDate', 'description', 'avatarUrl'] as const)
      .every((key) => typeof Reflect.get(result, key) === 'string')) {
    throw new Error('Сервер вернул профиль в неожиданном формате.');
  }
  return result as ProfileResponse;
}

export function changePassword(newPassword: string): Promise<Response> {
  return authorizedFetch('/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
}
