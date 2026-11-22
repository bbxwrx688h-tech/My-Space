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
import { notify, pool, transaction } from '../db/connection';
import { date, description, id, parse, shortText, zone } from '../validation';
import { interval, meetingSelect } from '../meetings/schedule';
import { requireReview } from '../meetings/review';

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
const target = z.object({ roomId: id, meetingId: id, version: id });
const command = z.discriminatedUnion('action', [
  fields.extend({ action: z.literal('create') }),
  fields.merge(target).extend({ action: z.literal('edit') }),
  target.extend({ action: z.literal('cancel') }),
]);

@Controller('meetings')
@UseGuards(SessionGuard)
export class MeetingsController {
  @Get() async list(@Query() query: unknown) {
    const { room, start } = parse(
      z.object({ room: z.coerce.number().int().positive(), start: date }),
      query,
    );
    const first = DateTime.fromISO(start, { zone });
    const result = await pool.query(
      meetingSelect + ` WHERE m.room_id=$1 AND m.ends>$2 AND m.starts<$3 ORDER BY m.starts`,
      [room, first.toJSDate(), first.plus({ days: 14 }).toJSDate()],
    );
    return result.rows;
  }

  @Post() async change(@Employee() requester: Person, @Body() body: unknown) {
    const { change, token } = parse(
      z.object({ change: command, token: z.string().max(160).optional() }),
      body,
    );
    return transaction(async (db) => {
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
      let original: Meeting | undefined;
      if (change.action !== 'create') {
        original = (
          await db.query<Meeting>(
            meetingSelect + ' WHERE m.id=$1 AND m.room_id=$2 FOR SHARE OF p',
            [change.meetingId, change.roomId],
          )
        ).rows[0];
        if (!original) throw new NotFoundException('הפגישה אינה קיימת');
        if (original.organizerId !== actor.id && actor.role !== 'boss')
          throw new ForbiddenException('אין הרשאה לשנות את הפגישה');
        if (original.version !== change.version)
          throw new ConflictException('פרטי הפגישה השתנו. יש לפתוח אותה מחדש.');
        if (new Date(original.end).getTime() <= Date.now())
          throw new BadRequestException('הפגישה כבר הסתיימה');
      }

      const times =
        change.action === 'cancel'
          ? null
          : interval(change, actor.role, undefined, original?.start);
      // Intervals are half-open: a meeting can start exactly when another ends.
      const overlaps = times
        ? (
            await db.query<Meeting>(
              meetingSelect +
                ` WHERE m.room_id=$1
        AND m.starts<$3 AND m.ends>$2 AND m.id<>$4 ORDER BY m.id FOR SHARE OF p`,
              [change.roomId, ...times, original?.id || 0],
            )
          ).rows
        : [];
      if (overlaps.length && actor.role !== 'boss')
        throw new ConflictException('חדר הישיבות תפוס במועד שנבחר');
      const affected =
        original && original.organizerId !== actor.id ? [original, ...overlaps] : overlaps;
      // Confirmation is tied to this action and the current versions of affected meetings.
      requireReview(actor, change, affected, token);

      // Cancellation, notifications and the replacement meeting commit together.
      for (const meeting of overlaps) {
        await db.query('DELETE FROM meetings WHERE id=$1', [meeting.id]);
        if (meeting.organizerId !== actor.id)
          await notify(
            db,
            meeting.organizerId,
            `הפגישה ״${meeting.title}״ בוטלה עקב הזמנה של ${actor.name} ${actor.surname}.`,
          );
      }
      if (original && original.organizerId !== actor.id) {
        const verb = change.action === 'cancel' ? 'בוטלה' : 'עודכנה';
        await notify(
          db,
          original.organizerId,
          `הפגישה ״${original.title}״ ${verb} על ידי ${actor.name} ${actor.surname}.`,
        );
      }
      if (change.action === 'cancel') {
        await db.query('DELETE FROM meetings WHERE id=$1', [change.meetingId]);
        return { ok: true };
      }
      const values = [change.title, change.description, ...times!];
      const result =
        change.action === 'edit'
          ? await db.query(
              'UPDATE meetings SET title=$1,description=$2,starts=$3,ends=$4,version=version+1 WHERE id=$5 RETURNING id',
              [...values, change.meetingId],
            )
          : await db.query(
              'INSERT INTO meetings(title,description,starts,ends,room_id,organizer_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
              [...values, change.roomId, actor.id],
            );
      return result.rows[0];
    });
  }
}
