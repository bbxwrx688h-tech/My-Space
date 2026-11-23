import { PoolClient } from 'pg';
import { Meeting, Person } from '../../shared/model';

// Conflict previews must follow the same privacy rules as the calendar.
export async function visibleConflicts(db: PoolClient, viewer: Person, meetings: Meeting[]) {
  if (viewer.role === 'admin' || meetings.length === 0) return meetings;
  const allowed = await db.query<{ id: number }>(
    `SELECT m.id FROM meetings m JOIN people p ON p.id=m.organizer_id WHERE m.id=ANY($1::int[])
     AND (m.organizer_id=$2 OR (p.role='manager' AND $3='boss' AND p.supervisor_id=$2) OR EXISTS
       (SELECT 1 FROM meeting_invitations i WHERE i.meeting_id=m.id AND i.person_id=$2 AND i.status<>'declined'))`,
    [meetings.map((meeting) => meeting.id), viewer.id, viewer.role],
  );
  const visible = new Set(allowed.rows.map((row) => row.id));
  return meetings.map((meeting) =>
    meeting.private && !visible.has(meeting.id)
      ? { ...meeting, title: 'פגישה פרטית', description: '', visit: false }
      : meeting,
  );
}
