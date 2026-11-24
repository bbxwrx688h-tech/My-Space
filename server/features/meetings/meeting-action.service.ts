import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Person } from '../../../shared/model';
import {
  exchangeCreateBody,
  invitationDecisionBody,
  requestCancelBody,
  requestDecisionBody,
  seriesCancelBody,
} from '../../../shared/contracts/meeting';
import { messages } from '../../common/notifications/messages';
import { notify, transaction } from '../../db/connection';
import { invalidateMeetingRequests, notifyInvitees } from '../../meetings/changes';
import { createExchange, decideExchange } from '../../meetings/exchanges';
import { decideBooking, expireRequests, lockSchedule } from '../../meetings/requests';

type RequestDecision = z.infer<typeof requestDecisionBody>;
type RequestCancellation = z.infer<typeof requestCancelBody>;
type InvitationDecision = z.infer<typeof invitationDecisionBody>;
type SeriesCancellation = z.infer<typeof seriesCancelBody>;
type ExchangeRequest = z.infer<typeof exchangeCreateBody>;

/** Write-side orchestration for meeting requests, invitations, series and exchanges. */
@Injectable()
export class MeetingActionService {
  decideRequest(me: Person, input: RequestDecision) {
    return transaction((db) => decideBooking(db, me, input.requestId, input.approve));
  }

  cancelRequest(me: Person, input: RequestCancellation) {
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      const request = await db.query(
        'SELECT requester_id,status FROM meeting_requests WHERE id=$1 FOR UPDATE',
        [input.requestId],
      );
      if (!request.rowCount) throw new NotFoundException('הבקשה לא נמצאה');
      if (request.rows[0].requester_id !== me.id && me.role !== 'admin')
        throw new ForbiddenException('אין הרשאה לבטל את הבקשה');
      if (request.rows[0].status !== 'pending')
        throw new ConflictException('הבקשה כבר אינה ממתינה לאישור');
      await db.query("UPDATE meeting_requests SET status='cancelled' WHERE id=$1", [
        input.requestId,
      ]);
      const approvers = await db.query<{ person_id: number }>(
        'SELECT person_id FROM meeting_request_approvals WHERE request_id=$1',
        [input.requestId],
      );
      for (const approver of approvers.rows)
        if (approver.person_id !== me.id)
          await notify(db, approver.person_id, messages.forwardedMeetingRequestCanceled);
      if (request.rows[0].requester_id !== me.id)
        await notify(db, request.rows[0].requester_id, messages.meetingRequestCanceledByAdmin);
      return { ok: true };
    });
  }

  decideInvitation(me: Person, input: InvitationDecision) {
    return transaction(async (db) => {
      await lockSchedule(db);
      const meeting = await db.query(
        'SELECT organizer_id,title,ends FROM meetings WHERE id=$1 FOR UPDATE',
        [input.meetingId],
      );
      if (!meeting.rowCount) throw new NotFoundException('הפגישה לא נמצאה');
      if (new Date(meeting.rows[0].ends).getTime() <= Date.now())
        throw new ConflictException('הפגישה כבר הסתיימה');
      const result = await db.query(
        "UPDATE meeting_invitations SET status=$3 WHERE meeting_id=$1 AND person_id=$2 AND status='pending' RETURNING meeting_id",
        [input.meetingId, me.id, input.accept ? 'accepted' : 'declined'],
      );
      if (!result.rowCount) throw new ConflictException('ההזמנה כבר נענתה או שאינה קיימת');
      await notify(
        db,
        meeting.rows[0].organizer_id,
        messages.invitationResponded(me.name, me.surname, input.accept, meeting.rows[0].title),
      );
      return { ok: true };
    });
  }

  cancelSeries(me: Person, input: SeriesCancellation) {
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      const series = await db.query(
        'SELECT s.organizer_id,p.role,p.supervisor_id FROM meeting_series s JOIN people p ON p.id=s.organizer_id WHERE s.id=$1 FOR UPDATE OF s',
        [input.seriesId],
      );
      if (!series.rowCount) throw new NotFoundException('סדרת הפגישות לא נמצאה');
      if (
        series.rows[0].organizer_id !== me.id &&
        me.role !== 'admin' &&
        !(
          me.role === 'boss' &&
          series.rows[0].role === 'manager' &&
          series.rows[0].supervisor_id === me.id
        )
      )
        throw new ForbiddenException('אין הרשאה לבטל את הסדרה');
      const from = input.fromMeetingId
        ? await db.query('SELECT starts FROM meetings WHERE id=$1 AND series_id=$2', [
            input.fromMeetingId,
            input.seriesId,
          ])
        : null;
      if (from && !from.rowCount) throw new NotFoundException('הפגישה אינה שייכת לסדרה');
      const meetings = await db.query<{ id: number }>(
        'SELECT id FROM meetings WHERE series_id=$1 AND ($2::timestamptz IS NULL OR starts >= $2) ORDER BY id',
        [input.seriesId, from?.rows[0].starts ?? null],
      );
      for (const meeting of meetings.rows)
        await notifyInvitees(db, meeting.id, messages.meetingSeriesInvitationCanceled, me.id);
      await invalidateMeetingRequests(
        db,
        meetings.rows.map((meeting) => meeting.id),
      );
      await db.query('DELETE FROM meetings WHERE id=ANY($1::int[])', [
        meetings.rows.map((meeting) => meeting.id),
      ]);
      await db.query(
        'DELETE FROM meeting_series WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM meetings WHERE series_id=$1)',
        [input.seriesId],
      );
      if (series.rows[0].organizer_id !== me.id)
        await notify(db, series.rows[0].organizer_id, messages.meetingSeriesCanceledByAdmin);
      return { ok: true };
    });
  }

  createExchange(me: Person, input: ExchangeRequest) {
    return transaction((db) =>
      createExchange(db, me, input.kind, input.meetingId, input.otherMeetingId),
    );
  }

  decideExchange(me: Person, input: RequestDecision) {
    return transaction((db) => decideExchange(db, me, input.requestId, input.approve));
  }
}
