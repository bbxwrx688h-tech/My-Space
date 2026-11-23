import { PoolClient } from 'pg';
import { notify } from '../db/connection';

// Pending takeover approvals are tied to specific meeting versions. Release
// their holds immediately if one of those meetings changes or is removed.
export async function invalidateMeetingRequests(
  db: PoolClient,
  meetingIds: number[],
  exceptRequest?: number,
) {
  if (!meetingIds.length) return;
  const invalidated = await db.query<{ requester_id: number }>(
    `UPDATE meeting_requests SET status='invalidated' WHERE status='pending'
     AND ($2::integer IS NULL OR id<>$2)
     AND (target_meeting_id=ANY($1::int[]) OR id IN (SELECT request_id FROM meeting_request_conflicts WHERE meeting_id=ANY($1::int[]))
       OR id IN (SELECT request_id FROM meeting_request_slots WHERE target_meeting_id=ANY($1::int[])))
     RETURNING requester_id`,
    [meetingIds, exceptRequest ?? null],
  );
  for (const request of invalidated.rows)
    await notify(db, request.requester_id, 'בקשת הפגישה בוטלה כי אחת הפגישות השתנתה.');
  const exchanges = await db.query<{ requester_id: number }>(
    `UPDATE meeting_exchange_requests SET status='invalidated' WHERE status='pending'
     AND (first_meeting_id=ANY($1::int[]) OR second_meeting_id=ANY($1::int[])) RETURNING requester_id`,
    [meetingIds],
  );
  for (const request of exchanges.rows)
    await notify(db, request.requester_id, 'בקשת השחרור או ההחלפה בוטלה כי אחת הפגישות השתנתה.');
}

// Notify invited employees before deleting rows, because invitations cascade.
export async function notifyInvitees(
  db: PoolClient,
  meetingId: number,
  message: string,
  actorId: number,
) {
  const recipients = await db.query<{ person_id: number }>(
    "SELECT person_id FROM meeting_invitations WHERE meeting_id=$1 AND person_id<>$2 AND status<>'declined'",
    [meetingId, actorId],
  );
  for (const recipient of recipients.rows) await notify(db, recipient.person_id, message);
}
