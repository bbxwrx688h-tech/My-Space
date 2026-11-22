import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { MeetingInput, Role } from '../../shared/model';
import { zone } from '../validation';

export function interval(
  input: MeetingInput,
  role: Role,
  now = DateTime.now().setZone(zone),
  originalStart?: string,
) {
  const day = DateTime.fromISO(input.date, { zone });
  const parseTime = (time: string) => {
    if (time === '24:00') return day.plus({ days: 1 }).startOf('day');
    const local = DateTime.fromISO(input.date + 'T' + time, { zone });
    if (!local.isValid || local.toFormat('HH:mm') !== time) {
      throw new BadRequestException('השעה אינה קיימת בשעון ירושלים');
    }
    // At the autumn clock change, consistently choose the first occurrence.
    return local.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0];
  };
  const start = parseTime(input.from);
  const end = parseTime(input.until);
  const keepsOngoingStart = originalStart && start.toMillis() === new Date(originalStart).getTime();
  if (
    [5, 6].includes(day.weekday) ||
    (start < now && !keepsOngoingStart) ||
    end <= start ||
    end <= now
  ) {
    throw new BadRequestException('יש לבחור מועד עתידי בימים ראשון עד חמישי ושעת סיום אחרי ההתחלה');
  }
  if (role !== 'boss' && day.startOf('day') > now.plus({ months: 1 }).endOf('day')) {
    throw new BadRequestException('ניתן להזמין עד חודש מראש');
  }
  return [start.toUTC().toISO()!, end.toUTC().toISO()!] as const;
}

export const meetingSelect = `SELECT m.id, m.room_id AS "roomId", m.organizer_id AS "organizerId",
  p.name || ' ' || p.surname AS organizer, p.role, m.title, m.description,
  m.starts AS start, m.ends AS "end", m.version FROM meetings m JOIN people p ON p.id=m.organizer_id`;
