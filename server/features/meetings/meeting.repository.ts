import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Meeting, Person } from '../../../shared/model';
import { pool, transaction } from '../../db/connection';
import { expireRequests, lockSchedule } from '../../meetings/requests';
import { meetingSelect } from '../../meetings/schedule';
import { visibleConflicts } from '../../meetings/visibility';
import { concealPrivateMeeting } from '../../common/visibility/privacy';
import { zone } from '../../../shared/time';

/** Read-side queries for meetings, requests, invitations and attendees. */
@Injectable()
export class MeetingRepository {
  async listRoom(room: number, start: string, viewer: Person) {
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
      const meetings = result.rows.map((meeting: Meeting) =>
        meeting.private && !visible.has(meeting.id) ? concealPrivateMeeting(meeting) : meeting,
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

  async listRequests(me: Person) {
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

  async listInvitations(me: Person) {
    const result = await pool.query(
      `SELECT m.id,m.title,m.starts AS start,m.ends AS "end",m.room_id AS "roomId",m.private,m.visit,
       p.name || ' ' || p.surname AS organizer,i.status FROM meeting_invitations i
       JOIN meetings m ON m.id=i.meeting_id JOIN people p ON p.id=m.organizer_id
       WHERE i.person_id=$1 AND i.status='pending' AND m.ends>now() ORDER BY m.starts`,
      [me.id],
    );
    return result.rows;
  }

  async findAttendeeContext(meetingId: number, viewerId: number) {
    return (
      await pool.query(
        `SELECT m.private,m.organizer_id,p.supervisor_id,p.role AS owner_role,
       EXISTS (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$2 AND i.status<>'declined') AS invited
       FROM meetings m JOIN people p ON p.id=m.organizer_id WHERE m.id=$1`,
        [meetingId, viewerId],
      )
    ).rows[0];
  }

  async listAttendees(meetingId: number) {
    return (
      await pool.query(
        `SELECT p.id,p.name,p.surname,p.upn,i.status FROM meeting_invitations i JOIN people p ON p.id=i.person_id
       WHERE i.meeting_id=$1 ORDER BY p.name,p.surname,p.upn`,
        [meetingId],
      )
    ).rows;
  }

  async listUpcoming(viewer: Person) {
    return transaction(async (db) => {
      const meetings = (
        await db.query<Meeting>(meetingSelect + ' WHERE m.starts>now() ORDER BY m.starts')
      ).rows;
      return visibleConflicts(db, viewer, meetings);
    });
  }

  async listExchanges(me: Person) {
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
}
