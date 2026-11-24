import { api } from './api';
import type { AdminLoginInput, DevLoginInput } from '@shared/contracts/auth';
import type { StationFieldsInput } from '@shared/contracts/common';
import type {
  ExchangeCreateInput,
  InvitationDecisionInput,
  MeetingCommandInput,
  RequestCancelInput,
  RequestDecisionInput,
  SeriesCancelInput,
} from '@shared/contracts/meeting';
import type { ChangeDaysInput, PublishOfferInput } from '@shared/contracts/station';
import type {
  OnboardingInput,
  RoomInput,
  RoleInput,
  SupervisorInput,
} from '@shared/contracts/workspace';
import {
  Attendee,
  DirectoryPerson,
  ExchangeRequest,
  Invitation,
  Meeting,
  MeetingRequest,
  Person,
  Workspace,
} from '@shared/model';

type EmployeeOption = { upn: string; label: string };
type MeetingChangeResponse = { pending?: boolean };

export const endpoints = {
  auth: {
    options: () => api<{ employees: EmployeeOption[] }>('auth/options'),
    dev: (body: DevLoginInput) => api('auth/dev', body),
    admin: (body: AdminLoginInput) => api('auth/admin', body),
    adfs: () => api('auth/adfs', {}),
    logout: () => api('auth/logout', {}),
  },
  workspace: {
    get: () => api<Workspace>('workspace'),
    onboard: (body: OnboardingInput) => api('onboarding', body),
    markNoticesRead: (through: number) => api('notices/read', { through }),
  },
  meetings: {
    list: (roomId: number, start: string) =>
      api<Meeting[]>('meetings?room=' + roomId + '&start=' + start),
    change: (change: MeetingCommandInput, token?: string) =>
      api<MeetingChangeResponse>('meetings', { change, token }),
    requests: () => api<MeetingRequest[]>('meetings/requests'),
    invitations: () => api<Invitation[]>('meetings/invitations'),
    exchanges: () => api<ExchangeRequest[]>('meetings/exchange'),
    attendees: (meeting: number) => api<Attendee[]>('meetings/attendees?meeting=' + meeting),
    upcoming: () => api<Meeting[]>('meetings/upcoming'),
    cancelSeries: (body: SeriesCancelInput) => api('meetings/series/cancel', body),
    exchange: (body: ExchangeCreateInput) => api('meetings/exchange', body),
    invitationDecision: (body: InvitationDecisionInput) =>
      api('meetings/invitations/decision', body),
    requestDecision: (body: RequestDecisionInput) => api('meetings/requests/decision', body),
    requestCancel: (body: RequestCancelInput) => api('meetings/requests/cancel', body),
    exchangeDecision: (body: RequestDecisionInput) => api('meetings/exchange/decision', body),
  },
  stations: {
    create: (station: StationFieldsInput) => api('stations', station),
    publish: (body: PublishOfferInput) => api('stations/offers', body),
    days: (body: ChangeDaysInput) => api('stations/days', body),
  },
  people: {
    search: (q: string) => api<DirectoryPerson[]>('people/search?q=' + encodeURIComponent(q)),
  },
  users: {
    list: () => api<Person[]>('admin/users'),
    createRoom: (body: RoomInput) => api('admin/rooms', body),
    setRole: (body: RoleInput) => api('admin/role', body),
    setSupervisor: (body: SupervisorInput) => api('admin/supervisor', body),
  },
};
