const MAX_AVATAR_SIZE = 16 * 1024 * 1024;
const INVALID_IMAGE_MESSAGE = 'Выберите корректный файл PNG, JPG/JPEG или GIF.';

const imageSignatures: Record<string, (bytes: Uint8Array) => boolean> = {
  jpg: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  jpeg: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  png: (bytes) => bytes.length >= 8
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte),
  gif: (bytes) => bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49
    && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61,
};

const allowedTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
};

/** Validates avatar extension, declared MIME type, signature, and server size limit. */
export async function getAvatarFileError(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!Object.hasOwn(allowedTypes, extension) || allowedTypes[extension] !== file.type) return INVALID_IMAGE_MESSAGE;
  if (file.size === 0) return 'Выбранный файл пуст.';
  if (file.size > MAX_AVATAR_SIZE) return 'Размер изображения не должен превышать 16 МБ.';

  try {
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    return imageSignatures[extension](bytes) ? '' : INVALID_IMAGE_MESSAGE;
  } catch {
    return INVALID_IMAGE_MESSAGE;
  }
}
