import { z } from 'zod';
import { assignableRoles } from '../model';
import { id, shortText, site, stationFields } from './common';

export const onboardingBody = z.object({
  site,
  station: stationFields.optional(),
});

export const noticeReadBody = z.object({ through: id });

export const peopleSearchQuery = z.object({
  q: z.string().trim().max(150).default(''),
});

export const roomBody = z.object({ site, name: shortText });

export const roleBody = z.object({
  personId: id,
  role: z.enum(assignableRoles),
});

export const supervisorBody = z.object({
  personId: id,
  supervisorId: id.nullable(),
});

export type OnboardingInput = z.infer<typeof onboardingBody>;
export type NoticeReadInput = z.infer<typeof noticeReadBody>;
export type PeopleSearchInput = z.infer<typeof peopleSearchQuery>;
export type RoomInput = z.infer<typeof roomBody>;
export type RoleInput = z.infer<typeof roleBody>;
export type SupervisorInput = z.infer<typeof supervisorBody>;
