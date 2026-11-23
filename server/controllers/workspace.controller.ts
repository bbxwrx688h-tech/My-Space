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
import { z } from 'zod';
import { Person } from '../../shared/model';
import { Employee, personColumns, SessionGuard } from '../auth/session';
import { pool, transaction } from '../db/connection';
import { meetingSelect } from '../meetings/schedule';
import { addStation } from '../stations/station';
import { expireRequests, lockSchedule } from '../meetings/requests';
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
      pool.query(
        meetingSelect +
          ` WHERE (m.organizer_id=$1 OR EXISTS
        (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$1 AND i.status='accepted'))
        AND m.ends>now() ORDER BY m.starts`,
        [me.id],
      ),
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
  @Get('people/search') async searchPeople(@Employee() me: Person, @Query() query: unknown) {
    if (me.role === 'user') throw new ForbiddenException('אין הרשאה להזמין לפגישה');
    const { q } = parse(z.object({ q: z.string().trim().max(150).default('') }), query);
    if (!q) return [];
    // Treat wildcard characters literally and never return password or role data.
    const term = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    return (
      await pool.query(
        `SELECT id,name,surname,upn FROM people WHERE id<>$1
       AND (name || ' ' || surname ILIKE $2 OR upn ILIKE $2) ORDER BY name,surname,upn`,
        [me.id, term],
      )
    ).rows;
  }
  @Post('admin/rooms') async createRoom(@Employee() me: Person, @Body() body: unknown) {
    if (me.role !== 'admin') throw new ForbiddenException('נדרשת הרשאת ניהול');
    const input = parse(z.object({ site, name: z.string().trim().min(1).max(150) }), body);
    try {
      return await transaction(async (db) => {
        const room = await db.query(
          'INSERT INTO rooms(site,name) VALUES ($1,$2) RETURNING id,site,name',
          [input.site, input.name],
        );
        return room.rows[0];
      });
    } catch (error) {
      if (error instanceof ConflictException)
        throw new ConflictException('חדר בשם זה כבר קיים באתר שנבחר');
      throw error;
    }
  }
  @Post('admin/role') async role(@Employee() me: Person, @Body() body: unknown) {
    if (me.role !== 'admin') throw new ForbiddenException('נדרשת הרשאת ניהול');
    const input = parse(
      z.object({ personId: id, role: z.enum(['user', 'manager', 'boss']) }),
      body,
    );
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      // Serialize hierarchy changes so role changes cannot invalidate assignments.
      await db.query('SELECT pg_advisory_xact_lock(6349202)');
      const target = await db.query(
        "SELECT role FROM people WHERE id=$1 AND source<>'local' FOR UPDATE",
        [input.personId],
      );
      if (!target.rowCount) throw new NotFoundException('חשבון העובד לא נמצא');
      if (target.rows[0].role !== input.role) {
        const reports = await db.query('SELECT 1 FROM people WHERE supervisor_id=$1 LIMIT 1', [
          input.personId,
        ]);
        if (reports.rowCount)
          throw new ConflictException('יש לשייך מחדש את העובדים הכפופים לפני שינוי התפקיד');
        await db.query('UPDATE people SET role=$2,supervisor_id=NULL WHERE id=$1', [
          input.personId,
          input.role,
        ]);
        // A proposal created under an old role or affecting a changed role must be reviewed again.
        const invalidated = await db.query<{ requester_id: number }>(
          `UPDATE meeting_requests SET status='invalidated' WHERE status='pending' AND
           (requester_id=$1 OR id IN (SELECT request_id FROM meeting_request_conflicts WHERE organizer_id=$1)
             OR id IN (SELECT request_id FROM meeting_request_slots WHERE target_organizer_id=$1))
           RETURNING requester_id`,
          [input.personId],
        );
        for (const request of invalidated.rows)
          await db.query('INSERT INTO notices(person_id,message) VALUES ($1,$2)', [
            request.requester_id,
            'בקשת הפגישה בוטלה עקב שינוי בתפקיד.',
          ]);
        const exchanges = await db.query<{ requester_id: number }>(
          `UPDATE meeting_exchange_requests SET status='invalidated' WHERE status='pending'
           AND (requester_id=$1 OR first_owner_id=$1 OR second_owner_id=$1) RETURNING requester_id`,
          [input.personId],
        );
        for (const request of exchanges.rows)
          await db.query('INSERT INTO notices(person_id,message) VALUES ($1,$2)', [
            request.requester_id,
            'בקשת השחרור או ההחלפה בוטלה עקב שינוי בתפקיד.',
          ]);
      }
      return { ok: true };
    });
  }

  @Post('admin/supervisor') async supervisor(@Employee() me: Person, @Body() body: unknown) {
    if (me.role !== 'admin') throw new ForbiddenException('נדרשת הרשאת ניהול');
    const input = parse(z.object({ personId: id, supervisorId: id.nullable() }), body);
    return transaction(async (db) => {
      await lockSchedule(db);
      await expireRequests(db);
      await db.query('SELECT pg_advisory_xact_lock(6349202)');
      const employee = await db.query(
        "SELECT role,supervisor_id FROM people WHERE id=$1 AND source<>'local' FOR UPDATE",
        [input.personId],
      );
      if (!employee.rowCount) throw new NotFoundException('חשבון העובד לא נמצא');
      if (employee.rows[0].supervisor_id === input.supervisorId) return { ok: true };
      if (input.supervisorId !== null) {
        const supervisor = await db.query('SELECT role FROM people WHERE id=$1', [
          input.supervisorId,
        ]);
        const expected =
          employee.rows[0].role === 'user'
            ? 'manager'
            : employee.rows[0].role === 'manager'
              ? 'boss'
              : null;
        if (
          !expected ||
          supervisor.rows[0]?.role !== expected ||
          input.supervisorId === input.personId
        )
          throw new BadRequestException('יש לבחור ממונה בתפקיד המתאים');
      }
      await db.query('UPDATE people SET supervisor_id=$2 WHERE id=$1', [
        input.personId,
        input.supervisorId,
      ]);
      if (employee.rows[0].role === 'manager') {
        // A previous supervisor can no longer edit this manager's recurring series.
        const invalidated = await db.query<{ requester_id: number }>(
          `UPDATE meeting_requests SET status='invalidated' WHERE status='pending' AND kind IN ('series_edit','boss_edit')
           AND requester_id<>$1 AND requester_id IS DISTINCT FROM $2
           AND id IN (SELECT request_id FROM meeting_request_slots WHERE target_organizer_id=$1)
           RETURNING requester_id`,
          [input.personId, input.supervisorId],
        );
        for (const request of invalidated.rows)
          await db.query('INSERT INTO notices(person_id,message) VALUES ($1,$2)', [
            request.requester_id,
            'בקשת שינוי הסדרה בוטלה עקב שינוי הממונה.',
          ]);
        const pending = await db.query<{ id: number }>(
          "SELECT id FROM meeting_requests WHERE requester_id=$1 AND kind IN ('booking','edit') AND status='pending'",
          [input.personId],
        );
        for (const request of pending.rows) {
          await db.query('DELETE FROM meeting_request_approvals WHERE request_id=$1', [request.id]);
          if (employee.rows[0].supervisor_id !== null)
            await db.query('INSERT INTO notices(person_id,message) VALUES ($1,$2)', [
              employee.rows[0].supervisor_id,
              'בקשת פגישה הועברה לממונה אחר.',
            ]);
          if (input.supervisorId !== null) {
            await db.query(
              'INSERT INTO meeting_request_approvals(request_id,person_id) VALUES ($1,$2)',
              [request.id, input.supervisorId],
            );
            await db.query('INSERT INTO notices(person_id,message) VALUES ($1,$2)', [
              input.supervisorId,
              'הועברה אליך בקשת פגישה לאישור.',
            ]);
          }
          await db.query('INSERT INTO notices(person_id,message) VALUES ($1,$2)', [
            input.personId,
            'הממונה על בקשת הפגישה עודכן.',
          ]);
        }
      }
      return { ok: true };
    });
  }
}
