import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Person } from '../../shared/model';
import { Employee, personColumns, SessionGuard } from '../auth/session';
import { pool, transaction } from '../db/connection';
import { meetingSelect } from '../meetings/schedule';
import { addStation } from '../stations/station';
import { id, parse, site, stationFields, today } from '../validation';

const stationSelect = `SELECT s.id,s.owner_id AS "ownerId",p.name || ' ' || p.surname AS owner,
  s.site,s.room,s.os,s.description FROM stations s JOIN people p ON p.id=s.owner_id`;

@Controller()
@UseGuards(SessionGuard)
export class WorkspaceController {
  @Get('workspace') async read(@Employee() me: Person) {
    const [rooms, stations, offers, meetings, notices] = await Promise.all([
      pool.query('SELECT * FROM rooms ORDER BY site,name'),
      pool.query(stationSelect + ' WHERE s.owner_id=$1 ORDER BY s.id', [me.id]),
      // Offers are returned across every site. A home site does not limit where
      // an employee may borrow a station.
      // Other borrowers stay anonymous. The viewer can recognize their own bookings.
      pool.query(
        `SELECT o.id,o.note,to_jsonb(station) AS station,
        json_agg(json_build_object('date',d.day::text,'status',CASE
          WHEN d.borrower_id=$1 THEN 'mine' WHEN d.borrower_id IS NULL THEN 'available'
          ELSE 'occupied' END) ORDER BY d.day) AS days
        FROM offers o JOIN (${stationSelect}) station ON station.id=o.station_id
        JOIN offer_days d ON d.offer_id=o.id WHERE d.day >= $2::date
        GROUP BY o.id,station ORDER BY min(d.day),o.id`,
        [me.id, today()],
      ),
      pool.query(meetingSelect + ' WHERE organizer_id=$1 AND ends>now() ORDER BY starts', [me.id]),
      pool.query(
        'SELECT id,message,created,seen FROM notices WHERE person_id=$1 ORDER BY id DESC',
        [me.id],
      ),
    ]);
    return {
      me,
      rooms: rooms.rows,
      stations: stations.rows,
      offers: offers.rows,
      meetings: meetings.rows,
      notices: notices.rows,
    };
  }

  @Post('onboarding') onboard(@Employee() me: Person, @Body() body: unknown) {
    const input = parse(z.object({ site, station: stationFields.optional() }), body);
    return transaction(async (db) => {
      // Updating only an unset site makes onboarding safe against repeat submissions.
      const result = await db.query('UPDATE people SET site=$2 WHERE id=$1 AND site IS NULL', [
        me.id,
        input.site,
      ]);
      if (!result.rowCount) throw new ConflictException('ההגדרה הראשונית כבר הושלמה');
      if (input.station) await addStation(db, me.id, input.station);
      return { ok: true };
    });
  }

  @Post('notices/read') async markRead(@Employee() me: Person, @Body() body: unknown) {
    const { through } = parse(z.object({ through: id }), body);
    // Newer notifications that arrived after the screen loaded remain unread.
    await pool.query('UPDATE notices SET seen=true WHERE person_id=$1 AND id<=$2 AND NOT seen', [
      me.id,
      through,
    ]);
    return { ok: true };
  }

  @Get('admin/users') async users(@Employee() me: Person) {
    if (me.role !== 'admin') throw new ForbiddenException('נדרשת הרשאת ניהול');
    return (
      await pool.query(
        `SELECT ${personColumns} FROM people p WHERE source<>'local' ORDER BY name,surname`,
      )
    ).rows;
  }
  @Post('admin/role') async role(@Employee() me: Person, @Body() body: unknown) {
    if (me.role !== 'admin') throw new ForbiddenException('נדרשת הרשאת ניהול');
    const input = parse(z.object({ personId: id, role: z.enum(['user', 'boss']) }), body);
    const result = await pool.query("UPDATE people SET role=$2 WHERE id=$1 AND source<>'local'", [
      input.personId,
      input.role,
    ]);
    if (!result.rowCount) throw new NotFoundException('חשבון העובד לא נמצא');
    return { ok: true };
  }
}
