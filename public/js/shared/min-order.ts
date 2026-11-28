import { settings } from './onlineconf.js';

export function minOrderRemaining(total: number): number {
  return Math.max(0, Math.round((settings.minOrderAmount - total) * 100) / 100);
}
