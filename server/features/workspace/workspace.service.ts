import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { Person } from '../../../shared/model';
import {
  noticeReadBody,
  onboardingBody,
  peopleSearchQuery,
  roleBody,
  roomBody,
  supervisorBody,
} from '../../../shared/contracts/workspace';
import { personColumns } from '../../auth/session';
import { errors } from '../../common/errors';
import { messages } from '../../common/notifications/messages';
import { NotificationService } from '../../common/notifications/notification.service';
import { pool, transaction } from '../../db/connection';
import { withRequestExpiry } from '../../meetings/requests';
import { addStation } from '../../stations/station';

type Onboarding = z.infer<typeof onboardingBody>;
type NoticeRead = z.infer<typeof noticeReadBody>;
type PeopleSearch = z.infer<typeof peopleSearchQuery>;
type Room = z.infer<typeof roomBody>;
type Role = z.infer<typeof roleBody>;
type Supervisor = z.infer<typeof supervisorBody>;

/** Setup, directory, notices and administration workflows for the workspace. */
@Injectable()
export class WorkspaceService {
  constructor(private readonly notifications: NotificationService) {}

  onboard(me: Person, input: Onboarding) {
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

  async markRead(me: Person, input: NoticeRead) {
    const { through } = input;
    // Newer notifications that arrived after the screen loaded remain unread.
    await pool.query('UPDATE notices SET seen=true WHERE person_id=$1 AND id<=$2 AND NOT seen', [
      me.id,
      through,
    ]);
    return { ok: true };
  }

  async users(me: Person) {
    if (me.role !== 'admin') throw new ForbiddenException(errors.adminRequired);
    return (
      await pool.query(
        `SELECT ${personColumns} FROM people p WHERE source<>'local' ORDER BY name,surname`,
      )
    ).rows;
  }

  async searchPeople(me: Person, input: PeopleSearch) {
    if (me.role === 'user') throw new ForbiddenException('אין הרשאה להזמין לפגישה');
    const { q } = input;
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

  async createRoom(me: Person, input: Room) {
    if (me.role !== 'admin') throw new ForbiddenException(errors.adminRequired);
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

  // The session may have been authenticated before a concurrent demotion.
  private async requireCurrentAdmin(db: PoolClient, personId: number) {
    const actor = await db.query('SELECT role FROM people WHERE id=$1', [personId]);
    if (actor.rows[0]?.role !== 'admin') throw new ForbiddenException(errors.adminRequired);
  }

  role(me: Person, input: Role) {
    if (me.role !== 'admin') throw new ForbiddenException(errors.adminRequired);
    return transaction(async (db) => {
      return withRequestExpiry(db, async () => {
        // Serialize hierarchy changes so role changes cannot invalidate assignments.
        await db.query('SELECT pg_advisory_xact_lock(6349202)');
        await this.requireCurrentAdmin(db, me.id);
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
            await this.notifications.send(
              db,
              request.requester_id,
              messages.meetingRequestCanceledAfterRoleChangeNotice,
            );
          const exchanges = await db.query<{ requester_id: number }>(
            `UPDATE meeting_exchange_requests SET status='invalidated' WHERE status='pending'
           AND (requester_id=$1 OR first_owner_id=$1 OR second_owner_id=$1) RETURNING requester_id`,
            [input.personId],
          );
          for (const request of exchanges.rows)
            await this.notifications.send(
              db,
              request.requester_id,
              messages.exchangeRequestCanceledAfterRoleChange,
            );
        }
        return { ok: true };
      });
    });
  }

  supervisor(me: Person, input: Supervisor) {
    if (me.role !== 'admin') throw new ForbiddenException(errors.adminRequired);
    return transaction(async (db) => {
      return withRequestExpiry(db, async () => {
        await db.query('SELECT pg_advisory_xact_lock(6349202)');
        await this.requireCurrentAdmin(db, me.id);
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
            await this.notifications.send(
              db,
              request.requester_id,
              messages.meetingSeriesRequestCanceledAfterSupervisorChange,
            );
          const pending = await db.query<{ id: number }>(
            "SELECT id FROM meeting_requests WHERE requester_id=$1 AND kind IN ('booking','edit') AND status='pending'",
            [input.personId],
          );
          for (const request of pending.rows) {
            await db.query('DELETE FROM meeting_request_approvals WHERE request_id=$1', [
              request.id,
            ]);
            if (employee.rows[0].supervisor_id !== null)
              await this.notifications.send(
                db,
                employee.rows[0].supervisor_id,
                messages.meetingRequestForwardedToNewSupervisor,
              );
            if (input.supervisorId !== null) {
              await db.query(
                'INSERT INTO meeting_request_approvals(request_id,person_id) VALUES ($1,$2)',
                [request.id, input.supervisorId],
              );
              await this.notifications.send(
                db,
                input.supervisorId,
                messages.meetingRequestApprovalAssignedToSupervisor,
              );
            }
            await this.notifications.send(
              db,
              input.personId,
              messages.meetingRequestSupervisorUpdated,
            );
          }
        }
        return { ok: true };
      });
    });
  }
}
