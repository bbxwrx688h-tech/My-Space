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
  if (!result.success)
    throw new BadRequestException('הנתונים שהוזנו אינם תקינים. יש לבדוק את השדות.');
  return result.data;
}
