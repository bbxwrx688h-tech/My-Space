export const sites = ['MBT', 'MID', 'MARP'] as const;
export type Site = (typeof sites)[number];
export type Role = 'user' | 'boss' | 'admin';

export interface Person {
  id: number;
  name: string;
  surname: string;
  upn: string;
  role: Role;
  site: Site | null;
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
  os: 'Windows' | 'Linux';
  description: string;
}
export interface OfferDay {
  date: string;
  status: 'available' | 'mine' | 'occupied';
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
