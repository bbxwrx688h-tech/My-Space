import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Meeting, Person } from '../../shared/model';
import { Employee, SessionGuard } from '../auth/session';
import { notify, pool, transaction } from '../db/connection';
import { id, parse } from '../validation';
import { meetingSelect } from '../meetings/schedule';
import { visibleConflicts } from '../meetings/visibility';
import { decideBooking, expireRequests, lockSchedule } from '../meetings/requests';
import { invalidateMeetingRequests, notifyInvitees } from '../meetings/changes';
import { createExchange, decideExchange } from '../meetings/exchanges';

@Controller('meetings')
@UseGuards(SessionGuard)
export class MeetingActionsController {
  @Get('requests') async requests(@Employee() me: Person) {
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      const result = await db.query(
        `SELECT r.id,r.kind,r.status,r.expires,r.requester_id AS "requesterId",p.name || ' ' || p.surname AS requester,
         CASE WHEN visibility.concealed AND r.requester_id<>$1 AND $2<>'admin' AND (p.role<>'manager' OR $2<>'boss' OR p.supervisor_id IS DISTINCT FROM $1)
          THEN 'פגישה פרטית' ELSE r.title END AS title,
         CASE WHEN visibility.concealed AND r.requester_id<>$1 AND $2<>'admin' AND (p.role<>'manager' OR $2<>'boss' OR p.supervisor_id IS DISTINCT FROM $1)
          THEN '' ELSE r.description END AS description,
         CASE WHEN visibility.concealed AND r.requester_id<>$1 AND $2<>'admin' AND (p.role<>'manager' OR $2<>'boss' OR p.supervisor_id IS DISTINCT FROM $1)
          THEN false ELSE r.visit END AS visit,
         CASE WHEN visibility.concealed AND r.requester_id<>$1 AND $2<>'admin' AND (p.role<>'manager' OR $2<>'boss' OR p.supervisor_id IS DISTINCT FROM $1)
          THEN '[]'::json ELSE COALESCE((SELECT json_agg(json_build_object('id',i.person_id,'name',u.name,'surname',u.surname) ORDER BY u.name,u.surname)
            FROM meeting_request_invitees i JOIN people u ON u.id=i.person_id WHERE i.request_id=r.id),'[]'::json) END AS invitees,
         MIN(s.starts) AS start, MAX(s.ends) AS "end", bool_and(a.approved) FILTER (WHERE a.person_id=$1) AS "myApproval",
         (SELECT json_agg(json_build_object('roomId',x.room_id,'start',x.starts,'end',x.ends) ORDER BY x.starts)
          FROM meeting_request_slots x WHERE x.request_id=r.id) AS slots,
         (SELECT COALESCE(json_agg(json_build_object('meetingId',m.id,'organizer',o.name || ' ' || o.surname,
          'title',CASE WHEN m.private AND m.organizer_id<>$1 AND $2<>'admin' AND (o.role<>'manager' OR $2<>'boss' OR o.supervisor_id IS DISTINCT FROM $1)
            AND NOT EXISTS (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$1 AND i.status<>'declined')
            THEN 'פגישה פרטית' ELSE m.title END,
          'roomId',m.room_id,'start',m.starts,'end',m.ends) ORDER BY m.starts),'[]'::json)
          FROM meetings m JOIN people o ON o.id=m.organizer_id
          WHERE m.id=r.target_meeting_id OR EXISTS (SELECT 1 FROM meeting_request_slots t WHERE t.request_id=r.id AND t.target_meeting_id=m.id)) AS targets,
         (SELECT COALESCE(json_agg(json_build_object('meetingId',c.meeting_id,'organizer',o.name || ' ' || o.surname,
          'title',CASE WHEN m.private AND m.organizer_id<>$1 AND $2<>'admin' AND (o.role<>'manager' OR $2<>'boss' OR o.supervisor_id IS DISTINCT FROM $1)
            AND NOT EXISTS (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$1 AND i.status<>'declined')
            THEN 'פגישה פרטית' ELSE m.title END,
          'start',m.starts,'end',m.ends) ORDER BY m.starts),'[]'::json)
          FROM meeting_request_conflicts c JOIN meetings m ON m.id=c.meeting_id JOIN people o ON o.id=m.organizer_id WHERE c.request_id=r.id) AS conflicts
         FROM meeting_requests r JOIN people p ON p.id=r.requester_id JOIN meeting_request_slots s ON s.request_id=r.id
         CROSS JOIN LATERAL (SELECT r.private OR EXISTS (SELECT 1 FROM meetings original WHERE original.id=r.target_meeting_id AND original.private)
           OR EXISTS (SELECT 1 FROM meeting_request_slots target JOIN meetings original ON original.id=target.target_meeting_id
             WHERE target.request_id=r.id AND original.private) AS concealed) visibility
         LEFT JOIN meeting_request_approvals a ON a.request_id=r.id
         WHERE r.status='pending' AND (r.requester_id=$1 OR $2='admin' OR EXISTS (SELECT 1 FROM meeting_request_approvals x WHERE x.request_id=r.id AND x.person_id=$1))
         GROUP BY r.id,p.id,visibility.concealed ORDER BY MIN(s.starts)`,
        [me.id, me.role],
      );
      return result.rows;
    });
  }

  @Post('requests/decision') async decide(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(z.object({ requestId: id, approve: z.boolean() }), body);
    return transaction((db) => decideBooking(db, me, input.requestId, input.approve));
  }

  @Post('requests/cancel') async cancelRequest(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(z.object({ requestId: id }), body);
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
          await notify(db, approver.person_id, 'בקשת פגישה שהועברה לאישורך בוטלה.');
      if (request.rows[0].requester_id !== me.id)
        await notify(db, request.rows[0].requester_id, 'בקשת הפגישה שלך בוטלה על ידי מנהל המערכת.');
      return { ok: true };
    });
  }

  @Get('invitations') async invitations(@Employee() me: Person) {
    const result = await pool.query(
      `SELECT m.id,m.title,m.starts AS start,m.ends AS "end",m.room_id AS "roomId",m.private,m.visit,
       p.name || ' ' || p.surname AS organizer,i.status FROM meeting_invitations i
       JOIN meetings m ON m.id=i.meeting_id JOIN people p ON p.id=m.organizer_id
       WHERE i.person_id=$1 AND i.status='pending' AND m.ends>now() ORDER BY m.starts`,
      [me.id],
    );
    return result.rows;
  }

  @Get('attendees') async attendees(@Employee() me: Person, @Query() query: unknown) {
    const input = parse(z.object({ meeting: z.coerce.number().int().positive() }), query);
    const meeting = (
      await pool.query(
        `SELECT m.private,m.organizer_id,p.supervisor_id,p.role AS owner_role,
       EXISTS (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$2 AND i.status<>'declined') AS invited
       FROM meetings m JOIN people p ON p.id=m.organizer_id WHERE m.id=$1`,
        [input.meeting, me.id],
      )
    ).rows[0];
    if (!meeting) throw new NotFoundException('הפגישה לא נמצאה');
    if (
      meeting.private &&
      meeting.organizer_id !== me.id &&
      !(
        me.role === 'boss' &&
        meeting.owner_role === 'manager' &&
        meeting.supervisor_id === me.id
      ) &&
      me.role !== 'admin' &&
      !meeting.invited
    )
      throw new ForbiddenException('אין הרשאה לצפות במוזמנים');
    return (
      await pool.query(
        `SELECT p.id,p.name,p.surname,p.upn,i.status FROM meeting_invitations i JOIN people p ON p.id=i.person_id
       WHERE i.meeting_id=$1 ORDER BY p.name,p.surname,p.upn`,
        [input.meeting],
      )
    ).rows;
  }

  @Get('upcoming') async upcoming(@Employee() me: Person) {
    if (me.role === 'user') throw new ForbiddenException('אין הרשאה לבקש החלפת פגישות');
    return transaction(async (db) => {
      const meetings = (
        await db.query<Meeting>(meetingSelect + ' WHERE m.starts>now() ORDER BY m.starts')
      ).rows;
      return visibleConflicts(db, me, meetings);
    });
  }

  @Post('invitations/decision') async decideInvitation(
    @Employee() me: Person,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ meetingId: id, accept: z.boolean() }), body);
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
        `${me.name} ${me.surname} ${input.accept ? 'אישר/ה' : 'דחה/תה'} את ההזמנה לפגישה ״${meeting.rows[0].title}״.`,
      );
      return { ok: true };
    });
  }

  @Post('series/cancel') async cancelSeries(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(z.object({ seriesId: id, fromMeetingId: id.optional() }), body);
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
        await notifyInvitees(db, meeting.id, 'סדרת פגישות שהוזמנת אליה בוטלה.', me.id);
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
        await notify(db, series.rows[0].organizer_id, 'פגישות בסדרה שלך בוטלו על ידי מנהל/ת.');
      return { ok: true };
    });
  }

  @Post('exchange') async createExchangeRequest(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(
      z.object({ kind: z.enum(['release', 'swap']), meetingId: id, otherMeetingId: id.optional() }),
      body,
    );
    return transaction((db) =>
      createExchange(db, me, input.kind, input.meetingId, input.otherMeetingId),
    );
  }

  @Get('exchange') async exchanges(@Employee() me: Person) {
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      return (
        await db.query(
          `SELECT r.id,r.kind,r.requester_id AS "requesterId",p.name || ' ' || p.surname AS requester,
         r.expires,m.starts AS start,m.ends AS "end",m.room_id AS "roomId",
         n.starts AS "otherStart",n.ends AS "otherEnd",n.room_id AS "otherRoomId",
         CASE WHEN m.private AND m.organizer_id<>$1 AND $2<>'admin' AND (mo.role<>'manager' OR $2<>'boss' OR mo.supervisor_id IS DISTINCT FROM $1)
           AND NOT EXISTS (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$1 AND i.status<>'declined')
           THEN 'פגישה פרטית' ELSE m.title END AS title,
         CASE WHEN n.private AND n.organizer_id<>$1 AND $2<>'admin' AND (second_owner.role<>'manager' OR $2<>'boss' OR second_owner.supervisor_id IS DISTINCT FROM $1)
           AND NOT EXISTS (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=n.id AND i.person_id=$1 AND i.status<>'declined')
           THEN 'פגישה פרטית' ELSE n.title END AS "otherTitle",
         a.approved AS "myApproval"
         FROM meeting_exchange_requests r JOIN people p ON p.id=r.requester_id
         LEFT JOIN meetings m ON m.id=r.first_meeting_id LEFT JOIN meetings n ON n.id=r.second_meeting_id
         LEFT JOIN people mo ON mo.id=m.organizer_id LEFT JOIN people second_owner ON second_owner.id=n.organizer_id
         LEFT JOIN meeting_exchange_approvals a ON a.request_id=r.id AND a.person_id=$1
         WHERE r.status='pending' AND (r.requester_id=$1 OR a.person_id IS NOT NULL OR $2='admin') ORDER BY r.created`,
          [me.id, me.role],
        )
      ).rows;
    });
  }

  @Post('exchange/decision') async exchangeDecision(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(z.object({ requestId: id, approve: z.boolean() }), body);
    return transaction((db) => decideExchange(db, me, input.requestId, input.approve));
  }
}
