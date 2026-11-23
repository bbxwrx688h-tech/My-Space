import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { sites } from '../shared/model';

export const zone = 'Asia/Jerusalem';
export const today = () => DateTime.now().setZone(zone).toISODate()!;
export const site = z.enum(sites);
export const id = z.number().int().positive();
export const shortText = z.string().trim().min(1).max(150);
export const description = z.string().trim().min(1).max(2000);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => DateTime.fromISO(value, { zone }).isValid);
export const stationFields = z.object({
  site,
  room: shortText,
  os: z.enum(['Windows', 'Linux']),
  description,
});
export const selectedDays = z
  .array(date)
  .min(1)
  .refine((days) => new Set(days).size === days.length);

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const labels: Record<string, string> = {
      title: 'כותרת הפגישה',
      description: 'תיאור',
      room: 'מספר חדר',
      date: 'תאריך',
      from: 'שעת התחלה',
      until: 'שעת סיום',
      start: 'תאריך התחלה',
      end: 'תאריך סיום',
      site: 'אתר',
      os: 'מערכת הפעלה',
      days: 'ימים',
      upn: 'כתובת דוא״ל',
      name: 'שם פרטי',
      surname: 'שם משפחה',
      username: 'שם משתמש',
      password: 'סיסמה',
      invitees: 'מוזמנים',
      recurrence: 'חזרת הפגישה',
      frequency: 'תדירות החזרה',
      endDate: 'תאריך סיום הסדרה',
      count: 'מספר הפגישות בסדרה',
      supervisorId: 'ממונה',
      personId: 'עובד/ת',
    };
    const path = result.error.issues[0]?.path ?? [];
    const field = String([...path].reverse().find((part) => labels[String(part)]) ?? '');
    throw new BadRequestException(
      labels[field]
        ? `יש לבדוק את השדה ${labels[field]}`
        : 'הנתונים שהוזנו אינם תקינים. יש לבדוק את השדות.',
    );
  }
  return result.data;
}
