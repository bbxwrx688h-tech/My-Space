import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { Person } from '../../shared/model';
import { errors } from '../common/errors';
import { messages } from '../common/notifications/messages';
import { notify } from '../db/connection';
import { invalidateMeetingRequests, notifyInvitees } from './changes';

// Every operation that can affect room availability uses this transaction lock.
// A single lock keeps multi-room swaps and multi-occurrence series deadlock-free.
export async function lockSchedule(db: PoolClient) {
  await db.query('SELECT pg_advisory_xact_lock(6349203)');
}

// Expiry is applied on reads and writes, so an old hold never blocks a booking.
// The status update also guarantees that the requester receives only one notice.
export async function expireRequests(db: PoolClient) {
  const expired = await db.query<{ id: number; requester_id: number }>(
    "UPDATE meeting_requests SET status='expired' WHERE status='pending' AND expires<=now() RETURNING id,requester_id",
  );
  for (const request of expired.rows)
    await notify(db, request.requester_id, messages.meetingRequestExpired);
  // An edit cannot be approved after its original meeting has ended or changed.
  const invalidated = await db.query<{ requester_id: number }>(
    `UPDATE meeting_requests r SET status='invalidated' WHERE r.status='pending' AND
     ((r.kind='edit' AND NOT EXISTS (SELECT 1 FROM meetings m WHERE m.id=r.target_meeting_id
       AND m.version=r.target_version AND m.organizer_id=r.requester_id AND m.ends>now()))
      OR (r.kind IN ('series_edit','boss_edit') AND EXISTS (SELECT 1 FROM meeting_request_slots s
       LEFT JOIN meetings m ON m.id=s.target_meeting_id WHERE s.request_id=r.id
       AND (m.id IS NULL OR m.version<>s.target_version OR m.organizer_id<>s.target_organizer_id OR m.ends<=now()))))
     RETURNING requester_id`,
  );
  for (const request of invalidated.rows)
    await notify(db, request.requester_id, messages.meetingChangeRequestInvalidated);
  const exchanges = await db.query<{ requester_id: number }>(
    "UPDATE meeting_exchange_requests SET status='expired' WHERE status='pending' AND expires<=now() RETURNING requester_id",
  );
  for (const request of exchanges.rows)
    await notify(db, request.requester_id, messages.exchangeRequestExpired);
}

export async function withScheduleLock<T>(db: PoolClient, action: () => Promise<T>): Promise<T> {
  await lockSchedule(db);
  return action();
}

export async function withRequestExpiry<T>(db: PoolClient, action: () => Promise<T>): Promise<T> {
  await lockSchedule(db);
  await expireRequests(db);
  return action();
}

export async function assertNoHolds(
  db: PoolClient,
  roomId: number,
  start: string,
  end: string,
  except?: number,
) {
  const held = await db.query(
    `SELECT 1 FROM meeting_request_slots s JOIN meeting_requests r ON r.id=s.request_id
     WHERE r.status='pending' AND r.expires>now() AND s.room_id=$1 AND s.starts<$3 AND s.ends>$2
       AND ($4::integer IS NULL OR r.id<>$4) LIMIT 1`,
    [roomId, start, end, except ?? null],
  );
  if (held.rowCount) throw new ConflictException(errors.roomHeld);
}

export interface BookingProposal {
  roomId: number;
  title: string;
  description: string;
  private: boolean;
  visit: boolean;
  invitees: number[];
  slots: Array<{
    start: string;
    end: string;
    targetMeetingId?: number;
    targetVersion?: number;
    targetOrganizerId?: number;
  }>;
  recurring: boolean;
  targetMeetingId?: number;
  targetVersion?: number;
}
export interface ConflictSnapshot {
  id: number;
  version: number;
  organizerId: number;
  role: string;
  ownerSupervisorId?: number | null;
}

export async function makeBookingRequest(
  db: PoolClient,
  actor: Person,
  proposal: BookingProposal,
  conflicts: ConflictSnapshot[],
) {
  let approvers: number[];
  // A manager has one assigned approver; a takeover needs every affected boss.
  if (actor.role === 'manager') {
    if (conflicts.length) throw new ConflictException('מנהלים יכולים לבקש רק חדר פנוי');
    const boss = await db.query(
      "SELECT p.id FROM people e JOIN people p ON p.id=e.supervisor_id WHERE e.id=$1 AND p.role='boss'",
      [actor.id],
    );
    if (!boss.rowCount)
      throw new BadRequestException('יש לפנות למנהל המערכת כדי לשייך לך מנהל בכיר');
    approvers = [boss.rows[0].id];
  } else {
    approvers = [
      ...new Set(
        conflicts
          .filter(
            (m) =>
              m.organizerId !== actor.id &&
              (m.role === 'boss' || (m.role === 'manager' && m.ownerSupervisorId !== actor.id)),
          )
          .map((m) => m.organizerId),
      ),
    ];
    if (!approvers.length) throw new BadRequestException('לא נמצאה פגישה הדורשת אישור');
    if (
      conflicts.some((m) => m.role !== 'manager' && m.role !== 'boss' && m.organizerId !== actor.id)
    )
      throw new ConflictException(errors.contactAdmin);
  }
  const earliest = proposal.slots.reduce(
    (min, slot) => (slot.start < min ? slot.start : min),
    proposal.slots[0].start,
  );
  // The earliest requested occurrence can start before the four-day deadline.
  const result = await db.query(
    `INSERT INTO meeting_requests(requester_id,kind,title,description,private,visit,recurring,expires,target_meeting_id,target_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,LEAST(now()+interval '96 hours',$8::timestamptz),$9,$10) RETURNING id`,
    [
      actor.id,
      actor.role === 'manager'
        ? proposal.targetMeetingId
          ? 'edit'
          : 'booking'
        : proposal.slots.some((slot) => slot.targetMeetingId)
          ? proposal.slots.length === 1
            ? 'boss_edit'
            : 'series_edit'
          : 'takeover',
      proposal.title,
      proposal.description,
      proposal.private,
      proposal.visit,
      proposal.recurring,
      earliest,
      proposal.targetMeetingId ?? null,
      proposal.targetVersion ?? null,
    ],
  );
  const requestId = result.rows[0].id as number;
  // Insert all held slots before committing the request. Schedule writers use
  // the same lock, so none can take an occurrence while this transaction runs.
  await db.query(
    `INSERT INTO meeting_request_slots(request_id,room_id,starts,ends,target_meeting_id,target_version,target_organizer_id)
     SELECT $1,$2,s.start_time,s.end_time,s.target_id,s.target_version,s.target_owner
     FROM unnest($3::timestamptz[],$4::timestamptz[],$5::int[],$6::int[],$7::int[])
     AS s(start_time,end_time,target_id,target_version,target_owner)`,
    [
      requestId,
      proposal.roomId,
      proposal.slots.map((slot) => slot.start),
      proposal.slots.map((slot) => slot.end),
      proposal.slots.map((slot) => slot.targetMeetingId ?? null),
      proposal.slots.map((slot) => slot.targetVersion ?? null),
      proposal.slots.map((slot) => slot.targetOrganizerId ?? null),
    ],
  );
  await db.query(
    `INSERT INTO meeting_request_conflicts(request_id,meeting_id,version,organizer_id,organizer_role)
     SELECT $1,c.id,c.version,c.owner,c.role FROM unnest($2::int[],$3::int[],$4::int[],$5::text[]) AS c(id,version,owner,role)`,
    [
      requestId,
      conflicts.map((conflict) => conflict.id),
      conflicts.map((conflict) => conflict.version),
      conflicts.map((conflict) => conflict.organizerId),
      conflicts.map((conflict) => conflict.role),
    ],
  );
  await db.query(
    'INSERT INTO meeting_request_invitees(request_id,person_id) SELECT $1,person_id FROM unnest($2::int[]) AS u(person_id)',
    [requestId, proposal.invitees],
  );
  for (const approver of approvers) {
    await db.query('INSERT INTO meeting_request_approvals(request_id,person_id) VALUES ($1,$2)', [
      requestId,
      approver,
    ]);
    await notify(db, approver, messages.meetingRequestSubmitted(actor.name, actor.surname));
  }
  return { id: requestId, pending: true };
}

// Invites and notifications are inserted alongside each meeting, including a series.
export async function insertMeetings(db: PoolClient, actorId: number, proposal: BookingProposal) {
  const seriesId = proposal.recurring
    ? (
        await db.query('INSERT INTO meeting_series(organizer_id) VALUES ($1) RETURNING id', [
          actorId,
        ])
      ).rows[0].id
    : null;
  const meetings = await db.query<{ id: number; starts: Date }>(
    `INSERT INTO meetings(title,description,starts,ends,room_id,organizer_id,private,visit,series_id)
     SELECT $1,$2,s.start_time,s.end_time,$5,$6,$7,$8,$9
     FROM unnest($3::timestamptz[],$4::timestamptz[]) AS s(start_time,end_time)
     RETURNING id,starts`,
    [
      proposal.title,
      proposal.description,
      proposal.slots.map((slot) => slot.start),
      proposal.slots.map((slot) => slot.end),
      proposal.roomId,
      actorId,
      proposal.private,
      proposal.visit,
      seriesId,
    ],
  );
  const ids = meetings.rows.map((meeting) => meeting.id);
  await db.query(
    `INSERT INTO meeting_invitations(meeting_id,person_id)
     SELECT m.id,p.person_id FROM unnest($1::int[]) AS m(id) CROSS JOIN unnest($2::int[]) AS p(person_id)`,
    [ids, proposal.invitees],
  );
  // Intentional bulk-notice exception: the per-occurrence date is built in SQL,
  // so this copy must stay in sync with messages.invitedToMeeting.
  await db.query(
    `INSERT INTO notices(person_id,message)
     SELECT p.person_id,'הוזמנת לפגישה ״' || $3::text || '״ בתאריך ' ||
       to_char(m.starts AT TIME ZONE 'Asia/Jerusalem','DD/MM/YYYY HH24:MI') || '.'
     FROM unnest($1::int[],$2::timestamptz[]) AS m(id,starts) CROSS JOIN unnest($4::int[]) AS p(person_id)`,
    [ids, meetings.rows.map((meeting) => meeting.starts), proposal.title, proposal.invitees],
  );
  const first = meetings.rows.find(
    (meeting) => meeting.starts.getTime() === new Date(proposal.slots[0].start).getTime(),
  );
  return { id: first?.id, pending: false };
}

export async function decideBooking(
  db: PoolClient,
  actor: Person,
  requestId: number,
  approve: boolean,
) {
  return withRequestExpiry(db, async () => {
    const request = (
      await db.query('SELECT * FROM meeting_requests WHERE id=$1 FOR UPDATE', [requestId])
    ).rows[0];
    if (!request) throw new NotFoundException(errors.requestNotFound);
    if (request.status !== 'pending') throw new ConflictException(errors.requestNotPending);
    const permission = await db.query(
      'SELECT 1 FROM meeting_request_approvals WHERE request_id=$1 AND person_id=$2',
      [requestId, actor.id],
    );
    if (actor.role !== 'admin' && !permission.rowCount)
      throw new ForbiddenException('אין הרשאה לאשר בקשה זו');
    if (!approve) {
      await db.query("UPDATE meeting_requests SET status='rejected' WHERE id=$1", [requestId]);
      await notify(db, request.requester_id, messages.meetingRequestRejected);
      return { status: 'rejected' };
    }
    // A boss approves only their own row. The admin may approve every row.
    if (actor.role === 'admin')
      await db.query('UPDATE meeting_request_approvals SET approved=true WHERE request_id=$1', [
        requestId,
      ]);
    else
      await db.query(
        'UPDATE meeting_request_approvals SET approved=true WHERE request_id=$1 AND person_id=$2',
        [requestId, actor.id],
      );
    const remaining = await db.query(
      'SELECT 1 FROM meeting_request_approvals WHERE request_id=$1 AND NOT approved LIMIT 1',
      [requestId],
    );
    if (remaining.rowCount) return { status: 'pending' };

    // A role or supervisor may have changed while the request was pending.
    const requester = (
      await db.query('SELECT id,role,supervisor_id FROM people WHERE id=$1', [request.requester_id])
    ).rows[0];
    const approvals = (
      await db.query('SELECT person_id FROM meeting_request_approvals WHERE request_id=$1', [
        requestId,
      ])
    ).rows;
    if (
      ((request.kind === 'booking' || request.kind === 'edit') &&
        (requester.role !== 'manager' ||
          (requester.supervisor_id === null
            ? actor.role !== 'admin' || approvals.length !== 0
            : approvals.length !== 1 || approvals[0].person_id !== requester.supervisor_id))) ||
      ((request.kind === 'takeover' ||
        request.kind === 'boss_edit' ||
        request.kind === 'series_edit') &&
        requester.role !== 'boss')
    ) {
      await db.query("UPDATE meeting_requests SET status='invalidated' WHERE id=$1", [requestId]);
      await notify(db, request.requester_id, messages.meetingRequestCanceledAfterRoleChange);
      return { status: 'invalidated' };
    }
    const slots = (
      await db.query(
        'SELECT room_id,starts,ends,target_meeting_id,target_version,target_organizer_id FROM meeting_request_slots WHERE request_id=$1 ORDER BY starts',
        [requestId],
      )
    ).rows;
    const snapshots = (
      await db.query('SELECT * FROM meeting_request_conflicts WHERE request_id=$1', [requestId])
    ).rows;
    if (request.kind === 'edit') {
      const target = await db.query('SELECT version,organizer_id,ends FROM meetings WHERE id=$1', [
        request.target_meeting_id,
      ]);
      if (
        !target.rowCount ||
        target.rows[0].version !== request.target_version ||
        target.rows[0].organizer_id !== request.requester_id ||
        new Date(target.rows[0].ends).getTime() <= Date.now()
      ) {
        await db.query("UPDATE meeting_requests SET status='invalidated' WHERE id=$1", [requestId]);
        await notify(
          db,
          request.requester_id,
          messages.meetingChangeRequestCanceledAfterOriginalChanged,
        );
        return { status: 'invalidated' };
      }
    }
    if (request.kind === 'series_edit' || request.kind === 'boss_edit') {
      for (const slot of slots) {
        const target = await db.query(
          'SELECT m.version,m.organizer_id,m.ends,p.role,p.supervisor_id FROM meetings m JOIN people p ON p.id=m.organizer_id WHERE m.id=$1',
          [slot.target_meeting_id],
        );
        if (
          !target.rowCount ||
          target.rows[0].version !== slot.target_version ||
          target.rows[0].organizer_id !== slot.target_organizer_id ||
          new Date(target.rows[0].ends).getTime() <= Date.now() ||
          (target.rows[0].organizer_id !== request.requester_id &&
            !(
              target.rows[0].role === 'manager' &&
              target.rows[0].supervisor_id === request.requester_id
            ))
        ) {
          await db.query("UPDATE meeting_requests SET status='invalidated' WHERE id=$1", [
            requestId,
          ]);
          await notify(
            db,
            request.requester_id,
            messages.meetingChangeRequestCanceledAfterMeetingChanged,
          );
          return { status: 'invalidated' };
        }
      }
    }
    const targetIds = slots.map((slot) => slot.target_meeting_id).filter(Boolean);
    if (request.target_meeting_id) targetIds.push(request.target_meeting_id);
    // Every overlap must still match the exact meeting version that was reviewed.
    for (const slot of slots) {
      await assertNoHolds(
        db,
        slot.room_id,
        slot.starts.toISOString(),
        slot.ends.toISOString(),
        requestId,
      );
      const overlaps = (
        await db.query(
          'SELECT m.id,m.version,m.organizer_id FROM meetings m WHERE m.room_id=$1 AND m.starts<$3 AND m.ends>$2 AND m.id<>ALL($4::int[])',
          [slot.room_id, slot.starts, slot.ends, targetIds],
        )
      ).rows;
      for (const overlap of overlaps) {
        if (
          !snapshots.some(
            (old) =>
              old.meeting_id === overlap.id &&
              old.version === overlap.version &&
              old.organizer_id === overlap.organizer_id,
          )
        ) {
          await db.query("UPDATE meeting_requests SET status='invalidated' WHERE id=$1", [
            requestId,
          ]);
          await notify(
            db,
            request.requester_id,
            messages.meetingRequestCanceledAfterScheduleChanged,
          );
          return { status: 'invalidated' };
        }
      }
    }
    for (const snapshot of snapshots) {
      const current = await db.query(
        'SELECT m.version,m.organizer_id,p.role,p.supervisor_id FROM meetings m JOIN people p ON p.id=m.organizer_id WHERE m.id=$1',
        [snapshot.meeting_id],
      );
      if (
        !current.rowCount ||
        current.rows[0].version !== snapshot.version ||
        current.rows[0].organizer_id !== snapshot.organizer_id ||
        current.rows[0].role !== snapshot.organizer_role ||
        (current.rows[0].role === 'manager' &&
          current.rows[0].organizer_id !== request.requester_id &&
          current.rows[0].supervisor_id !== request.requester_id &&
          !approvals.some((approval) => approval.person_id === current.rows[0].organizer_id))
      ) {
        await db.query("UPDATE meeting_requests SET status='invalidated' WHERE id=$1", [requestId]);
        await notify(db, request.requester_id, messages.meetingRequestCanceledAfterMeetingChanged);
        return { status: 'invalidated' };
      }
    }
    // Cancellations, replacement meetings, invitations and notices share a commit.
    for (const snapshot of snapshots) {
      await notifyInvitees(
        db,
        snapshot.meeting_id,
        messages.meetingInvitationCanceled,
        request.requester_id,
      );
      await db.query('DELETE FROM meetings WHERE id=$1', [snapshot.meeting_id]);
      if (snapshot.organizer_id !== request.requester_id)
        await notify(db, snapshot.organizer_id, messages.meetingCanceledAfterApproval);
    }
    await invalidateMeetingRequests(
      db,
      snapshots.map((snapshot) => snapshot.meeting_id),
      requestId,
    );
    const invitees = (
      await db.query('SELECT person_id FROM meeting_request_invitees WHERE request_id=$1', [
        requestId,
      ])
    ).rows.map((row) => row.person_id);
    if (request.kind === 'series_edit' || request.kind === 'boss_edit') {
      for (const slot of slots) {
        await notifyInvitees(
          db,
          slot.target_meeting_id,
          messages.meetingInvitationDetailsUpdated,
          request.requester_id,
        );
        await db.query(
          'DELETE FROM meeting_invitations WHERE meeting_id=$1 AND person_id<>ALL($2::int[])',
          [slot.target_meeting_id, invitees],
        );
        for (const invitee of invitees) {
          if (invitee === slot.target_organizer_id) continue;
          const added = await db.query(
            'INSERT INTO meeting_invitations(meeting_id,person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING person_id',
            [slot.target_meeting_id, invitee],
          );
          if (added.rowCount) await notify(db, invitee, messages.invitedToMeeting(request.title));
        }
        await db.query(
          'UPDATE meetings SET title=$2,description=$3,starts=$4,ends=$5,room_id=$6,private=$7,visit=$8,version=version+1 WHERE id=$1',
          [
            slot.target_meeting_id,
            request.title,
            request.description,
            slot.starts,
            slot.ends,
            slot.room_id,
            request.private,
            request.visit,
          ],
        );
        if (slot.target_organizer_id !== request.requester_id)
          await notify(db, slot.target_organizer_id, messages.meetingUpdatedAfterRequestApproval);
      }
      await invalidateMeetingRequests(db, targetIds, requestId);
    } else if (request.kind === 'edit') {
      await notifyInvitees(
        db,
        request.target_meeting_id,
        messages.meetingInvitationDetailsUpdated,
        request.requester_id,
      );
      await db.query(
        'DELETE FROM meeting_invitations WHERE meeting_id=$1 AND person_id<>ALL($2::int[])',
        [request.target_meeting_id, invitees],
      );
      for (const invitee of invitees) {
        const added = await db.query(
          'INSERT INTO meeting_invitations(meeting_id,person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING person_id',
          [request.target_meeting_id, invitee],
        );
        if (added.rowCount) await notify(db, invitee, messages.invitedToMeeting(request.title));
      }
      await db.query(
        'UPDATE meetings SET title=$2,description=$3,starts=$4,ends=$5,room_id=$6,private=$7,visit=$8,version=version+1 WHERE id=$1',
        [
          request.target_meeting_id,
          request.title,
          request.description,
          slots[0].starts,
          slots[0].ends,
          slots[0].room_id,
          request.private,
          request.visit,
        ],
      );
      await invalidateMeetingRequests(db, [request.target_meeting_id], requestId);
    } else
      await insertMeetings(db, request.requester_id, {
        roomId: slots[0].room_id,
        title: request.title,
        description: request.description,
        private: request.private,
        visit: request.visit,
        recurring: request.recurring,
        invitees,
        slots: slots.map((slot) => ({
          start: slot.starts.toISOString(),
          end: slot.ends.toISOString(),
        })),
      });
    await db.query("UPDATE meeting_requests SET status='approved' WHERE id=$1", [requestId]);
    await notify(db, request.requester_id, messages.meetingRequestApproved);
    return { status: 'approved' };
  });
}
