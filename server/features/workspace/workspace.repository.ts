import { Injectable } from '@nestjs/common';
import { Person, Workspace } from '../../../shared/model';
import { pool } from '../../db/connection';
import { meetingSelect } from '../../meetings/schedule';
import { today } from '../../../shared/time';

const stationSelect = `SELECT s.id,s.owner_id AS "ownerId",p.name || ' ' || p.surname AS owner,
  s.site,s.room,s.os,s.description FROM stations s JOIN people p ON p.id=s.owner_id`;

/** Read-side queries for the workspace dashboard. */
@Injectable()
export class WorkspaceRepository {
  async read(me: Person): Promise<Workspace> {
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
        'SELECT id,message,created,seen,target_type AS "targetType",target_id AS "targetId" FROM notices WHERE person_id=$1 ORDER BY id DESC',
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
}
