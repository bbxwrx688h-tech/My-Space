import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { Person } from '../../shared/model';
import { messages } from '../common/notifications/messages';
import { notify } from '../db/connection';
import { zone } from '../../shared/time';
import { DateTime } from 'luxon';
import { invalidateMeetingRequests, notifyInvitees } from './changes';
import { assertNoHolds, expireRequests, lockSchedule } from './requests';

type ExchangeMeeting = {
  id: number;
  room_id: number;
  starts: Date;
  ends: Date;
  organizer_id: number;
  version: number;
  role: string;
};
async function readMeeting(db: PoolClient, id: number): Promise<ExchangeMeeting> {
  const result = await db.query<ExchangeMeeting>(
    'SELECT m.id,m.room_id,m.starts,m.ends,m.organizer_id,m.version,p.role FROM meetings m JOIN people p ON p.id=m.organizer_id WHERE m.id=$1 FOR UPDATE OF m',
    [id],
  );
  if (!result.rowCount) throw new NotFoundException('הפגישה לא נמצאה');
  return result.rows[0];
}

// Requests store versions and owners so approval cannot act on changed meetings.
export async function createExchange(
  db: PoolClient,
  actor: Person,
  kind: 'release' | 'swap',
  firstId: number,
  secondId?: number,
) {
  await lockSchedule(db);
  await expireRequests(db);
  const role = (await db.query('SELECT role FROM people WHERE id=$1', [actor.id])).rows[0]?.role;
  if (role === 'user') throw new ForbiddenException('אין הרשאה לבקש חדר ישיבות');
  if (kind === 'swap' && (!secondId || firstId === secondId))
    throw new BadRequestException('יש לבחור שתי פגישות שונות');
  if (kind === 'release' && secondId) throw new BadRequestException('בקשת שחרור כוללת פגישה אחת');
  const first = await readMeeting(db, firstId);
  const second = kind === 'swap' ? await readMeeting(db, secondId!) : undefined;
  if (first.starts.getTime() <= Date.now() || (second && second.starts.getTime() <= Date.now()))
    throw new BadRequestException('ניתן לבקש רק פגישות שטרם התחילו');
  if (kind === 'release' && first.organizer_id === actor.id)
    throw new BadRequestException('אפשר לבטל את הפגישה שלך ישירות');
  if (second && role !== 'admin' && (first.role === 'user' || second.role === 'user'))
    throw new BadRequestException('לא ניתן להעביר פגישה של עובד שאינו רשאי להזמין חדר');
  const expiry = Math.min(
    Date.now() + 4 * 86400000,
    first.starts.getTime(),
    second?.starts.getTime() ?? Infinity,
  );
  const result = await db.query(
    `INSERT INTO meeting_exchange_requests(kind,requester_id,first_meeting_id,first_version,first_owner_id,
      second_meeting_id,second_version,second_owner_id,expires) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      kind,
      actor.id,
      first.id,
      first.version,
      first.organizer_id,
      second?.id ?? null,
      second?.version ?? null,
      second?.organizer_id ?? null,
      new Date(expiry),
    ],
  );
  const requestId = result.rows[0].id as number;
  const owners = [...new Set([first.organizer_id, ...(second ? [second.organizer_id] : [])])];
  for (const owner of owners) {
    const ownApproval = kind === 'swap' && owner === actor.id;
    await db.query(
      'INSERT INTO meeting_exchange_approvals(request_id,person_id,approved) VALUES ($1,$2,$3)',
      [requestId, owner, ownApproval],
    );
    if (!ownApproval)
      await notify(
        db,
        owner,
        kind === 'release' ? messages.roomReleaseRequested : messages.meetingSwapRequested,
      );
  }
  if (kind === 'swap' && owners.every((owner) => owner === actor.id))
    return decideExchange(db, actor, requestId, true, true);
  return { id: requestId, status: 'pending' };
}

export async function decideExchange(
  db: PoolClient,
  actor: Person,
  requestId: number,
  approve: boolean,
  locked = false,
) {
  if (!locked) {
    await lockSchedule(db);
    await expireRequests(db);
  }
  const request = (
    await db.query('SELECT * FROM meeting_exchange_requests WHERE id=$1 FOR UPDATE', [requestId])
  ).rows[0];
  if (!request) throw new NotFoundException('הבקשה לא נמצאה');
  if (request.status !== 'pending') throw new ConflictException('הבקשה כבר אינה ממתינה לאישור');
  const approval = await db.query(
    'SELECT 1 FROM meeting_exchange_approvals WHERE request_id=$1 AND person_id=$2',
    [requestId, actor.id],
  );
  if (actor.role !== 'admin' && !approval.rowCount)
    throw new ForbiddenException('אין הרשאה לאשר בקשה זו');
  if (!approve) {
    await db.query("UPDATE meeting_exchange_requests SET status='rejected' WHERE id=$1", [
      requestId,
    ]);
    await notify(db, request.requester_id, messages.exchangeRequestRejected);
    return { status: 'rejected' };
  }
  if (actor.role === 'admin')
    await db.query('UPDATE meeting_exchange_approvals SET approved=true WHERE request_id=$1', [
      requestId,
    ]);
  else
    await db.query(
      'UPDATE meeting_exchange_approvals SET approved=true WHERE request_id=$1 AND person_id=$2',
      [requestId, actor.id],
    );
  if (
    (
      await db.query(
        'SELECT 1 FROM meeting_exchange_approvals WHERE request_id=$1 AND NOT approved',
        [requestId],
      )
    ).rowCount
  )
    return { status: 'pending' };
  // Recheck both original versions after the last approval, before any change.
  const first = await readMeeting(db, request.first_meeting_id);
  const second =
    request.kind === 'swap' ? await readMeeting(db, request.second_meeting_id) : undefined;
  if (
    first.version !== request.first_version ||
    first.organizer_id !== request.first_owner_id ||
    (second &&
      (second.version !== request.second_version ||
        second.organizer_id !== request.second_owner_id))
  ) {
    await db.query("UPDATE meeting_exchange_requests SET status='invalidated' WHERE id=$1", [
      requestId,
    ]);
    await notify(db, request.requester_id, messages.exchangeRequestCanceledAfterDetailsChanged);
    return { status: 'invalidated' };
  }
  if (first.starts.getTime() <= Date.now() || (second && second.starts.getTime() <= Date.now()))
    throw new ConflictException('אחת הפגישות כבר התחילה');
  if (second) {
    const requesterRole = (
      await db.query('SELECT role FROM people WHERE id=$1', [request.requester_id])
    ).rows[0]?.role;
    if (
      (first.role === 'user' || second.role === 'user') &&
      actor.role !== 'admin' &&
      requesterRole !== 'admin'
    )
      throw new ConflictException('תפקיד אחד מבעלי הפגישות השתנה');
    // Check both destinations before applying either half of the swap.
    for (const [meeting, destination] of [
      [first, second],
      [second, first],
    ]) {
      if (
        meeting.role === 'manager' &&
        DateTime.fromJSDate(destination.starts).setZone(zone).startOf('day') >
          DateTime.now().setZone(zone).plus({ weeks: 2 }).endOf('day')
      )
        throw new ConflictException('מועד הפגישה של מנהל חורג מטווח השבועיים');
      await assertNoHolds(
        db,
        destination.room_id,
        destination.starts.toISOString(),
        destination.ends.toISOString(),
      );
      const conflict = await db.query(
        'SELECT 1 FROM meetings WHERE room_id=$1 AND starts<$3 AND ends>$2 AND id<>ALL($4::int[]) LIMIT 1',
        [destination.room_id, destination.starts, destination.ends, [first.id, second.id]],
      );
      if (conflict.rowCount) throw new ConflictException('אחד המועדים אינו פנוי');
    }
    await db.query(
      'UPDATE meetings SET room_id=$2,starts=$3,ends=$4,version=version+1 WHERE id=$1',
      [first.id, second.room_id, second.starts, second.ends],
    );
    await db.query(
      'UPDATE meetings SET room_id=$2,starts=$3,ends=$4,version=version+1 WHERE id=$1',
      [second.id, first.room_id, first.starts, first.ends],
    );
    await notifyInvitees(db, first.id, messages.meetingInvitationTimeOrRoomChanged, actor.id);
    await notifyInvitees(db, second.id, messages.meetingInvitationTimeOrRoomChanged, actor.id);
  } else {
    await notifyInvitees(
      db,
      first.id,
      messages.meetingInvitationCanceledAfterRoomRelease,
      actor.id,
    );
    await db.query('DELETE FROM meetings WHERE id=$1', [first.id]);
  }
  await db.query("UPDATE meeting_exchange_requests SET status='approved' WHERE id=$1", [requestId]);
  await invalidateMeetingRequests(db, [first.id, ...(second ? [second.id] : [])]);
  for (const owner of new Set([
    first.organizer_id,
    ...(second ? [second.organizer_id] : []),
    request.requester_id,
  ]))
    await notify(
      db,
      owner,
      second ? messages.meetingSwapRequestApproved : messages.roomReleaseRequestApproved,
    );
  return { status: 'approved' };
}
