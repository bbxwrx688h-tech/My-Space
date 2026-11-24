import { z } from 'zod';
import { exchangeKinds, meetingScopes, recurrenceFrequencies } from '../model';
import { date, description, endTime, id, inviteesField, shortText, time } from './common';

export const meetingFields = z.object({
  roomId: id,
  date,
  from: time,
  until: endTime,
  title: shortText,
  description,
});

export const meetingTarget = z.object({ roomId: id, meetingId: id, version: id });

export const recurrence = z
  .object({
    frequency: z.enum(recurrenceFrequencies),
    endDate: date.optional(),
    count: z.number().int().min(1).optional(),
  })
  .refine((value) => (value.endDate === undefined) !== (value.count === undefined));

export const meetingCommand = z.discriminatedUnion('action', [
  meetingFields.extend({
    action: z.literal('create'),
    recurrence: recurrence.optional(),
    private: z.boolean().default(false),
    visit: z.boolean().default(false),
    invitees: inviteesField.default([]),
  }),
  meetingFields.merge(meetingTarget).extend({
    action: z.literal('edit'),
    scope: z.enum(meetingScopes).default('single'),
    private: z.boolean().optional(),
    visit: z.boolean().optional(),
    invitees: inviteesField.optional(),
  }),
  meetingTarget.extend({ action: z.literal('cancel') }),
]);

export const meetingChangeBody = z.object({
  change: meetingCommand,
  token: z.string().max(160).optional(),
});

export const meetingQuery = z.object({
  room: z.coerce.number().int().positive(),
  start: date,
});

export const meetingIdParam = z.object({ id });

export const requestDecisionBody = z.object({ requestId: id, approve: z.boolean() });
export const requestCancelBody = z.object({ requestId: id });
export const attendeeQuery = z.object({ meeting: z.coerce.number().int().positive() });
export const invitationDecisionBody = z.object({ meetingId: id, accept: z.boolean() });
export const seriesCancelBody = z.object({ seriesId: id, fromMeetingId: id.optional() });
export const exchangeCreateBody = z.object({
  kind: z.enum(exchangeKinds),
  meetingId: id,
  otherMeetingId: id.optional(),
});

export type MeetingFieldsInput = z.infer<typeof meetingFields>;
export type MeetingCommandInput = z.infer<typeof meetingCommand>;
export type MeetingChangeBody = z.infer<typeof meetingChangeBody>;
export type RequestDecisionInput = z.infer<typeof requestDecisionBody>;
export type RequestCancelInput = z.infer<typeof requestCancelBody>;
export type InvitationDecisionInput = z.infer<typeof invitationDecisionBody>;
export type SeriesCancelInput = z.infer<typeof seriesCancelBody>;
export type ExchangeCreateInput = z.infer<typeof exchangeCreateBody>;
