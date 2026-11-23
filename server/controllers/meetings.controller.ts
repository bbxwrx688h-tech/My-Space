import {
  BadRequestException,
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
import { DateTime } from 'luxon';
import { z } from 'zod';
import { Meeting, Person } from '../../shared/model';
import { Employee, SessionGuard } from '../auth/session';
import { notify, transaction } from '../db/connection';
import { date, description, id, parse, shortText, zone } from '../validation';
import { interval, meetingSelect } from '../meetings/schedule';
import { requireReview } from '../meetings/review';
import { visibleConflicts } from '../meetings/visibility';
import { invalidateMeetingRequests, notifyInvitees } from '../meetings/changes';
import {
  assertNoHolds,
  expireRequests,
  insertMeetings,
  lockSchedule,
  makeBookingRequest,
} from '../meetings/requests';

const time = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/);
// A change includes its target version so edits cannot silently overwrite newer edits.
const fields = z.object({
  roomId: id,
  date,
  from: time,
  until: z.union([time, z.literal('24:00')]),
  title: shortText,
  description,
});
const inviteesField = z.array(id).refine((items) => new Set(items).size === items.length);
const target = z.object({ roomId: id, meetingId: id, version: id });
const recurrence = z
  .object({
    frequency: z.enum(['daily', 'weekly']),
    endDate: date.optional(),
    count: z.number().int().min(1).optional(),
  })
  .refine((value) => (value.endDate === undefined) !== (value.count === undefined));
const command = z.discriminatedUnion('action', [
  fields.extend({
    action: z.literal('create'),
    recurrence: recurrence.optional(),
    private: z.boolean().default(false),
    visit: z.boolean().default(false),
    invitees: inviteesField.default([]),
  }),
  fields.merge(target).extend({
    action: z.literal('edit'),
    scope: z.enum(['single', 'following']).default('single'),
    private: z.boolean().optional(),
    visit: z.boolean().optional(),
    invitees: inviteesField.optional(),
  }),
  target.extend({ action: z.literal('cancel') }),
]);

@Controller('meetings')
@UseGuards(SessionGuard)
export class MeetingsController {
  @Get() async list(@Employee() viewer: Person, @Query() query: unknown) {
    const { room, start } = parse(
      z.object({ room: z.coerce.number().int().positive(), start: date }),
      query,
    );
    const first = DateTime.fromISO(start, { zone });
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      const result = await db.query(
        meetingSelect + ` WHERE m.room_id=$1 AND m.ends>$2 AND m.starts<$3 ORDER BY m.starts`,
        [room, first.toJSDate(), first.plus({ days: 14 }).toJSDate()],
      );
      const allowed = await db.query<{ id: number }>(
        `SELECT m.id FROM meetings m JOIN people p ON p.id=m.organizer_id
         WHERE m.room_id=$1 AND (m.organizer_id=$2 OR $3='admin' OR (p.role='manager' AND $3='boss' AND p.supervisor_id=$2)
         OR EXISTS (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$2 AND i.status<>'declined'))`,
        [room, viewer.id, viewer.role],
      );
      const visible = new Set(allowed.rows.map((row) => row.id));
      const meetings = result.rows.map((meeting) =>
        meeting.private && !visible.has(meeting.id)
          ? { ...meeting, title: 'פגישה פרטית', description: '', visit: false, private: true }
          : meeting,
      );
      const holds = await db.query(
        `SELECT -s.id AS id,s.room_id AS "roomId",r.requester_id AS "organizerId",p.name || ' ' || p.surname AS organizer,
         p.role,CASE WHEN visibility.concealed AND r.requester_id<>$4 AND $5<>'admin' AND (p.role<>'manager' OR $5<>'boss' OR p.supervisor_id IS DISTINCT FROM $4)
           THEN 'פגישה פרטית' ELSE r.title END AS title,
         CASE WHEN visibility.concealed AND r.requester_id<>$4 AND $5<>'admin' AND (p.role<>'manager' OR $5<>'boss' OR p.supervisor_id IS DISTINCT FROM $4)
           THEN '' ELSE r.description END AS description,
         s.starts AS start,s.ends AS "end",0 AS version,true AS pending,visibility.concealed AS private,
         CASE WHEN visibility.concealed AND r.requester_id<>$4 AND $5<>'admin' AND (p.role<>'manager' OR $5<>'boss' OR p.supervisor_id IS DISTINCT FROM $4)
           THEN false ELSE r.visit END AS visit
         FROM meeting_request_slots s JOIN meeting_requests r ON r.id=s.request_id JOIN people p ON p.id=r.requester_id
         CROSS JOIN LATERAL (SELECT r.private OR EXISTS (SELECT 1 FROM meetings original WHERE original.id=r.target_meeting_id AND original.private)
           OR EXISTS (SELECT 1 FROM meeting_request_slots target JOIN meetings original ON original.id=target.target_meeting_id
             WHERE target.request_id=r.id AND original.private) AS concealed) visibility
         WHERE s.room_id=$1 AND s.ends>$2 AND s.starts<$3 AND r.status='pending' AND r.expires>now()`,
        [room, first.toJSDate(), first.plus({ days: 14 }).toJSDate(), viewer.id, viewer.role],
      );
      return [...meetings, ...holds.rows];
    });
  }

  @Post() async change(@Employee() requester: Person, @Body() body: unknown) {
    const { change, token } = parse(
      z.object({ change: command, token: z.string().max(160).optional() }),
      body,
    );
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      // Every write for this room takes the same lock, even when the room is empty.
      const room = await db.query('SELECT site,name FROM rooms WHERE id=$1 FOR UPDATE', [
        change.roomId,
      ]);
      if (!room.rowCount) throw new NotFoundException('חדר הישיבות לא נמצא');
      // Read the role again inside the transaction in case an admin changed it
      // after this request's session was authenticated.
      const actor = (
        await db.query<Person>('SELECT * FROM people WHERE id=$1 FOR SHARE', [requester.id])
      ).rows[0];
      // Legacy direct creation must not bypass the new approval requirements.
      if (change.action === 'create' && actor.role === 'user')
        throw new ForbiddenException('נדרש אישור להזמנת חדר הישיבות');
      let original: Meeting | undefined;
      if (change.action !== 'create') {
        original = (
          await db.query<Meeting>(meetingSelect + ' WHERE m.id=$1 FOR SHARE OF p', [
            change.meetingId,
          ])
        ).rows[0];
        if (!original) throw new NotFoundException('הפגישה אינה קיימת');
        if (change.action === 'cancel' && original.roomId !== change.roomId)
          throw new ConflictException('חדר הפגישה השתנה. יש לפתוח אותה מחדש.');
        if (original.organizerId !== actor.id && actor.role !== 'boss' && actor.role !== 'admin')
          throw new ForbiddenException('אין הרשאה לשנות את הפגישה');
        if (actor.role === 'user' && change.action !== 'cancel')
          throw new ForbiddenException('לא ניתן לשנות פגישה בתפקיד הנוכחי');
        const organizer = await db.query('SELECT supervisor_id FROM people WHERE id=$1', [
          original.organizerId,
        ]);
        if (
          actor.role === 'boss' &&
          original.organizerId !== actor.id &&
          (original.role !== 'manager' || organizer.rows[0]?.supervisor_id !== actor.id)
        )
          throw new ForbiddenException('אין הרשאה לשנות את הפגישה');
        if (original.version !== change.version)
          throw new ConflictException('פרטי הפגישה השתנו. יש לפתוח אותה מחדש.');
        if (new Date(original.end).getTime() <= Date.now())
          throw new BadRequestException('הפגישה כבר הסתיימה');
      }

      const ownerRole =
        original?.role === 'manager' && actor.role !== 'admin' ? 'manager' : actor.role;
      const times =
        change.action === 'cancel' ? null : interval(change, ownerRole, undefined, original?.start);
      let targets = original ? [original] : [];
      let slots: Array<{
        start: string;
        end: string;
        targetMeetingId?: number;
        targetVersion?: number;
        targetOrganizerId?: number;
      }> = [];
      if (times) slots.push({ start: times[0], end: times[1] });
      if (change.action === 'edit' && change.scope === 'following') {
        if (!original?.seriesId || (actor.role !== 'boss' && actor.role !== 'admin'))
          throw new ForbiddenException('אין הרשאה לערוך את הפגישות הבאות בסדרה');
        targets = (
          await db.query<Meeting>(
            meetingSelect +
              ' WHERE m.series_id=$1 AND m.starts>=$2 ORDER BY m.starts FOR SHARE OF p',
            [original.seriesId, original.start],
          )
        ).rows;
        // Shift civil dates while keeping the selected Jerusalem wall time.
        const originalDay = DateTime.fromJSDate(new Date(original.start), { zone }).toISODate()!;
        const shift = DateTime.fromISO(change.date, { zone: 'UTC' }).diff(
          DateTime.fromISO(originalDay, { zone: 'UTC' }),
          'days',
        ).days;
        slots = targets.map((targetMeeting) => {
          const occurrenceDay = DateTime.fromJSDate(new Date(targetMeeting.start), { zone })
            .plus({ days: shift })
            .toISODate()!;
          const occurrence = interval(
            { ...change, date: occurrenceDay },
            ownerRole,
            undefined,
            targetMeeting.start,
          );
          return {
            start: occurrence[0],
            end: occurrence[1],
            targetMeetingId: targetMeeting.id,
            targetVersion: targetMeeting.version,
            targetOrganizerId: targetMeeting.organizerId,
          };
        });
      }
      if (change.action === 'create' && change.recurrence) {
        if (actor.role !== 'boss' && actor.role !== 'admin')
          throw new ForbiddenException('רק מנהל בכיר או מנהל מערכת יכולים ליצור פגישות חוזרות');
        const rule = change.recurrence;
        let day = DateTime.fromISO(change.date, { zone });
        if (rule.endDate && rule.endDate < change.date)
          throw new BadRequestException('תאריך סיום הסדרה קודם לפגישה הראשונה');
        const remainingDays = Math.floor(
          DateTime.fromISO('9999-12-31', { zone }).diff(day, 'days').days,
        );
        if (
          rule.count &&
          rule.count > Math.floor(remainingDays / (rule.frequency === 'weekly' ? 7 : 1)) + 1
        )
          throw new BadRequestException('מספר הפגישות חורג מטווח התאריכים הנתמך');
        while (true) {
          if (rule.count !== undefined && slots.length >= rule.count) break;
          if (rule.endDate && day.toISODate()! >= rule.endDate) break;
          day = day.plus({ days: rule.frequency === 'weekly' ? 7 : 1 });
          if (day.year > 9999)
            throw new BadRequestException('סדרת הפגישות חורגת מטווח התאריכים הנתמך');
          // Daily series use office working days; Friday and Saturday are closed.
          if (rule.frequency === 'daily' && (day.weekday === 5 || day.weekday === 6)) continue;
          if (rule.endDate && day.toISODate()! > rule.endDate) break;
          const occurrence = interval({ ...change, date: day.toISODate()! }, actor.role);
          slots.push({ start: occurrence[0], end: occurrence[1] });
        }
      }
      const targetById = new Map(targets.map((targetMeeting) => [targetMeeting.id, targetMeeting]));
      const changedSlots = slots.filter((slot) => {
        const old = slot.targetMeetingId ? targetById.get(slot.targetMeetingId) : original;
        return (
          !old ||
          old.roomId !== change.roomId ||
          new Date(slot.start).getTime() !== new Date(old.start).getTime() ||
          new Date(slot.end).getTime() !== new Date(old.end).getTime()
        );
      });
      const pendingHolds = await db.query<Meeting>(
        `SELECT DISTINCT ON (r.id) -r.id AS id,s.room_id AS "roomId",r.requester_id AS "organizerId",
         p.name || ' ' || p.surname AS organizer,p.role,('בקשה ממתינה: ' || r.title) AS title,
         '' AS description,s.starts AS start,s.ends AS "end",0 AS version
         FROM meeting_requests r JOIN meeting_request_slots s ON s.request_id=r.id
         JOIN people p ON p.id=r.requester_id WHERE r.status='pending' AND r.expires>now() AND s.room_id=$1
         AND EXISTS (SELECT 1 FROM unnest($2::timestamptz[],$3::timestamptz[]) AS proposed(starts,ends)
           WHERE s.starts<proposed.ends AND s.ends>proposed.starts) ORDER BY r.id,s.starts`,
        [
          change.roomId,
          changedSlots.map((slot) => slot.start),
          changedSlots.map((slot) => slot.end),
        ],
      );
      if (pendingHolds.rowCount && actor.role !== 'admin')
        throw new ConflictException('החדר שמור לבקשה הממתינה לאישור');
      const holds = pendingHolds.rows.sort((a, b) => a.id - b.id);
      const overrideHolds = async () => {
        for (const hold of holds) {
          await db.query(
            "UPDATE meeting_requests SET status='invalidated' WHERE id=$1 AND status='pending'",
            [-hold.id],
          );
          await notify(db, hold.organizerId, 'בקשת הפגישה בוטלה בעקבות הזמנה של מנהל המערכת.');
        }
      };
      // Intervals are half-open: a meeting can start exactly when another ends.
      const overlaps = (
        await db.query<Meeting>(
          meetingSelect +
            ` WHERE m.room_id=$1 AND m.id<>ALL($4::int[]) AND EXISTS
          (SELECT 1 FROM unnest($2::timestamptz[],$3::timestamptz[]) AS proposed(starts,ends)
           WHERE m.starts<proposed.ends AND m.ends>proposed.starts) ORDER BY m.id FOR SHARE OF p`,
          [
            change.roomId,
            slots.map((slot) => slot.start),
            slots.map((slot) => slot.end),
            [...targetById.keys()],
          ],
        )
      ).rows;
      if (
        change.action === 'edit' &&
        change.scope === 'following' &&
        overlaps.some((meeting) => meeting.seriesId === original?.seriesId)
      )
        throw new ConflictException('המועד החדש חופף לפגישה קודמת באותה הסדרה');
      if (overlaps.length && actor.role !== 'boss' && actor.role !== 'admin')
        throw new ConflictException('חדר הישיבות תפוס במועד שנבחר');
      if (change.action === 'create') {
        const invitees = change.invitees.filter((personId) => personId !== actor.id);
        const people = await db.query('SELECT id FROM people WHERE id=ANY($1::int[])', [invitees]);
        if (people.rowCount !== invitees.length)
          throw new BadRequestException('אחד המוזמנים לא נמצא במערכת');
        const proposal = {
          roomId: change.roomId,
          title: change.title,
          description: change.description,
          private: change.private,
          visit: change.visit,
          invitees,
          recurring: !!change.recurrence,
          slots,
        };
        if (
          actor.role === 'manager' ||
          (actor.role === 'boss' &&
            overlaps.some((m) => m.role === 'boss' && m.organizerId !== actor.id))
        )
          return makeBookingRequest(db, actor, proposal, overlaps);
        if (
          actor.role === 'boss' &&
          overlaps.some((m) => m.role !== 'manager' && m.organizerId !== actor.id)
        )
          throw new ConflictException('יש לפנות למנהל המערכת בנוגע לפגישה זו');
        if (overlaps.length || holds.length)
          requireReview(
            actor,
            change,
            [...(await visibleConflicts(db, actor, overlaps)), ...holds],
            token,
          );
        await overrideHolds();
        for (const overlap of overlaps) {
          await notifyInvitees(db, overlap.id, 'פגישה שהוזמנת אליה בוטלה.', actor.id);
          await db.query('DELETE FROM meetings WHERE id=$1', [overlap.id]);
          if (overlap.organizerId !== actor.id)
            await notify(db, overlap.organizerId, 'הפגישה שלך בוטלה בעקבות הזמנה אחרת.');
        }
        await invalidateMeetingRequests(
          db,
          overlaps.map((meeting) => meeting.id),
        );
        return insertMeetings(db, actor.id, proposal);
      }
      if (
        change.action === 'edit' &&
        actor.role === 'manager' &&
        original &&
        (change.roomId !== original.roomId ||
          new Date(times![0]).getTime() !== new Date(original.start).getTime() ||
          new Date(times![1]).getTime() !== new Date(original.end).getTime())
      ) {
        const existing = await db.query<{ person_id: number }>(
          'SELECT person_id FROM meeting_invitations WHERE meeting_id=$1',
          [original.id],
        );
        const invitees = (change.invitees ?? existing.rows.map((row) => row.person_id)).filter(
          (personId) => personId !== original!.organizerId,
        );
        const people = await db.query('SELECT id FROM people WHERE id=ANY($1::int[])', [invitees]);
        if (people.rowCount !== invitees.length)
          throw new BadRequestException('אחד המוזמנים לא נמצא במערכת');
        return makeBookingRequest(
          db,
          actor,
          {
            roomId: change.roomId,
            title: change.title,
            description: change.description,
            private: change.private ?? !!original.private,
            visit: change.visit ?? !!original.visit,
            invitees,
            recurring: false,
            slots,
            targetMeetingId: original.id,
            targetVersion: original.version,
          },
          overlaps,
        );
      }
      if (change.action === 'edit' && change.scope === 'following' && original) {
        const existing = await db.query<{ person_id: number }>(
          'SELECT person_id FROM meeting_invitations WHERE meeting_id=$1',
          [original.id],
        );
        const invitees = (change.invitees ?? existing.rows.map((row) => row.person_id)).filter(
          (personId) => personId !== original!.organizerId,
        );
        const people = await db.query('SELECT id FROM people WHERE id=ANY($1::int[])', [invitees]);
        if (people.rowCount !== invitees.length)
          throw new BadRequestException('אחד המוזמנים לא נמצא במערכת');
        if (
          actor.role === 'boss' &&
          overlaps.some((meeting) => meeting.role === 'boss' && meeting.organizerId !== actor.id)
        ) {
          // A pending series change must not create a second hold, including on
          // occurrences whose time is unchanged until the approval is complete.
          for (const slot of slots) await assertNoHolds(db, change.roomId, slot.start, slot.end);
          return makeBookingRequest(
            db,
            actor,
            {
              roomId: change.roomId,
              title: change.title,
              description: change.description,
              private: change.private ?? !!original.private,
              visit: change.visit ?? !!original.visit,
              invitees,
              recurring: true,
              slots,
            },
            overlaps,
          );
        }
        if (
          actor.role === 'boss' &&
          overlaps.some((meeting) => meeting.role !== 'manager' && meeting.organizerId !== actor.id)
        )
          throw new ConflictException('יש לפנות למנהל המערכת בנוגע לפגישה זו');
        const affected = [...targets, ...overlaps].sort((a, b) => a.id - b.id);
        requireReview(
          actor,
          change,
          [...(await visibleConflicts(db, actor, affected)), ...holds],
          token,
        );
        await overrideHolds();
        for (const overlap of overlaps) {
          await notifyInvitees(db, overlap.id, 'פגישה שהוזמנת אליה בוטלה.', actor.id);
          await db.query('DELETE FROM meetings WHERE id=$1', [overlap.id]);
          if (overlap.organizerId !== actor.id)
            await notify(db, overlap.organizerId, 'הפגישה שלך בוטלה בעקבות שינוי סדרה.');
        }
        await invalidateMeetingRequests(db, [
          ...targets.map((item) => item.id),
          ...overlaps.map((item) => item.id),
        ]);
        for (const slot of slots) {
          await notifyInvitees(
            db,
            slot.targetMeetingId!,
            'פרטי פגישה חוזרת שהוזמנת אליה עודכנו.',
            actor.id,
          );
          if (change.invitees) {
            await db.query(
              'DELETE FROM meeting_invitations WHERE meeting_id=$1 AND person_id<>ALL($2::int[])',
              [slot.targetMeetingId, invitees],
            );
            for (const invitee of invitees) {
              const inserted = await db.query(
                'INSERT INTO meeting_invitations(meeting_id,person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING person_id',
                [slot.targetMeetingId, invitee],
              );
              if (inserted.rowCount) await notify(db, invitee, `הוזמנת לפגישה ״${change.title}״.`);
            }
          }
          await db.query(
            'UPDATE meetings SET title=$2,description=$3,starts=$4,ends=$5,private=COALESCE($6,private),visit=COALESCE($7,visit),room_id=$8,version=version+1 WHERE id=$1',
            [
              slot.targetMeetingId,
              change.title,
              change.description,
              slot.start,
              slot.end,
              change.private ?? null,
              change.visit ?? null,
              change.roomId,
            ],
          );
        }
        if (original.organizerId !== actor.id)
          await notify(db, original.organizerId, 'סדרת הפגישות שלך עודכנה על ידי מנהל/ת.');
        return { id: original.id };
      }
      if (
        change.action === 'edit' &&
        actor.role === 'boss' &&
        original &&
        overlaps.some((meeting) => meeting.role === 'boss' && meeting.organizerId !== actor.id)
      ) {
        const existing = await db.query<{ person_id: number }>(
          'SELECT person_id FROM meeting_invitations WHERE meeting_id=$1',
          [original.id],
        );
        const invitees = (change.invitees ?? existing.rows.map((row) => row.person_id)).filter(
          (personId) => personId !== original!.organizerId,
        );
        const people = await db.query('SELECT id FROM people WHERE id=ANY($1::int[])', [invitees]);
        if (people.rowCount !== invitees.length)
          throw new BadRequestException('אחד המוזמנים לא נמצא במערכת');
        return makeBookingRequest(
          db,
          actor,
          {
            roomId: change.roomId,
            title: change.title,
            description: change.description,
            private: change.private ?? !!original.private,
            visit: change.visit ?? !!original.visit,
            invitees,
            recurring: false,
            slots: [
              {
                start: times![0],
                end: times![1],
                targetMeetingId: original.id,
                targetVersion: original.version,
                targetOrganizerId: original.organizerId,
              },
            ],
          },
          overlaps,
        );
      }
      if (
        actor.role === 'boss' &&
        overlaps.some((meeting) => meeting.role !== 'manager' && meeting.organizerId !== actor.id)
      )
        throw new ConflictException('נדרש אישור מבעלי הפגישות החופפות');
      const affected =
        original && original.organizerId !== actor.id ? [original, ...overlaps] : overlaps;
      // Confirmation is tied to this action and the current versions of affected meetings.
      requireReview(
        actor,
        change,
        [...(await visibleConflicts(db, actor, affected)), ...holds],
        token,
      );
      await overrideHolds();

      // Cancellation, notifications and the replacement meeting commit together.
      for (const meeting of overlaps) {
        await notifyInvitees(db, meeting.id, 'פגישה שהוזמנת אליה בוטלה.', actor.id);
        await db.query('DELETE FROM meetings WHERE id=$1', [meeting.id]);
        if (meeting.organizerId !== actor.id)
          await notify(
            db,
            meeting.organizerId,
            `הפגישה ״${meeting.title}״ בוטלה עקב הזמנה של ${actor.name} ${actor.surname}.`,
          );
      }
      await invalidateMeetingRequests(db, [
        ...overlaps.map((meeting) => meeting.id),
        ...(original ? [original.id] : []),
      ]);
      if (original && original.organizerId !== actor.id) {
        const verb = change.action === 'cancel' ? 'בוטלה' : 'עודכנה';
        await notify(
          db,
          original.organizerId,
          `הפגישה ״${original.title}״ ${verb} על ידי ${actor.name} ${actor.surname}.`,
        );
      }
      if (change.action === 'cancel') {
        await notifyInvitees(db, change.meetingId, 'פגישה שהוזמנת אליה בוטלה.', actor.id);
        await db.query('DELETE FROM meetings WHERE id=$1', [change.meetingId]);
        return { ok: true };
      }
      const values = [change.title, change.description, ...times!];
      await notifyInvitees(db, change.meetingId, 'פרטי פגישה שהוזמנת אליה עודכנו.', actor.id);
      if (change.invitees) {
        const invitees = change.invitees.filter((personId) => personId !== original!.organizerId);
        const people = await db.query('SELECT id FROM people WHERE id=ANY($1::int[])', [invitees]);
        if (people.rowCount !== invitees.length)
          throw new BadRequestException('אחד המוזמנים לא נמצא במערכת');
        await db.query(
          'DELETE FROM meeting_invitations WHERE meeting_id=$1 AND person_id<>ALL($2::int[])',
          [change.meetingId, invitees],
        );
        for (const invitee of invitees) {
          const inserted = await db.query(
            'INSERT INTO meeting_invitations(meeting_id,person_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING person_id',
            [change.meetingId, invitee],
          );
          if (inserted.rowCount) await notify(db, invitee, `הוזמנת לפגישה ״${change.title}״.`);
        }
      }
      const result = await db.query(
        'UPDATE meetings SET title=$1,description=$2,starts=$3,ends=$4,private=COALESCE($6,private),visit=COALESCE($7,visit),room_id=$8,version=version+1 WHERE id=$5 RETURNING id',
        [...values, change.meetingId, change.private ?? null, change.visit ?? null, change.roomId],
      );
      return result.rows[0];
    });
  }
}
