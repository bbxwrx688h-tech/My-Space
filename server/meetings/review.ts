import { ConflictException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Meeting, Person, Review } from '../../shared/model';

/** Sign the exact proposed action and conflict versions. Re-reading the room
 * under lock before checking the signature prevents stale decisions. */
export function requireReview(
  actor: Person,
  command: unknown,
  affected: Meeting[],
  token?: string,
) {
  if (!affected.length) return;
  const delay = affected.some((m) => m.role === 'boss' && m.organizerId !== actor.id) ? 5 : 0;
  const context = JSON.stringify([
    actor.id,
    command,
    affected.map((m) => [m.id, m.version, m.role]),
  ]);
  const sign = (issued: number) =>
    createHmac('sha256', process.env.CONFIRMATION_SECRET!)
      .update(issued + ':' + context)
      .digest('hex');
  const now = Date.now();
  const [stamp, signature] = (token || '').split('.');
  let issued = now;
  if (stamp && /^[a-f0-9]{64}$/.test(signature || '')) {
    const timestamp = Number(stamp);
    const age = now - timestamp;
    if (
      age >= 0 &&
      age < 300_000 &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(sign(timestamp)))
    ) {
      if (age >= delay * 1000) return;
      issued = timestamp;
    }
  }
  const review: Review = {
    message: 'יש לאשר את השינוי בפגישות הבאות',
    affected,
    waitSeconds: Math.max(0, Math.ceil((issued + delay * 1000 - now) / 1000)),
    token: issued + '.' + sign(issued),
  };
  throw new ConflictException(review);
}
