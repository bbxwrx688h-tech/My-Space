import { api } from './api';
import {
  Attendee,
  DirectoryPerson,
  ExchangeRequest,
  Invitation,
  Meeting,
  MeetingRequest,
  Person,
  Site,
  Workspace,
} from '../../shared/model';

type LoginBody = Record<string, FormDataEntryValue>;
type EmployeeOption = { upn: string; label: string };
type StationFieldsBody = {
  site: FormDataEntryValue | null;
  room: FormDataEntryValue | null;
  os: FormDataEntryValue | null;
  description: FormDataEntryValue | null;
};
type OnboardingBody = { site: Site; station: StationFieldsBody | undefined };
type CreateRoomBody = { name: string; site: string };
type SetRoleBody = { personId: number; role: 'user' | 'manager' | 'boss' };
type SetSupervisorBody = { personId: number; supervisorId: number | null };
type MeetingChange = Record<string, unknown>;
type MeetingChangeResponse = { pending?: boolean };
type ExchangeBody = {
  kind: 'release' | 'swap';
  meetingId: number;
  otherMeetingId?: number;
};
type PublishOfferBody = {
  stationId: number;
  start: string;
  end: string;
  note: FormDataEntryValue | null;
};
type ChangeDaysBody = {
  action: 'book' | 'release' | 'withdraw';
  offerId: number;
  days: string[];
};

export const endpoints = {
  auth: {
    options: () => api<{ employees: EmployeeOption[] }>('auth/options'),
    dev: (body: LoginBody) => api('auth/dev', body),
    admin: (body: LoginBody) => api('auth/admin', body),
    adfs: () => api('auth/adfs', {}),
    logout: () => api('auth/logout', {}),
  },
  workspace: {
    get: () => api<Workspace>('workspace'),
    onboard: (body: OnboardingBody) => api('onboarding', body),
    markNoticesRead: (through: number) => api('notices/read', { through }),
  },
  meetings: {
    list: (roomId: number, start: string) =>
      api<Meeting[]>('meetings?room=' + roomId + '&start=' + start),
    change: (change: MeetingChange, token?: string) =>
      api<MeetingChangeResponse>('meetings', { change, token }),
    requests: () => api<MeetingRequest[]>('meetings/requests'),
    invitations: () => api<Invitation[]>('meetings/invitations'),
    exchanges: () => api<ExchangeRequest[]>('meetings/exchange'),
    attendees: (meeting: number) => api<Attendee[]>('meetings/attendees?meeting=' + meeting),
    upcoming: () => api<Meeting[]>('meetings/upcoming'),
    cancelSeries: (body: { seriesId: number; fromMeetingId?: number }) =>
      api('meetings/series/cancel', body),
    exchange: (body: ExchangeBody) => api('meetings/exchange', body),
    invitationDecision: (body: { meetingId: number; accept: boolean }) =>
      api('meetings/invitations/decision', body),
    requestDecision: (body: { requestId: number; approve: boolean }) =>
      api('meetings/requests/decision', body),
    requestCancel: (body: { requestId: number }) => api('meetings/requests/cancel', body),
    exchangeDecision: (body: { requestId: number; approve: boolean }) =>
      api('meetings/exchange/decision', body),
  },
  stations: {
    create: (station: StationFieldsBody) => api('stations', station),
    publish: (body: PublishOfferBody) => api('stations/offers', body),
    days: (body: ChangeDaysBody) => api('stations/days', body),
  },
  people: {
    search: (q: string) => api<DirectoryPerson[]>('people/search?q=' + encodeURIComponent(q)),
  },
  users: {
    list: () => api<Person[]>('admin/users'),
    createRoom: (body: CreateRoomBody) => api('admin/rooms', body),
    setRole: (body: SetRoleBody) => api('admin/role', body),
    setSupervisor: (body: SetSupervisorBody) => api('admin/supervisor', body),
  },
};
