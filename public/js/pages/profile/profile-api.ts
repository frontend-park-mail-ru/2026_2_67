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

export async function updateProfile(userId: string, fields: ProfileFields): Promise<ProfileResponse> {
  const response = await authorizedFetch(`/buyers/${encodeURIComponent(userId)}/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
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
