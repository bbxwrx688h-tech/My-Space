import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + '.' + scryptSync(password, salt, 64).toString('hex');
}

export function matchesPassword(password: string, encoded: string) {
  const [salt, hex] = encoded.split('.');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hex, 'hex'));
}
