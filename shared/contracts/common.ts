import { z } from 'zod';
import { sites } from '../model';
import { local } from '../time';

export { today, zone } from '../time';

export const site = z.enum(sites);
export const id = z.number().int().positive();
export const shortText = z.string().trim().min(1).max(150);
export const description = z.string().trim().min(1).max(2000);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => local(value).isValid);
export const time = z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/);
export const endTime = z.union([time, z.literal('24:00')]);

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

export const inviteesField = z.array(id).refine((items) => new Set(items).size === items.length);

/** Hebrew field names used in validation errors, shared by API and UI. */
export const fieldLabels: Record<string, string> = {
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
