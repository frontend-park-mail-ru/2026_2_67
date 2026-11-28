import type { ConfigInput, FlagInput, ValueType } from './api.js';

export function validateValue(valueType: ValueType, text: string): unknown {
  const value: unknown = JSON.parse(text);
  const valid = valueType === 'json' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : valueType === 'array' ? Array.isArray(value)
      : typeof value === valueType && (valueType !== 'number' || Number.isFinite(value));
  if (!valid) throw new Error(`Значение не соответствует типу ${valueType}.`);
  return value;
}
export function validateConfig(input: ConfigInput): ConfigInput {
  if (!input.key.trim() || !input.scope.trim()) throw new Error('Укажите ключ и скоуп.');
  validateValue(input.valueType, JSON.stringify(input.value));
  return input;
}
export function validateFlag(input: FlagInput): FlagInput {
  if (!input.key.trim() || !input.scope.trim() || typeof input.enabled !== 'boolean'
    || !Number.isInteger(input.rolloutPercent) || input.rolloutPercent < 0 || input.rolloutPercent > 100
    || ![input.whitelist, input.blacklist].every((ids) => Array.isArray(ids)
      && ids.every((id) => Number.isSafeInteger(id) && id > 0))) {
    throw new Error('Проверьте ключ, скоуп, rolloutPercent (0–100) и списки ID.');
  }
  return input;
}
export function parseIds(text: string): number[] {
  if (!text.trim()) return [];
  const ids = text.split(',').map((part) => Number(part.trim()));
  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) throw new Error('ID должны быть положительными целыми числами через запятую.');
  return ids;
}
