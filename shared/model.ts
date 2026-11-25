export const sites = ['MBT', 'MID', 'MARP'] as const;
export type Site = (typeof sites)[number];

export const roles = ['user', 'manager', 'boss', 'admin'] as const;
export type Role = (typeof roles)[number];

// Administrators can assign all application roles to employees.
export const assignableRoles = ['user', 'manager', 'boss', 'admin'] as const;
export type AssignableRole = (typeof assignableRoles)[number];

export const stationOs = ['Windows', 'Linux'] as const;
export type StationOs = (typeof stationOs)[number];

export const offerDayStatuses = ['available', 'mine', 'occupied'] as const;
export type OfferDayStatus = (typeof offerDayStatuses)[number];

export const attendeeStatuses = ['pending', 'accepted', 'declined'] as const;
export type AttendeeStatus = (typeof attendeeStatuses)[number];

export const meetingRequestKinds = [
  'booking',
  'takeover',
  'edit',
  'boss_edit',
  'series_edit',
] as const;
export type MeetingRequestKind = (typeof meetingRequestKinds)[number];

export const exchangeKinds = ['release', 'swap'] as const;
export type ExchangeKind = (typeof exchangeKinds)[number];

export const meetingActions = ['create', 'edit', 'cancel'] as const;
export type MeetingAction = (typeof meetingActions)[number];

export const meetingScopes = ['single', 'following'] as const;
export type MeetingScope = (typeof meetingScopes)[number];

export const recurrenceFrequencies = ['daily', 'weekly'] as const;
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

export const stationDayActions = ['book', 'release', 'withdraw'] as const;
export type StationDayAction = (typeof stationDayActions)[number];

export interface Person {
  id: number;
  name: string;
  surname: string;
  upn: string;
  role: Role;
  site: Site | null;
  supervisorId: number | null;
}

export interface Room {
  id: number;
  name: string;
  site: Site;
}
export interface Station {
  id: number;
  ownerId: number;
  owner: string;
  site: Site;
  room: string;
  os: StationOs;
  description: string;
}
export interface OfferDay {
  date: string;
  status: OfferDayStatus;
}
export interface Offer {
  id: number;
  station: Station;
  note: string;
  days: OfferDay[];
}
export interface Meeting {
  id: number;
  roomId: number;
  organizerId: number;
  organizer: string;
  role: Role;
  title: string;
  description: string;
  start: string;
  end: string;
  version: number;
  private?: boolean;
  visit?: boolean;
  seriesId?: number | null;
  pending?: boolean;
  ownerSupervisorId?: number | null;
}
export interface DirectoryPerson {
  id: number;
  name: string;
  surname: string;
  upn: string;
}
export interface Attendee extends DirectoryPerson {
  status: AttendeeStatus;
}
export interface MeetingRequest {
  id: number;
  kind: MeetingRequestKind;
  requesterId: number;
  requester: string;
  title: string;
  description: string;
  visit: boolean;
  invitees: Array<{ id: number; name: string; surname: string }>;
  start: string;
  end: string;
  expires: string;
  myApproval: boolean | null;
  slots: Array<{ roomId: number; start: string; end: string }>;
  conflicts: Array<{
    meetingId: number;
    organizer: string;
    title: string;
    start: string;
    end: string;
  }>;
  targets: Array<{
    meetingId: number;
    organizer: string;
    title: string;
    roomId: number;
    start: string;
    end: string;
  }>;
}
export interface ExchangeRequest {
  id: number;
  kind: ExchangeKind;
  requesterId: number;
  requester: string;
  title: string;
  otherTitle: string | null;
  start: string;
  end: string;
  roomId: number;
  otherStart: string | null;
  otherEnd: string | null;
  otherRoomId: number | null;
  expires: string;
  myApproval: boolean | null;
}
export interface Invitation {
  id: number;
  title: string;
  start: string;
  end: string;
  roomId: number;
  organizer: string;
  private: boolean;
  visit: boolean;
}
export interface Notice {
  id: number;
  message: string;
  created: string;
  seen: boolean;
}
export interface Workspace {
  me: Person;
  rooms: Room[];
  stations: Station[];
  offers: Offer[];
  meetings: Meeting[];
  notices: Notice[];
}
export interface MeetingInput {
  roomId: number;
  date: string;
  from: string;
  until: string;
  title: string;
  description: string;
}
export interface Review {
  message: string;
  affected: Meeting[];
  token: string;
  waitSeconds: number;
}
