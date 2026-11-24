import { z } from 'zod';
import { stationDayActions } from '../model';
import { date, id, selectedDays } from './common';

export const publishOfferBody = z.object({
  stationId: id,
  start: date,
  end: date,
  note: z.string().trim().max(2000),
});

export const changeDaysBody = z.object({
  action: z.enum(stationDayActions),
  offerId: id,
  days: selectedDays,
});

export type PublishOfferInput = z.infer<typeof publishOfferBody>;
export type ChangeDaysInput = z.infer<typeof changeDaysBody>;
